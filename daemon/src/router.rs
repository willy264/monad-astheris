use crate::{config::Config, store::Store};
use alloy::{
    network::{EthereumWallet, TransactionBuilder},
    primitives::{keccak256, Address, Bytes, Signature, B256, U256},
    providers::{DynProvider, Provider, ProviderBuilder},
    rpc::types::TransactionRequest,
    signers::local::PrivateKeySigner,
    sol,
    sol_types::{eip712_domain, SolCall, SolStruct},
};
use anyhow::{bail, ensure, Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::{Mutex, Semaphore};

pub const CHAIN_ID: u64 = 10143;

sol! {
    #[sol(rpc)]
    interface AetherisRouter {
        function createShard(uint256 agentId, bytes32 taskId, uint256 sequenceNonce, address executor, bytes32 inputHash) external returns (address);
        function executeTask(address shard, bytes32 outputHash, bytes32 proofHash) external;
        function predictShardAddress(uint256 agentId, bytes32 taskId, uint256 sequenceNonce, address executor, bytes32 inputHash) external view returns (address);
        function isAuthorized(uint256 agentId, address account) external view returns (bool);
        function commitMerkleBatch(bytes32 batchId, bytes32 root, uint256 leafCount, uint256 fromBlock, uint256 toBlock) external;
        event ShardCreated(address indexed shard, uint256 indexed agentId, bytes32 indexed taskId, uint256 sequenceNonce, address executor, bytes32 inputHash);
        event TaskExecuted(address indexed shard, uint256 indexed agentId, bytes32 indexed taskId, bytes32 inputHash, bytes32 outputHash, bytes32 proofHash);
        event MerkleBatchCommitted(bytes32 indexed batchId, bytes32 root, uint256 leafCount, uint256 fromBlock, uint256 toBlock);
    }

    struct TaskAuthorization {
        uint256 agentId;
        bytes32 taskId;
        uint256 sequenceNonce;
        bytes32 inputHash;
        bytes32 outputHash;
        bytes32 proofHash;
        address executor;
        uint64 deadline;
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskRequest {
    pub agent_id: String,
    pub task_id: B256,
    pub sequence_nonce: String,
    pub input_hash: B256,
    pub output_hash: B256,
    pub proof_hash: B256,
    pub executor: Address,
    pub deadline: u64,
    pub authorization: String,
}

impl TaskRequest {
    pub fn typed(&self) -> Result<TaskAuthorization> {
        Ok(TaskAuthorization {
            agentId: self.agent_id.parse().context("agentId must be uint256")?,
            taskId: self.task_id,
            sequenceNonce: self
                .sequence_nonce
                .parse()
                .context("sequenceNonce must be uint256")?,
            inputHash: self.input_hash,
            outputHash: self.output_hash,
            proofHash: self.proof_hash,
            executor: self.executor,
            deadline: self.deadline,
        })
    }

    pub fn digest(&self, router: Address) -> Result<B256> {
        Ok(self.typed()?.eip712_signing_hash(&eip712_domain! {
            name: "AetherisTask", version: "1", chain_id: CHAIN_ID, verifying_contract: router,
        }))
    }

    pub fn canonical_key(&self, router: Address) -> Result<String> {
        let typed = self.typed()?;
        Ok(format!(
            "task:{CHAIN_ID}:{router}:{}",
            storage_salt(typed.agentId, typed.taskId, typed.sequenceNonce)
        ))
    }

    /// A refreshed authorization must not turn the same execution into another bill.
    pub fn intent_hash(&self, router: Address) -> Result<B256> {
        let mut typed = self.typed()?;
        typed.deadline = 0;
        Ok(typed.eip712_signing_hash(&eip712_domain! {
            name:"AetherisTask",version:"1",chain_id:CHAIN_ID,verifying_contract:router,
        }))
    }

    pub fn signer(&self, router: Address, now: u64) -> Result<Address> {
        ensure!(
            self.deadline >= now && self.deadline <= now.saturating_add(600),
            "authorization expired or more than 10 minutes in future"
        );
        ensure!(
            self.task_id != B256::ZERO
                && self.input_hash != B256::ZERO
                && self.output_hash != B256::ZERO,
            "taskId and input/output hashes must be nonzero"
        );
        let signature: Signature = self
            .authorization
            .parse()
            .context("invalid task signature")?;
        ensure!(
            signature.normalize_s().is_none(),
            "noncanonical task signature"
        );
        Ok(signature.recover_address_from_prehash(&self.digest(router)?)?)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskResult {
    pub shard: Address,
    pub salt: B256,
    pub create_tx: B256,
    pub execution_tx: B256,
}

pub struct Relayer {
    pub address: Address,
    provider: DynProvider,
    /// Locks a signer until receipt resolution. Different signers submit in parallel.
    lock: Mutex<()>,
}

pub struct Engine {
    pub provider: DynProvider,
    pub router: Address,
    pub relayers: Vec<Relayer>,
    pub permits: Arc<Semaphore>,
    pub confirmations: u64,
    pub store: Store,
    pub http: reqwest::Client,
    pub rpc_url: String,
}

impl Engine {
    pub async fn connect(config: &Config, store: Store) -> Result<Arc<Self>> {
        let url: reqwest::Url = config.rpc_url.parse()?;
        let rpc_client = alloy::transports::http::reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .build()?;
        let provider = ProviderBuilder::new()
            .connect_reqwest(rpc_client.clone(), url.clone())
            .erased();
        ensure!(
            provider.get_chain_id().await? == CHAIN_ID,
            "RPC is not Monad Testnet (10143)"
        );
        ensure!(
            !provider.get_code_at(config.router).await?.is_empty(),
            "router has no deployed bytecode"
        );
        let mut relayers = Vec::new();
        let mut addresses = HashSet::new();
        for key in &config.private_keys {
            let signer: PrivateKeySigner = key.parse().context("invalid relayer private key")?;
            let address = signer.address();
            ensure!(
                addresses.insert(address),
                "duplicate relayer key would break nonce isolation"
            );
            let wallet = EthereumWallet::from(signer);
            let signed = ProviderBuilder::new()
                .wallet(wallet)
                .connect_reqwest(rpc_client.clone(), url.clone())
                .erased();
            relayers.push(Relayer {
                address,
                provider: signed,
                lock: Mutex::new(()),
            });
        }
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()?;
        Ok(Arc::new(Self {
            provider,
            router: config.router,
            relayers,
            permits: Arc::new(Semaphore::new(config.max_inflight)),
            confirmations: config.confirmations,
            store,
            http,
            rpc_url: config.rpc_url.clone(),
        }))
    }

    pub fn addresses(&self) -> Vec<Address> {
        self.relayers.iter().map(|r| r.address).collect()
    }

    pub async fn validate(&self, task: &TaskRequest) -> Result<Address> {
        let client = task.signer(self.router, unix_seconds()?)?;
        let id = task.typed()?.agentId;
        ensure!(
            self.relayers.iter().any(|r| r.address == task.executor),
            "executor is not a configured relayer"
        );
        let contract = AetherisRouter::new(self.router, &self.provider);
        let client_call = contract.isAuthorized(id, client);
        let relayer_call = contract.isAuthorized(id, task.executor);
        let (client_allowed, relayer_allowed) =
            tokio::try_join!(client_call.call(), relayer_call.call())?;
        ensure!(
            client_allowed && relayer_allowed,
            "client and relayer must be active agent owner/delegates"
        );
        Ok(client)
    }

    /// Persist the tx hash before waiting. A timeout never triggers a replacement submission.
    async fn send(&self, relayer: &Relayer, data: Vec<u8>, journal_key: String) -> Result<B256> {
        let signer_state_key = format!("relayer:{}:broadcast-state", relayer.address);
        if let Some(Some(previous)) = self
            .store
            .get::<Option<serde_json::Value>>(signer_state_key.clone())
            .await?
        {
            let hash: B256 = previous["hash"].as_str().context("relayer has an ambiguous prior broadcast; reconcile its recorded nonce before further transactions")?.parse()?;
            // A confirmed revert also consumes the nonce and releases the signer.
            self.wait_receipt(relayer, hash).await?;
            self.store
                .put(signer_state_key.clone(), &Option::<serde_json::Value>::None)
                .await?;
        }
        if let Some(hash) = self.store.get::<B256>(journal_key.clone()).await? {
            return self.confirm(relayer, hash).await;
        }
        // An exclusive signer per process is required. Pending nonce accounts for outstanding txs.
        let nonce = relayer
            .provider
            .get_transaction_count(relayer.address)
            .pending()
            .await?;
        let broadcast_key = format!("{journal_key}:broadcast-intent");
        let intent = serde_json::json!({"nonce":nonce,"sender":relayer.address,"router":self.router,"calldataHash":keccak256(&data)});
        ensure!(self.store.reserve(broadcast_key,&intent).await?, "prior broadcast intent has no durable transaction hash; reconcile signer nonce before any retry");
        self.store
            .put(
                signer_state_key.clone(),
                &Some(serde_json::json!({"nonce":nonce,"journalKey":journal_key,"hash":null})),
            )
            .await?;
        let tx = TransactionRequest::default()
            .with_to(self.router)
            .with_input(Bytes::from(data))
            .with_chain_id(CHAIN_ID)
            .with_nonce(nonce)
            .with_from(relayer.address);
        let pending = relayer.provider.send_transaction(tx).await?;
        let hash = *pending.tx_hash();
        self.store.put(journal_key, &hash).await?;
        self.store
            .put(
                signer_state_key.clone(),
                &Some(serde_json::json!({"nonce":nonce,"hash":hash})),
            )
            .await?;
        let success = self.wait_receipt(relayer, hash).await?;
        self.store
            .put(signer_state_key, &Option::<serde_json::Value>::None)
            .await?;
        ensure!(success, "transaction reverted: {hash}");
        Ok(hash)
    }

    async fn confirm(&self, relayer: &Relayer, hash: B256) -> Result<B256> {
        ensure!(
            self.wait_receipt(relayer, hash).await?,
            "transaction reverted: {hash}"
        );
        Ok(hash)
    }

    async fn wait_receipt(&self, relayer: &Relayer, hash: B256) -> Result<bool> {
        for _ in 0..240 {
            if let Some(receipt) = relayer.provider.get_transaction_receipt(hash).await? {
                let block = receipt.block_number.context("receipt has no block")?;
                let head = relayer.provider.get_block_number().await?;
                if head >= block.saturating_add(self.confirmations) {
                    return Ok(receipt.status());
                }
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        bail!("transaction receipt pending; inspect persisted job and reconcile {hash}")
    }

    pub async fn dispatch(&self, task: &TaskRequest) -> Result<TaskResult> {
        let relayer = self
            .relayers
            .iter()
            .find(|r| r.address == task.executor)
            .context("unknown executor")?;
        let _lock = relayer.lock.lock().await;
        self.validate(task).await?;
        let typed = task.typed()?;
        let contract = AetherisRouter::new(self.router, &self.provider);
        let shard = contract
            .predictShardAddress(
                typed.agentId,
                task.task_id,
                typed.sequenceNonce,
                task.executor,
                task.input_hash,
            )
            .call()
            .await?;
        // Solidity identity depends on the CREATE2 salt and constructor arguments, not auth deadline.
        let key = format!("shard:{shard}");
        let intent = keccak256([task.output_hash.as_slice(), task.proof_hash.as_slice()].concat());
        let intent_key = format!("{key}:intent");
        if !self.store.reserve(intent_key.clone(), &intent).await? {
            ensure!(
                self.store.get::<B256>(intent_key).await? == Some(intent),
                "shard already reserved for a different output/proof commitment"
            );
        }
        let create_tx = self
            .send(
                relayer,
                AetherisRouter::createShardCall {
                    agentId: typed.agentId,
                    taskId: task.task_id,
                    sequenceNonce: typed.sequenceNonce,
                    executor: task.executor,
                    inputHash: task.input_hash,
                }
                .abi_encode(),
                format!("{key}:create"),
            )
            .await?;
        let execution_tx = self
            .send(
                relayer,
                AetherisRouter::executeTaskCall {
                    shard,
                    outputHash: task.output_hash,
                    proofHash: task.proof_hash,
                }
                .abi_encode(),
                format!("{key}:execute"),
            )
            .await?;
        Ok(TaskResult {
            shard,
            salt: storage_salt(typed.agentId, task.task_id, typed.sequenceNonce),
            create_tx,
            execution_tx,
        })
    }

    pub async fn commit(
        &self,
        batch_id: B256,
        root: B256,
        count: usize,
        block: u64,
    ) -> Result<B256> {
        let relayer = &self.relayers[0];
        let _lock = relayer.lock.lock().await;
        self.send(
            relayer,
            AetherisRouter::commitMerkleBatchCall {
                batchId: batch_id,
                root,
                leafCount: U256::from(count),
                fromBlock: U256::from(block),
                toBlock: U256::from(block),
            }
            .abi_encode(),
            format!("batch:{batch_id}:tx"),
        )
        .await
    }

    pub async fn rpc(&self, method: &str, params: serde_json::Value) -> Result<serde_json::Value> {
        let response: serde_json::Value = self
            .http
            .post(&self.rpc_url)
            .json(&serde_json::json!({"jsonrpc":"2.0","id":1,"method":method,"params":params}))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        if let Some(error) = response.get("error") {
            bail!("RPC {method}: {error}");
        }
        response
            .get("result")
            .filter(|v| !v.is_null())
            .cloned()
            .context("RPC returned no result")
    }
}

pub fn storage_salt(agent: U256, task: B256, nonce: U256) -> B256 {
    let mut encoded = Vec::with_capacity(96);
    encoded.extend(agent.to_be_bytes::<32>());
    encoded.extend(task.as_slice());
    encoded.extend(nonce.to_be_bytes::<32>());
    keccak256(encoded)
}
pub fn unix_seconds() -> Result<u64> {
    Ok(SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs())
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::signers::SignerSync;

    #[tokio::test]
    async fn unknown_broadcast_blocks_a_new_task_before_any_rpc_call() {
        let _ = rustls::crypto::ring::default_provider().install_default();
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("state.redb")).unwrap();
        let address = Address::repeat_byte(1);
        store
            .put(
                format!("relayer:{address}:broadcast-state"),
                &Some(serde_json::json!({"nonce":7,"hash":null})),
            )
            .await
            .unwrap();
        let provider = ProviderBuilder::new()
            .connect_http("http://127.0.0.1:1".parse().unwrap())
            .erased();
        let engine = Engine {
            provider: provider.clone(),
            router: Address::repeat_byte(2),
            relayers: vec![Relayer {
                address,
                provider,
                lock: Mutex::new(()),
            }],
            permits: Arc::new(Semaphore::new(1)),
            confirmations: 1,
            store,
            http: reqwest::Client::new(),
            rpc_url: "http://127.0.0.1:1".into(),
        };
        let error = engine
            .send(&engine.relayers[0], vec![1, 2, 3], "new-task".into())
            .await
            .unwrap_err();
        assert!(error.to_string().contains("ambiguous prior broadcast"));
    }

    #[test]
    fn salt_changes_with_agent_task_and_sequence() {
        let base = storage_salt(U256::from(1), B256::repeat_byte(2), U256::from(3));
        assert_ne!(
            base,
            storage_salt(U256::from(2), B256::repeat_byte(2), U256::from(3))
        );
        assert_ne!(
            base,
            storage_salt(U256::from(1), B256::repeat_byte(3), U256::from(3))
        );
        assert_ne!(
            base,
            storage_salt(U256::from(1), B256::repeat_byte(2), U256::from(4))
        );
        // Fixed independent Solidity/viem vectors are checked in merkle::tests.
    }

    #[test]
    fn refreshed_authorization_keeps_canonical_execution_identity() {
        let router = Address::repeat_byte(3);
        let mut task = TaskRequest {
            agent_id: "1".into(),
            task_id: B256::repeat_byte(1),
            sequence_nonce: "0".into(),
            input_hash: B256::repeat_byte(2),
            output_hash: B256::repeat_byte(3),
            proof_hash: B256::ZERO,
            executor: Address::repeat_byte(4),
            deadline: 100,
            authorization: String::new(),
        };
        let original = (
            task.canonical_key(router).unwrap(),
            task.intent_hash(router).unwrap(),
            task.digest(router).unwrap(),
        );
        task.deadline = 200;
        assert_eq!(original.0, task.canonical_key(router).unwrap());
        assert_eq!(original.1, task.intent_hash(router).unwrap());
        assert_ne!(original.2, task.digest(router).unwrap());
        task.output_hash = B256::repeat_byte(9);
        assert_eq!(original.0, task.canonical_key(router).unwrap());
        assert_ne!(original.1, task.intent_hash(router).unwrap());
    }

    #[test]
    fn authorization_binds_output_executor_router_and_deadline() {
        let signer: PrivateKeySigner =
            "0000000000000000000000000000000000000000000000000000000000000001"
                .parse()
                .unwrap();
        let router = Address::repeat_byte(3);
        let mut task = TaskRequest {
            agent_id: "1".into(),
            task_id: B256::repeat_byte(1),
            sequence_nonce: "0".into(),
            input_hash: B256::repeat_byte(2),
            output_hash: B256::repeat_byte(3),
            proof_hash: B256::ZERO,
            executor: Address::repeat_byte(4),
            deadline: 100,
            authorization: String::new(),
        };
        task.authorization = signer
            .sign_hash_sync(&task.digest(router).unwrap())
            .unwrap()
            .to_string();
        assert_eq!(task.signer(router, 50).unwrap(), signer.address());
        assert!(task.signer(router, 101).is_err());
        assert_ne!(
            task.signer(Address::repeat_byte(8), 50).unwrap(),
            signer.address()
        );
        task.output_hash = B256::repeat_byte(9);
        assert_ne!(task.signer(router, 50).unwrap(), signer.address());
    }
}
