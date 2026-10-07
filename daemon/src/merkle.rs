use crate::router::{AetherisRouter, Engine, CHAIN_ID};
use alloy::{
    eips::BlockId,
    primitives::{keccak256, Address, B256, U256},
    providers::Provider,
    rpc::types::{Log, TransactionReceipt},
    sol_types::SolEvent,
};
use anyhow::{ensure, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{sync::Arc, time::Duration};

/// Domain-separated and double-hashed leaves, compatible with Solidity and viem.
pub fn task_leaf(router: Address, event: &AetherisRouter::TaskExecuted) -> B256 {
    let mut bytes = Vec::with_capacity(232);
    bytes.extend(U256::from(CHAIN_ID).to_be_bytes::<32>());
    bytes.extend(router.as_slice());
    bytes.extend(event.shard.as_slice());
    bytes.extend(event.agentId.to_be_bytes::<32>());
    bytes.extend(event.taskId.as_slice());
    bytes.extend(event.inputHash.as_slice());
    bytes.extend(event.outputHash.as_slice());
    bytes.extend(event.proofHash.as_slice());
    keccak256(keccak256(bytes))
}

pub fn merkle_root(leaves: &[B256]) -> Option<B256> {
    if leaves.is_empty() {
        return None;
    }
    let mut level = leaves.to_vec();
    while level.len() > 1 {
        level = level
            .chunks(2)
            .map(|pair| hash_pair(pair[0], *pair.get(1).unwrap_or(&pair[0])))
            .collect();
    }
    Some(level[0])
}

pub fn hash_pair(a: B256, b: B256) -> B256 {
    let (left, right) = if a <= b { (a, b) } else { (b, a) };
    let mut bytes = [0; 64];
    bytes[..32].copy_from_slice(left.as_slice());
    bytes[32..].copy_from_slice(right.as_slice());
    keccak256(bytes)
}

pub fn batch_id(router: Address, block: u64, hash: B256) -> B256 {
    let mut bytes = Vec::with_capacity(116);
    bytes.extend(U256::from(CHAIN_ID).to_be_bytes::<32>());
    bytes.extend(router.as_slice());
    bytes.extend(U256::from(block).to_be_bytes::<32>());
    bytes.extend(hash.as_slice());
    keccak256(bytes)
}

#[derive(Serialize, Deserialize)]
struct Cursor {
    number: u64,
    hash: B256,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Batch {
    batch_id: B256,
    root: B256,
    leaf_count: usize,
    block: u64,
    block_hash: B256,
    transaction: B256,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BlockBatch {
    batch_id: B256,
    root: B256,
    leaf_count: usize,
    block: u64,
    block_hash: B256,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Publication {
    chain_id: u64,
    router: Address,
    status: &'static str,
    #[serde(flatten)]
    batch: BlockBatch,
    transaction: Option<B256>,
    receipt_verified: bool,
}

#[derive(Debug)]
struct PublicationError(&'static str);

impl std::fmt::Display for PublicationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.0)
    }
}
impl std::error::Error for PublicationError {}

/// Return only our static classification, never an RPC URL or provider error body.
pub fn publication_error(error: &anyhow::Error) -> &'static str {
    error.downcast_ref::<PublicationError>().map_or(
        "block publication failed; preserve the journal and reconcile before retrying",
        |error| error.0,
    )
}

fn quantity(value: &Value) -> Result<u64> {
    u64::from_str_radix(
        value
            .as_str()
            .context("missing RPC quantity")?
            .trim_start_matches("0x"),
        16,
    )
    .context("invalid RPC quantity")
}
fn block_hash(block: &Value) -> Result<B256> {
    Ok(block["hash"]
        .as_str()
        .context("missing block hash")?
        .parse()?)
}

async fn header(engine: &Engine, block: u64) -> Result<Value> {
    let result = engine
        .rpc(
            "eth_getBlockByNumber",
            json!([format!("0x{block:x}"), false]),
        )
        .await?;
    check_header(&result, block, None)?;
    Ok(result)
}

fn check_header(header: &Value, number: u64, expected: Option<B256>) -> Result<B256> {
    ensure!(
        quantity(&header["number"])? == number,
        "RPC returned another block number"
    );
    let hash = block_hash(header)?;
    ensure!(hash != B256::ZERO, "RPC returned an empty block hash");
    ensure!(
        expected.is_none_or(|expected| expected == hash),
        "canonical block hash changed"
    );
    Ok(hash)
}

fn require_finalized(block: u64, finalized: &Value) -> Result<u64> {
    let number = quantity(&finalized["number"])?;
    check_header(finalized, number, None)?;
    ensure!(block <= number, "requested block is not finalized");
    Ok(number)
}

fn block_batch(
    router: Address,
    block: u64,
    hash: B256,
    mut logs: Vec<Log>,
) -> Result<Option<BlockBatch>> {
    logs.sort_by_key(|log| (log.transaction_index, log.log_index));
    let mut leaves = Vec::with_capacity(logs.len());
    let mut previous_index = None;
    for log in logs {
        ensure!(
            !log.removed && log.block_hash == Some(hash) && log.block_number == Some(block),
            "orphaned/mismatched task log"
        );
        ensure!(
            log.inner.address == router,
            "RPC returned a foreign contract log"
        );
        ensure!(
            log.transaction_index.is_some() && log.transaction_hash.is_some(),
            "RPC omitted canonical transaction metadata"
        );
        let index = log.log_index.context("RPC omitted log index")?;
        ensure!(
            previous_index.is_none_or(|previous| previous < index),
            "RPC returned duplicate or inconsistent log ordering"
        );
        previous_index = Some(index);
        let event = log.log_decode_validate::<AetherisRouter::TaskExecuted>()?;
        leaves.push(task_leaf(router, &event.inner.data));
    }
    Ok(merkle_root(&leaves).map(|root| BlockBatch {
        batch_id: batch_id(router, block, hash),
        root,
        leaf_count: leaves.len(),
        block,
        block_hash: hash,
    }))
}

async fn reconstruct_block(engine: &Engine, block: u64, hash: B256) -> Result<Option<BlockBatch>> {
    // A fixed blockHash filter cannot mix logs from different forks or scan history.
    let logs = engine.rpc("eth_getLogs", json!([{"address":engine.router,"blockHash":hash,"topics":[AetherisRouter::TaskExecuted::SIGNATURE_HASH]}])).await?;
    let batch = block_batch(engine.router, block, hash, serde_json::from_value(logs)?)?;
    check_header(&header(engine, block).await?, block, Some(hash))?;
    Ok(batch)
}

fn matches_commitment(
    stored: &AetherisRouter::merkleBatchesReturn,
    batch: &BlockBatch,
) -> Result<bool> {
    if stored.root == B256::ZERO {
        ensure!(
            stored.leafCount == U256::ZERO
                && stored.fromBlock == U256::ZERO
                && stored.toBlock == U256::ZERO,
            "invalid empty batch state"
        );
        return Ok(false);
    }
    ensure!(
        stored.root == batch.root
            && stored.leafCount == U256::from(batch.leaf_count)
            && stored.fromBlock == U256::from(batch.block)
            && stored.toBlock == U256::from(batch.block),
        "existing batch commitment differs from reconstructed finalized logs"
    );
    Ok(true)
}

fn verify_commit_receipt(
    receipt: &TransactionReceipt,
    transaction: B256,
    router: Address,
    committer: Address,
    batch: &BlockBatch,
) -> Result<(u64, B256)> {
    ensure!(
        receipt.status()
            && receipt.transaction_hash == transaction
            && receipt.to == Some(router)
            && receipt.from == committer,
        "batch receipt has wrong status, transaction, router or committer"
    );
    let number = receipt.block_number.context("batch receipt has no block")?;
    let hash = receipt
        .block_hash
        .context("batch receipt has no block hash")?;
    ensure!(
        number > batch.block && hash != B256::ZERO && receipt.transaction_index.is_some(),
        "batch receipt has invalid block metadata"
    );
    let mut found = 0;
    for log in receipt.logs().iter().filter(|log| {
        log.address() == router
            && log.topic0() == Some(&AetherisRouter::MerkleBatchCommitted::SIGNATURE_HASH)
    }) {
        ensure!(
            !log.removed
                && log.block_number == Some(number)
                && log.block_hash == Some(hash)
                && log.transaction_hash == Some(transaction)
                && log.transaction_index == receipt.transaction_index
                && log.log_index.is_some(),
            "batch receipt event has inconsistent canonical metadata"
        );
        let event = log.log_decode_validate::<AetherisRouter::MerkleBatchCommitted>()?;
        let event = event.inner.data;
        ensure!(
            event.batchId == batch.batch_id
                && event.root == batch.root
                && event.leafCount == U256::from(batch.leaf_count)
                && event.fromBlock == U256::from(batch.block)
                && event.toBlock == U256::from(batch.block),
            "batch receipt event differs from reconstructed finalized logs"
        );
        found += 1;
    }
    ensure!(
        found == 1,
        "expected exactly one matching batch commitment event"
    );
    Ok((number, hash))
}

async fn verify_publication(engine: &Engine, batch: &BlockBatch, transaction: B256) -> Result<()> {
    let committer = engine
        .relayers
        .first()
        .context("no configured committer")?
        .address;
    // Engine::commit already waits for confirmations. Finality is a separate requirement.
    tokio::time::timeout(Duration::from_secs(120), async {
        loop {
            let receipt = engine
                .provider
                .get_transaction_receipt(transaction)
                .await?
                .context("batch receipt unavailable")?;
            let (number, hash) =
                verify_commit_receipt(&receipt, transaction, engine.router, committer, batch)?;
            let finalized = engine
                .rpc("eth_getBlockByNumber", json!(["finalized", false]))
                .await?;
            let finalized_number = quantity(&finalized["number"])?;
            check_header(&finalized, finalized_number, None)?;
            if finalized_number >= number {
                check_header(&header(engine, number).await?, number, Some(hash))?;
                check_header(
                    &header(engine, batch.block).await?,
                    batch.block,
                    Some(batch.block_hash),
                )?;
                let contract = AetherisRouter::new(engine.router, &engine.provider);
                let stored = contract
                    .merkleBatches(batch.batch_id)
                    .block(BlockId::number(finalized_number))
                    .call()
                    .await?;
                ensure!(
                    matches_commitment(&stored, batch)?,
                    "finalized batch commitment is missing"
                );
                return Ok(());
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    })
    .await
    .context("batch receipt finality timed out; preserve journal")?
}

/// Publishes one finalized block only. Never reads/writes the worker cursor or task jobs.
pub async fn commit_block(engine: Arc<Engine>, block: u64) -> Result<Publication> {
    let finalized = engine
        .rpc("eth_getBlockByNumber", json!(["finalized", false]))
        .await
        .context(PublicationError("unable to read the RPC finalized block"))?;
    require_finalized(block, &finalized).context(PublicationError(
        "requested block is not finalized or the finalized RPC header is invalid",
    ))?;
    let source = header(&engine, block).await.context(PublicationError(
        "unable to verify the requested canonical block header",
    ))?;
    let hash = block_hash(&source)?;
    let batch = reconstruct_block(&engine, block, hash)
        .await
        .context(PublicationError(
            "unable to reconstruct canonical task logs; check RPC availability and block integrity",
        ))?
        .context(PublicationError(
            "requested block contains no task executions",
        ))?;
    publish_batch(&engine, batch).await
}

/// Shared by the CLI and worker, including reconciliation of externally published batches.
async fn publish_batch(engine: &Engine, batch: BlockBatch) -> Result<Publication> {
    let block = batch.block;
    let hash = batch.block_hash;
    let contract = AetherisRouter::new(engine.router, &engine.provider);
    let existing = contract
        .merkleBatches(batch.batch_id)
        .call()
        .await
        .context(PublicationError(
            "unable to read the router's existing batch commitment",
        ))?;
    let already_committed = matches_commitment(&existing, &batch).context(PublicationError(
        "existing batch commitment conflicts with reconstructed finalized task logs",
    ))?;
    let transaction = if already_committed {
        // Reuse the existing hash when available. Without it, prove finalized storage
        // and explicitly report that no historical receipt was independently verified.
        engine
            .store
            .get::<B256>(format!("batch:{}:tx", batch.batch_id))
            .await
            .context(PublicationError("unable to read the publication journal"))?
    } else {
        let committer = engine
            .relayers
            .first()
            .context("no configured committer")?
            .address;
        let allowed = contract
            .committers(committer)
            .call()
            .await
            .context(PublicationError(
                "unable to verify first-relayer committer permission",
            ))?;
        if !allowed {
            return Err(
                PublicationError("first relayer is not an authorized batch committer").into(),
            );
        }
        let source = header(engine, block).await.context(PublicationError(
            "unable to recheck the source block before publication",
        ))?;
        check_header(&source, block, Some(hash)).context(PublicationError(
            "source block canonical hash changed; publication halted",
        ))?;
        Some(
            engine
                .commit(batch.batch_id, batch.root, batch.leaf_count, block)
                .await
                .context(PublicationError(
                    "publication submission or confirmation failed; preserve the broadcast journal and reconcile before retrying",
                ))?,
        )
    };
    if let Some(transaction) = transaction {
        verify_publication(engine, &batch, transaction)
            .await
            .context(PublicationError(
                "publication receipt, event or finalized state could not be verified; preserve the journal and reconcile",
            ))?;
        engine
            .store
            .put(
                format!("merkle:{}", batch.batch_id),
                &Batch {
                    batch_id: batch.batch_id,
                    root: batch.root,
                    leaf_count: batch.leaf_count,
                    block,
                    block_hash: hash,
                    transaction,
                },
            )
            .await
            .context(PublicationError(
                "publication verified but its journal update failed; preserve the existing journal",
            ))?;
    } else {
        verify_existing_publication(engine, &batch).await.context(PublicationError(
            "existing commitment could not be verified in finalized canonical state; preserve the journal",
        ))?;
    }
    Ok(Publication {
        chain_id: CHAIN_ID,
        router: engine.router,
        status: if already_committed {
            "already_committed"
        } else {
            "committed"
        },
        batch,
        transaction,
        receipt_verified: transaction.is_some(),
    })
}

async fn verify_existing_publication(engine: &Engine, batch: &BlockBatch) -> Result<()> {
    let block = batch.block;
    let hash = batch.block_hash;
    let contract = AetherisRouter::new(engine.router, &engine.provider);
    let finalized = engine
        .rpc("eth_getBlockByNumber", json!(["finalized", false]))
        .await?;
    let finalized_number = require_finalized(block, &finalized)?;
    let stored = contract
        .merkleBatches(batch.batch_id)
        .block(BlockId::number(finalized_number))
        .call()
        .await?;
    ensure!(
        matches_commitment(&stored, batch)?,
        "existing commitment is not finalized"
    );
    check_header(&header(engine, block).await?, block, Some(hash))?;
    Ok(())
}

/// Scans finalized blocks only. Finalized-tag support is mandatory; a hash change halts
/// settlement instead of silently treating orphaned events as canonical.
pub async fn run_worker(engine: Arc<Engine>, deployment_block: u64) -> Result<()> {
    let cursor_key = format!("merkle-cursor:{}:{}", CHAIN_ID, engine.router);
    let mut cursor = engine.store.get::<Cursor>(cursor_key.clone()).await?;
    loop {
        if let Some(previous) = &cursor {
            ensure!(
                block_hash(&header(&engine, previous.number).await?)? == previous.hash,
                "finalized block changed; batch reconciliation required"
            );
        }
        let finalized = engine
            .rpc("eth_getBlockByNumber", json!(["finalized", false]))
            .await?;
        let finalized_number = quantity(&finalized["number"])?;
        let next = cursor
            .as_ref()
            .map_or(deployment_block, |c| c.number.saturating_add(1));
        if next > finalized_number {
            tokio::time::sleep(Duration::from_secs(2)).await;
            continue;
        }
        let block = header(&engine, next).await?;
        let hash = block_hash(&block)?;
        if let Some(previous) = &cursor {
            let parent: B256 = block["parentHash"]
                .as_str()
                .context("block missing parent")?
                .parse()?;
            ensure!(
                parent == previous.hash,
                "noncontiguous canonical block chain"
            );
        }
        if let Some(batch) = reconstruct_block(&engine, next, hash).await? {
            let publication = publish_batch(&engine, batch).await?;
            tracing::info!(block = next, root = %publication.batch.root, leaves = publication.batch.leaf_count, transaction = ?publication.transaction, status = publication.status, "Merkle batch finalized");
        }
        cursor = Some(Cursor { number: next, hash });
        engine
            .store
            .put(cursor_key.clone(), &cursor.as_ref().expect("cursor set"))
            .await?;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn publication_errors_never_expose_provider_urls_or_response_bodies() {
        let private =
            anyhow::anyhow!("request failed: https://rpc.invalid/private-key?token=secret");
        let classified =
            private.context(PublicationError("unable to read the RPC finalized block"));
        assert_eq!(
            publication_error(&classified),
            "unable to read the RPC finalized block"
        );
        let unknown = anyhow::anyhow!("upstream body contains secret credentials");
        assert_eq!(
            publication_error(&unknown),
            "block publication failed; preserve the journal and reconcile before retrying"
        );
    }

    fn task_log() -> Log {
        let event = AetherisRouter::TaskExecuted {
            shard: Address::repeat_byte(0x22),
            agentId: U256::from(1),
            taskId: B256::repeat_byte(0x33),
            inputHash: B256::repeat_byte(0x44),
            outputHash: B256::repeat_byte(0x55),
            proofHash: B256::repeat_byte(0x66),
        };
        Log {
            inner: alloy::primitives::Log {
                address: Address::repeat_byte(0x11),
                data: event.encode_log_data(),
            },
            block_number: Some(42),
            block_hash: Some(B256::repeat_byte(0x66)),
            transaction_hash: Some(B256::repeat_byte(0x77)),
            transaction_index: Some(2),
            log_index: Some(3),
            ..Default::default()
        }
    }

    fn fixture_batch() -> BlockBatch {
        block_batch(
            Address::repeat_byte(0x11),
            42,
            B256::repeat_byte(0x66),
            vec![task_log()],
        )
        .unwrap()
        .unwrap()
    }

    fn receipt_value(batch: &BlockBatch) -> Value {
        let event = AetherisRouter::MerkleBatchCommitted {
            batchId: batch.batch_id,
            root: batch.root,
            leafCount: U256::from(batch.leaf_count),
            fromBlock: U256::from(batch.block),
            toBlock: U256::from(batch.block),
        };
        let log = Log {
            inner: alloy::primitives::Log {
                address: Address::repeat_byte(0x11),
                data: event.encode_log_data(),
            },
            block_number: Some(43),
            block_hash: Some(B256::repeat_byte(0x88)),
            transaction_hash: Some(B256::repeat_byte(0x99)),
            transaction_index: Some(1),
            log_index: Some(2),
            ..Default::default()
        };
        json!({"type":"0x2","status":"0x1","transactionHash":B256::repeat_byte(0x99),
            "transactionIndex":"0x1","blockNumber":"0x2b","blockHash":B256::repeat_byte(0x88),
            "from":Address::repeat_byte(0x33),"to":Address::repeat_byte(0x11),"contractAddress":null,
            "cumulativeGasUsed":"0x5208","gasUsed":"0x5208","effectiveGasPrice":"0x1",
            "logsBloom":format!("0x{}", "00".repeat(256)),"logs":[log]})
    }

    #[test]
    fn publication_rejects_unfinalized_wrong_number_and_changed_hash() {
        let header = json!({"number":"0x2a","hash":B256::repeat_byte(0x66)});
        assert_eq!(require_finalized(42, &header).unwrap(), 42);
        assert!(require_finalized(43, &header).is_err());
        assert!(check_header(&header, 41, None).is_err());
        assert!(check_header(&header, 42, Some(B256::repeat_byte(0x77))).is_err());
        assert!(require_finalized(42, &json!({"number":"0x2a","hash":B256::ZERO})).is_err());
    }

    #[test]
    fn reconstruction_rejects_foreign_orphaned_duplicate_and_incomplete_logs() {
        let good = task_log();
        let run = |logs| {
            block_batch(
                Address::repeat_byte(0x11),
                42,
                B256::repeat_byte(0x66),
                logs,
            )
        };
        assert!(run(vec![]).unwrap().is_none());
        assert!(run(vec![good.clone(), good.clone()]).is_err());
        let mut bad = good.clone();
        bad.removed = true;
        assert!(run(vec![bad]).is_err());
        let mut bad = good.clone();
        bad.block_number = Some(41);
        assert!(run(vec![bad]).is_err());
        let mut bad = good.clone();
        bad.block_hash = Some(B256::ZERO);
        assert!(run(vec![bad]).is_err());
        let mut bad = good.clone();
        bad.inner.address = Address::ZERO;
        assert!(run(vec![bad]).is_err());
        let mut bad = good.clone();
        bad.transaction_index = None;
        assert!(run(vec![bad]).is_err());
        let mut bad = good.clone();
        bad.transaction_hash = None;
        assert!(run(vec![bad]).is_err());
        let mut bad = good.clone();
        bad.log_index = None;
        assert!(run(vec![bad]).is_err());
        let mut bad = good;
        bad.topics_mut()[0] = B256::ZERO;
        assert!(run(vec![bad]).is_err());
    }

    #[test]
    fn existing_commitment_must_match_every_reconstructed_field() {
        let batch = fixture_batch();
        let mut stored = AetherisRouter::merkleBatchesReturn {
            root: batch.root,
            leafCount: U256::from(1),
            fromBlock: U256::from(42),
            toBlock: U256::from(42),
        };
        assert!(matches_commitment(&stored, &batch).unwrap());
        stored.leafCount = U256::from(2);
        assert!(matches_commitment(&stored, &batch).is_err());
        stored.leafCount = U256::from(1);
        stored.toBlock = U256::from(43);
        assert!(matches_commitment(&stored, &batch).is_err());
        stored.toBlock = U256::from(42);
        stored.root = B256::repeat_byte(0xaa);
        assert!(matches_commitment(&stored, &batch).is_err());
    }

    #[test]
    fn receipt_binds_success_router_committer_canonical_metadata_and_exact_event() {
        let batch = fixture_batch();
        let good = receipt_value(&batch);
        let check = |value| {
            let receipt: TransactionReceipt = serde_json::from_value(value).unwrap();
            verify_commit_receipt(
                &receipt,
                B256::repeat_byte(0x99),
                Address::repeat_byte(0x11),
                Address::repeat_byte(0x33),
                &batch,
            )
        };
        assert_eq!(check(good.clone()).unwrap(), (43, B256::repeat_byte(0x88)));
        for (field, value) in [
            ("status", json!("0x0")),
            ("transactionHash", json!(B256::ZERO)),
            ("from", json!(Address::ZERO)),
            ("to", json!(Address::ZERO)),
            ("blockNumber", json!("0x2a")),
            ("blockHash", json!(B256::ZERO)),
            ("logs", json!([])),
        ] {
            let mut bad = good.clone();
            bad[field] = value;
            assert!(check(bad).is_err());
        }
        let mut bad = good.clone();
        bad["logs"][0]["blockHash"] = json!(B256::ZERO);
        assert!(check(bad).is_err());
        let mut bad = good.clone();
        bad["logs"][0]["topics"][1] = json!(B256::ZERO);
        assert!(check(bad).is_err());
        let mut bad = good.clone();
        bad["logs"] = json!([good["logs"][0], good["logs"][0]]);
        assert!(check(bad).is_err());
        let mut other = batch.clone();
        other.root = B256::repeat_byte(0xaa);
        assert!(check(receipt_value(&other)).is_err());
    }

    #[tokio::test]
    async fn cli_preserves_cursor_and_worker_reconciles_commitments_without_local_receipts() {
        use crate::{config::Config, store::Store};
        use alloy::sol_types::SolValue;
        use axum::{routing::post, Json, Router};
        use tokio::sync::Mutex;

        let calls = Arc::new(Mutex::new(Vec::<Value>::new()));
        let captured = calls.clone();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let app = Router::new().route(
            "/",
            post(move |Json(request): Json<Value>| {
                let calls = captured.clone();
                async move {
                    calls.lock().await.push(request.clone());
                    let batch = fixture_batch();
                    let result = match request["method"].as_str().unwrap() {
                        "eth_chainId" => json!("0x279f"),
                        "eth_getCode" => json!("0x01"),
                        "eth_getBlockByNumber" => {
                            let number = if request["params"][0] == "finalized" {
                                "0x2a"
                            } else {
                                request["params"][0].as_str().unwrap()
                            };
                            let hash = if number == "0x29" { B256::repeat_byte(0x77) } else { batch.block_hash };
                            json!({"number":number,"hash":hash,"parentHash":B256::repeat_byte(0x77)})
                        }
                        "eth_getLogs" => json!([task_log()]),
                        "eth_call" => json!(format!(
                            "0x{}",
                            hex::encode(
                                (batch.root, U256::from(1), U256::from(42), U256::from(42))
                                    .abi_encode()
                            )
                        )),
                        _ => panic!(
                            "one-block replay must not broadcast or make unexpected RPC calls"
                        ),
                    };
                    Json(json!({"jsonrpc":"2.0","id":request["id"],"result":result}))
                }
            }),
        );
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("state.redb")).unwrap();
        let router = Address::repeat_byte(0x11);
        let cursor_key = format!("merkle-cursor:{CHAIN_ID}:{router}");
        let cursor = json!({"number":7,"hash":B256::repeat_byte(7)});
        let job = json!({"status":"accepted"});
        store.put(cursor_key.clone(), &cursor).await.unwrap();
        store.put("job:unrelated".into(), &job).await.unwrap();
        let config = Config {
            rpc_url: url,
            router,
            private_keys: vec![format!("{:064x}", 1)],
            listen: "127.0.0.1:0".parse().unwrap(),
            database: String::new(),
            cors_origin: String::new(),
            confirmations: 1,
            deployment_block: 0,
            batch_enabled: false,
            max_inflight: 1,
        };
        let engine = Engine::connect(&config, store.clone()).await.unwrap();
        let publication = commit_block(engine.clone(), 42).await.unwrap();
        assert_eq!(publication.status, "already_committed");
        assert_eq!(publication.transaction, None);
        assert!(!publication.receipt_verified);
        assert_eq!(
            store.get::<Value>(cursor_key.clone()).await.unwrap(),
            Some(cursor)
        );
        assert_eq!(
            store.get::<Value>("job:unrelated".into()).await.unwrap(),
            Some(job)
        );
        assert!(commit_block(engine.clone(), 44).await.is_err());
        let cli_calls = calls.lock().await;
        assert!(cli_calls
            .iter()
            .all(|call| call["method"] != "eth_getBlockByNumber"
                || ["finalized", "0x2a"].contains(&call["params"][0].as_str().unwrap())));
        assert_eq!(
            cli_calls
                .iter()
                .filter(|call| call["method"] == "eth_getLogs")
                .count(),
            1
        );
        drop(cli_calls);
        // A later catch-up must advance through this externally committed block,
        // without attempting another transaction or depending on a local tx hash.
        store
            .put(
                cursor_key.clone(),
                &Cursor {
                    number: 41,
                    hash: B256::repeat_byte(0x77),
                },
            )
            .await
            .unwrap();
        let worker = tokio::spawn(run_worker(engine, 0));
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                if store
                    .get::<Cursor>(cursor_key.clone())
                    .await
                    .unwrap()
                    .unwrap()
                    .number
                    == 42
                {
                    break;
                }
                assert!(
                    !worker.is_finished(),
                    "worker failed while reconciling an existing commitment"
                );
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        worker.abort();
        assert_eq!(
            calls
                .lock()
                .await
                .iter()
                .filter(|call| call["method"] == "eth_getLogs")
                .count(),
            2
        );
        server.abort();
    }
    #[test]
    fn roots_handle_empty_single_odd_and_sorted_pairs() {
        let a = keccak256("a");
        let b = keccak256("b");
        let c = keccak256("c");
        assert_eq!(merkle_root(&[]), None);
        assert_eq!(merkle_root(&[a]), Some(a));
        assert_eq!(hash_pair(a, b), hash_pair(b, a));
        assert_eq!(
            merkle_root(&[a, b, c]),
            Some(hash_pair(hash_pair(a, b), hash_pair(c, c)))
        );
        assert_ne!(merkle_root(&[a, b, c]), merkle_root(&[a, c, b]));
    }
    #[test]
    fn leaf_binds_contract_and_output() {
        let mut event = AetherisRouter::TaskExecuted {
            shard: Address::repeat_byte(1),
            agentId: U256::from(1),
            taskId: B256::repeat_byte(2),
            inputHash: B256::repeat_byte(3),
            outputHash: B256::repeat_byte(4),
            proofHash: B256::ZERO,
        };
        let root = task_leaf(Address::repeat_byte(5), &event);
        assert_ne!(root, task_leaf(Address::repeat_byte(6), &event));
        event.outputHash = B256::repeat_byte(7);
        assert_ne!(root, task_leaf(Address::repeat_byte(5), &event));
    }
    #[test]
    fn matches_shared_solidity_viem_vectors() {
        let router = Address::repeat_byte(0x11);
        let event = AetherisRouter::TaskExecuted {
            shard: Address::repeat_byte(0x22),
            agentId: U256::from(1),
            taskId: B256::repeat_byte(0x33),
            inputHash: B256::repeat_byte(0x44),
            outputHash: B256::repeat_byte(0x55),
            proofHash: B256::repeat_byte(0x66),
        };
        assert_eq!(
            task_leaf(router, &event),
            "0xb039a3d2a6aa1f34fff2aaa77864a33cda193c69d6c66559fee65c8474d61fdf"
                .parse::<B256>()
                .unwrap()
        );
        assert_eq!(
            batch_id(router, 42, B256::repeat_byte(0x66)),
            "0x25369331dc35862a909c5dfb0a7a48efbd9879c308345fdb1d575f40574c8aa5"
                .parse::<B256>()
                .unwrap()
        );
        assert_eq!(
            crate::router::storage_salt(U256::from(1), B256::repeat_byte(0x33), U256::from(7)),
            "0xc0837dccb7b05109d2ced1dfbcf109adeaa1a1258e74fa924d4f5c7f13562173"
                .parse::<B256>()
                .unwrap()
        );
    }
}
