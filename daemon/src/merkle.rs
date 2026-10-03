use crate::router::{AetherisRouter, Engine, CHAIN_ID};
use alloy::{
    primitives::{keccak256, Address, B256, U256},
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
    engine
        .rpc(
            "eth_getBlockByNumber",
            json!([format!("0x{block:x}"), false]),
        )
        .await
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
        // BlockHash filter prevents event data being mixed across a reorg.
        let logs = engine.rpc("eth_getLogs",json!([{"address":engine.router,"blockHash":hash,"topics":[AetherisRouter::TaskExecuted::SIGNATURE_HASH]}])).await?;
        let mut logs: Vec<alloy::rpc::types::Log> = serde_json::from_value(logs)?;
        logs.sort_by_key(|log| (log.block_number, log.transaction_index, log.log_index));
        let mut leaves = Vec::with_capacity(logs.len());
        let mut previous_position = None;
        for log in logs {
            ensure!(
                !log.removed && log.block_hash == Some(hash) && log.block_number == Some(next),
                "orphaned/mismatched task log"
            );
            ensure!(
                log.transaction_index.is_some() && log.log_index.is_some(),
                "RPC omitted canonical log ordering"
            );
            ensure!(
                log.inner.address == engine.router,
                "RPC returned a foreign contract log"
            );
            let position = (log.transaction_index, log.log_index);
            ensure!(
                previous_position != Some(position),
                "RPC returned a duplicate task log"
            );
            previous_position = Some(position);
            let event = log.log_decode::<AetherisRouter::TaskExecuted>()?;
            leaves.push(task_leaf(engine.router, &event.inner.data));
        }
        if let Some(root) = merkle_root(&leaves) {
            ensure!(
                block_hash(&header(&engine, next).await?)? == hash,
                "block changed while assembling Merkle tree"
            );
            let id = batch_id(engine.router, next, hash);
            let transaction = engine.commit(id, root, leaves.len(), next).await?;
            engine
                .store
                .put(
                    format!("merkle:{id}"),
                    &Batch {
                        batch_id: id,
                        root,
                        leaf_count: leaves.len(),
                        block: next,
                        block_hash: hash,
                        transaction,
                    },
                )
                .await?;
            tracing::info!(block = next, %root, leaves = leaves.len(), %transaction, "Merkle batch confirmed");
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
