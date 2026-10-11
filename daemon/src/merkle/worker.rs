//! Canonical range backfill plus an independent recent-block lane. Indexer rows
//! are optional block locators only; they never advance either RPC scan cursor.
use super::*;
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use tokio::time::Instant;

const SCAN_BLOCKS: u64 = 100;
const RECENT_BLOCKS: u64 = 1000;
const HINT_PAGE: usize = 32;
const HINT_BUDGET: usize = 8;

#[derive(Debug)]
pub(super) struct ReadUnavailable;
impl std::fmt::Display for ReadUnavailable {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("batch discovery RPC unavailable")
    }
}
impl std::error::Error for ReadUnavailable {}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub finalized_block: u64,
    pub history_through: Option<u64>,
    pub recent_through: Option<u64>,
    pub indexer_hints: String,
}

pub fn progress_key(router: Address) -> String {
    format!("merkle-progress:{CHAIN_ID}:{router}")
}

fn range_end(start: u64, finalized: u64) -> u64 {
    start.saturating_add(SCAN_BLOCKS - 1).min(finalized)
}

fn discovery_blocks(
    router: Address,
    from: u64,
    to: u64,
    logs: Vec<Log>,
) -> Result<BTreeMap<u64, (B256, Vec<Log>)>> {
    let mut groups: BTreeMap<u64, (B256, Vec<Log>)> = BTreeMap::new();
    for log in logs {
        let number = log.block_number.context("discovery log has no block")?;
        let hash = log.block_hash.context("discovery log has no hash")?;
        ensure!(
            number >= from && number <= to && hash != B256::ZERO,
            "discovery log lies outside canonical range"
        );
        ensure!(
            !log.removed && log.address() == router,
            "discovery returned a removed or foreign log"
        );
        log.log_decode_validate::<AetherisRouter::TaskExecuted>()?;
        let entry = groups.entry(number).or_insert_with(|| (hash, Vec::new()));
        ensure!(entry.0 == hash, "discovery mixed block hashes");
        entry.1.push(log);
    }
    // Validate ordering, duplicate indexes and metadata before any publication.
    for (&number, (hash, logs)) in &groups {
        block_batch(router, number, *hash, logs.clone())?;
    }
    Ok(groups)
}

/// A range checkpoint is written only after every nonempty block was published
/// (or matched on chain) and both ends still belong to the finalized chain.
async fn scan_range(
    engine: &Engine,
    key: &str,
    cursor: &mut Option<Cursor>,
    start: u64,
    end: u64,
) -> Result<()> {
    ensure!(
        start <= end && end - start < SCAN_BLOCKS,
        "invalid batch discovery range"
    );
    if let Some(previous) = cursor.as_ref() {
        ensure!(
            previous.number.checked_add(1) == Some(start),
            "batch cursor is not contiguous"
        );
        check_header(
            &header(engine, previous.number).await?,
            previous.number,
            Some(previous.hash),
        )?;
    }
    let first = header(engine, start).await?;
    let first_hash = check_header(&first, start, None)?;
    if let Some(previous) = cursor.as_ref() {
        let parent: B256 = first["parentHash"]
            .as_str()
            .context("block missing parent")?
            .parse()?;
        ensure!(
            parent == previous.hash,
            "noncontiguous canonical block chain"
        );
    }
    let last_hash = check_header(&header(engine, end).await?, end, None)?;
    let raw = engine.rpc("eth_getLogs", json!([{
        "address":engine.router,"fromBlock":format!("0x{start:x}"),"toBlock":format!("0x{end:x}"),
        "topics":[AetherisRouter::TaskExecuted::SIGNATURE_HASH]
    }])).await.context(ReadUnavailable)?;
    let blocks = discovery_blocks(engine.router, start, end, serde_json::from_value(raw)?)?;
    for (block, (hash, logs)) in blocks {
        check_header(&header(engine, block).await?, block, Some(hash))?;
        let discovered =
            block_batch(engine.router, block, hash, logs)?.context("empty discovered block")?;
        // Re-fetch full blockHash-scoped events so roots never depend on a
        // possibly partial range result. Disagreement halts without checkpointing.
        let canonical = reconstruct_block(engine, block, hash)
            .await?
            .context("discovered task disappeared")?;
        ensure!(
            discovered.root == canonical.root && discovered.leaf_count == canonical.leaf_count,
            "range discovery and complete block logs disagree"
        );
        let publication = publish_batch(engine, canonical).await?;
        tracing::info!(block, root=%publication.batch.root, leaves=publication.batch.leaf_count, status=publication.status, transaction=?publication.transaction, "Merkle batch finalized");
    }
    check_header(&header(engine, start).await?, start, Some(first_hash))?;
    check_header(&header(engine, end).await?, end, Some(last_hash))?;
    let completed = Cursor {
        number: end,
        hash: last_hash,
    };
    engine.store.put(key.to_owned(), &completed).await?;
    *cursor = Some(completed);
    Ok(())
}

#[derive(Clone, Debug)]
struct Hint {
    id: String,
    block: u64,
    hash: B256,
}

fn hint_page(
    value: &Value,
    router: Address,
    after: &str,
    deployment: u64,
    finalized: u64,
) -> Result<Vec<Hint>> {
    ensure!(
        value
            .get("errors")
            .is_none_or(|errors| errors.as_array().is_some_and(Vec::is_empty)),
        "indexer returned errors"
    );
    let rows = value["data"]["TaskExecution"]
        .as_array()
        .context("indexer has no task page")?;
    ensure!(rows.len() <= HINT_PAGE, "indexer hint page exceeds limit");
    let mut last_id = after;
    let mut hints = Vec::with_capacity(rows.len());
    for row in rows {
        let id = row["id"].as_str().context("indexer task id missing")?;
        ensure!(
            !id.is_empty() && id.len() <= 256 && id > last_id,
            "indexer task pagination is not strictly ordered"
        );
        let number = row["blockNumber"]
            .as_str()
            .context("indexer task block missing")?;
        ensure!(
            !number.is_empty() && number.bytes().all(|byte| byte.is_ascii_digit()),
            "invalid indexer block number"
        );
        let block: u64 = number.parse()?;
        let address: Address = row["router"]
            .as_str()
            .context("indexer router missing")?
            .parse()?;
        let hash: B256 = row["blockHash"]
            .as_str()
            .context("indexer block hash missing")?
            .parse()?;
        ensure!(
            row["chainId"].as_u64() == Some(CHAIN_ID)
                && address == router
                && block >= deployment
                && block <= finalized
                && hash != B256::ZERO,
            "foreign or unfinalized indexer task"
        );
        hints.push(Hint {
            id: id.to_owned(),
            block,
            hash,
        });
        last_id = id;
    }
    Ok(hints)
}

async fn read_hints(
    engine: &Engine,
    endpoint: &str,
    after: &str,
    deployment: u64,
    finalized: u64,
) -> Result<Vec<Hint>> {
    let response = engine.http.post(endpoint).json(&json!({
        "query":"query BatchHints($where: TaskExecution_bool_exp!) { TaskExecution(where: $where, order_by: {id: asc}, limit: 32) { id chainId router blockNumber blockHash } }",
        "variables":{"where":{"chainId":{"_eq":CHAIN_ID},"router":{"_eq":engine.router.to_string().to_lowercase()},"id":{"_gt":after},"blockNumber":{"_gte":deployment.to_string(),"_lte":finalized.to_string()}}}
    })).send().await?.error_for_status()?;
    ensure!(
        response
            .content_length()
            .is_none_or(|length| length <= 128 * 1024),
        "indexer hint response too large"
    );
    let mut response = response;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        ensure!(
            bytes.len() + chunk.len() <= 128 * 1024,
            "indexer hint response too large"
        );
        bytes.extend_from_slice(&chunk);
    }
    hint_page(
        &serde_json::from_slice(&bytes)?,
        engine.router,
        after,
        deployment,
        finalized,
    )
}

struct Hints {
    after: String,
    until: u64,
    queue: VecDeque<Hint>,
    last_page: bool,
    next_scan: Instant,
    status: &'static str,
}
impl Default for Hints {
    fn default() -> Self {
        Self {
            after: String::new(),
            until: 0,
            queue: VecDeque::new(),
            last_page: false,
            next_scan: Instant::now(),
            status: "waiting",
        }
    }
}

async fn scan_hints(
    engine: &Engine,
    endpoint: &str,
    deployment: u64,
    finalized: u64,
    hints: &mut Hints,
) -> Result<()> {
    if Instant::now() < hints.next_scan {
        return Ok(());
    }
    if hints.queue.is_empty() {
        if hints.until == 0 {
            hints.until = finalized;
        }
        match read_hints(engine, endpoint, &hints.after, deployment, hints.until).await {
            Ok(page) => {
                hints.status = "available";
                hints.last_page = page.len() < HINT_PAGE;
                hints.queue.extend(page);
            }
            Err(_) => {
                // The indexer is optional; it cannot stall current RPC discovery.
                hints.status = "unavailable";
                hints.next_scan = Instant::now() + Duration::from_secs(60);
                tracing::warn!("Optional Merkle task hints unavailable; canonical scans continue");
                return Ok(());
            }
        }
    }
    let mut published = BTreeSet::new();
    for _ in 0..HINT_BUDGET {
        let Some(hint) = hints.queue.front() else {
            break;
        };
        if published.insert(hint.block) {
            let source = header(engine, hint.block).await?;
            let canonical = check_header(&source, hint.block, None)?;
            // Untrusted stale indexer rows do not change canonical cursor/state.
            if canonical == hint.hash {
                if let Some(batch) = reconstruct_block(engine, hint.block, canonical).await? {
                    let publication = publish_batch(engine, batch).await?;
                    tracing::info!(block=hint.block, status=publication.status, transaction=?publication.transaction, "Indexed task block verified and batch reconciled");
                }
            }
        }
        let completed = hints.queue.pop_front().expect("hint remains queued");
        hints.after = completed.id;
    }
    if hints.queue.is_empty() && hints.last_page {
        // Rescan from the start to pick up delayed indexer rows with earlier IDs.
        hints.after.clear();
        hints.until = 0;
        hints.next_scan = Instant::now() + Duration::from_secs(300);
    }
    Ok(())
}

async fn finalized(engine: &Engine) -> Result<u64> {
    let value = engine
        .rpc("eth_getBlockByNumber", json!(["finalized", false]))
        .await
        .context(ReadUnavailable)?;
    let number = quantity(&value["number"])?;
    check_header(&value, number, None)?;
    Ok(number)
}

fn retryable(error: &anyhow::Error) -> bool {
    // Once publication was attempted, even an underlying read timeout is an
    // ambiguous write outcome and must stop for journal reconciliation.
    error.downcast_ref::<ReadUnavailable>().is_some()
        && error.downcast_ref::<PublicationError>().is_none()
}

pub async fn run(engine: Arc<Engine>, deployment: u64, indexer_url: Option<String>) -> Result<()> {
    let history_key = format!("merkle-cursor:{CHAIN_ID}:{}", engine.router);
    let recent_key = format!("merkle-recent-cursor:{CHAIN_ID}:{}", engine.router);
    let mut history = engine.store.get::<Cursor>(history_key.clone()).await?;
    let mut recent = engine.store.get::<Cursor>(recent_key.clone()).await?;
    let mut recent_start = None;
    let mut hints = Hints::default();
    let mut failures = 0;
    loop {
        let result: Result<()> = async {
            let head = finalized(&engine).await?;
            // Check both independent cursor anchors even when neither has work.
            for previous in [history.as_ref(), recent.as_ref()].into_iter().flatten() {
                ensure!(
                    previous.number <= head,
                    "finalized chain moved behind the batch cursor"
                );
                check_header(
                    &header(&engine, previous.number).await?,
                    previous.number,
                    Some(previous.hash),
                )?;
            }
            let boot =
                *recent_start.get_or_insert(head.saturating_sub(RECENT_BLOCKS - 1).max(deployment));
            let next_recent = recent
                .as_ref()
                .map_or(boot, |cursor| cursor.number.saturating_add(1));
            if next_recent <= head {
                scan_range(
                    &engine,
                    &recent_key,
                    &mut recent,
                    next_recent,
                    range_end(next_recent, head),
                )
                .await?;
            }
            let next_history = history
                .as_ref()
                .map_or(deployment, |cursor| cursor.number.saturating_add(1));
            if next_history <= head {
                scan_range(
                    &engine,
                    &history_key,
                    &mut history,
                    next_history,
                    range_end(next_history, head),
                )
                .await?;
            }
            if let Some(endpoint) = indexer_url.as_deref() {
                scan_hints(&engine, endpoint, deployment, head, &mut hints).await?;
            }
            engine
                .store
                .put(
                    progress_key(engine.router),
                    &Progress {
                        finalized_block: head,
                        history_through: history.as_ref().map(|cursor| cursor.number),
                        recent_through: recent.as_ref().map(|cursor| cursor.number),
                        indexer_hints: if indexer_url.is_some() {
                            hints.status
                        } else {
                            "disabled"
                        }
                        .into(),
                    },
                )
                .await?;
            Ok(())
        }
        .await;
        match result {
            Ok(()) => {
                failures = 0;
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
            Err(error) if retryable(&error) && failures < 5 => {
                failures += 1;
                tracing::warn!(
                    attempt = failures,
                    "Merkle discovery read failed; retrying without advancing failed range"
                );
                tokio::time::sleep(Duration::from_secs((1u64 << failures).min(30))).await;
            }
            Err(error) => return Err(error),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{config::Config, store::Store};
    use alloy::sol_types::SolValue;
    use axum::{routing::post, Json, Router};
    use tokio::sync::Mutex;

    #[test]
    fn discovery_ranges_are_inclusive_bounded_and_overflow_safe() {
        assert_eq!(range_end(12, 1000), 111);
        assert_eq!(range_end(12, 44), 44);
        assert_eq!(range_end(u64::MAX - 3, u64::MAX), u64::MAX);
    }

    #[test]
    fn indexer_hints_require_scope_finality_and_strict_keyset_ordering() {
        let router = Address::repeat_byte(0x11);
        let row = |id: &str| json!({"id":id,"chainId":CHAIN_ID,"router":router,"blockNumber":"42","blockHash":B256::repeat_byte(0x66)});
        let page = |rows| json!({"data":{"TaskExecution":rows}});
        assert_eq!(
            hint_page(&page(vec![row("b"), row("c")]), router, "a", 10, 50)
                .unwrap()
                .len(),
            2
        );
        for bad in [
            page(vec![row("a")]),
            page(vec![row("c"), row("b")]),
            page(vec![row("b"), row("b")]),
            page(vec![row("b"); HINT_PAGE + 1]),
            json!({"errors":[{"message":"upstream"}],"data":{"TaskExecution":[]}}),
        ] {
            assert!(hint_page(&bad, router, "a", 10, 50).is_err());
        }
        for (field, value) in [
            ("chainId", json!(1)),
            ("router", json!(Address::ZERO)),
            ("blockNumber", json!("51")),
            ("blockNumber", json!("9")),
            ("blockNumber", json!("0x2a")),
            ("blockHash", json!(B256::ZERO)),
        ] {
            let mut bad = row("b");
            bad[field] = value;
            assert!(hint_page(&page(vec![bad]), router, "a", 10, 50).is_err());
        }
    }

    #[test]
    fn only_prepublication_transport_reads_may_retry() {
        let read = anyhow::anyhow!("private provider response").context(ReadUnavailable);
        assert!(retryable(&read));
        let publication = read.context(PublicationError("ambiguous publication"));
        assert!(!retryable(&publication));
        assert!(!retryable(&anyhow::anyhow!("canonical block changed")));
    }

    #[derive(Clone, Copy)]
    enum Fault {
        None,
        Range,
        Canonical,
        Partial,
    }

    async fn fixture(
        fault: Fault,
    ) -> (
        Arc<Engine>,
        Store,
        Arc<Mutex<Vec<Value>>>,
        tokio::task::JoinHandle<()>,
        tempfile::TempDir,
    ) {
        let _ = rustls::crypto::ring::default_provider().install_default();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let captured = calls.clone();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let app = Router::new().route("/", post(move |Json(request): Json<Value>| {
            let calls = captured.clone();
            async move {
                let mut calls=calls.lock().await;
                calls.push(request.clone());
                let batch=super::super::tests::fixture_batch();
                if matches!(fault,Fault::Range) && request["method"]=="eth_getLogs" && request["params"][0].get("fromBlock").is_some() {
                    return Json(json!({"jsonrpc":"2.0","id":request["id"],"error":{"code":-32000,"message":"temporary range failure"}}));
                }
                let result=match request["method"].as_str().unwrap() {
                    "eth_chainId"=>json!("0x279f"),"eth_getCode"=>json!("0x01"),
                    "eth_getBlockByNumber"=>{
                        let number=if request["params"][0]=="finalized" {200} else {quantity(&request["params"][0]).unwrap()};
                        let end_calls=calls.iter().filter(|call|call["method"]=="eth_getBlockByNumber"&&call["params"][0]=="0x64").count();
                        let hash=if number==42 {batch.block_hash} else if matches!(fault,Fault::Canonical)&&number==100&&end_calls>1 {B256::repeat_byte(0xff)} else {B256::repeat_byte(0x77)};
                        json!({"number":format!("0x{number:x}"),"hash":hash,"parentHash":B256::repeat_byte(0x77)})
                    },
                    "eth_getLogs"=>{
                        if request["params"][0].get("fromBlock").is_some() {
                            let from=quantity(&request["params"][0]["fromBlock"]).unwrap();let to=quantity(&request["params"][0]["toBlock"]).unwrap();
                            assert!(to-from<100);
                            if from<=42&&to>=42 {json!([super::super::tests::task_log()])} else {json!([])}
                        } else if matches!(fault,Fault::Partial) {json!([])} else {json!([super::super::tests::task_log()])}
                    },
                    "eth_call"=>json!(format!("0x{}",hex::encode((batch.root,U256::from(1),U256::from(42),U256::from(42)).abi_encode()))),
                    other=>panic!("Unexpected RPC / broadcast in worker fixture: {other}")
                };
                Json(json!({"jsonrpc":"2.0","id":request["id"],"result":result}))
            }
        }));
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("state.redb")).unwrap();
        let config = Config {
            rpc_url: endpoint,
            router: Address::repeat_byte(0x11),
            private_keys: vec![format!("{:064x}", 1)],
            listen: "127.0.0.1:0".parse().unwrap(),
            database: String::new(),
            database_require_existing: false,
            database_mount_path: None,
            cors_origin: String::new(),
            confirmations: 1,
            deployment_block: 1,
            batch_enabled: false,
            task_submission_enabled: true,
            envio_graphql_url: None,
            max_inflight: 1,
        };
        let engine = Engine::connect(&config, store.clone()).await.unwrap();
        (engine, store, calls, server, dir)
    }

    #[tokio::test]
    async fn range_scan_skips_empty_headers_reconciles_existing_batches_and_advances_only_its_cursor(
    ) {
        let (engine, store, calls, server, _dir) = fixture(Fault::None).await;
        let mut cursor = None;
        scan_range(&engine, "test-history", &mut cursor, 1, 100)
            .await
            .unwrap();
        assert_eq!(cursor.as_ref().unwrap().number, 100);
        assert_eq!(
            store
                .get::<Cursor>("test-history".into())
                .await
                .unwrap()
                .unwrap()
                .number,
            100
        );
        assert!(store
            .get::<Cursor>("test-recent".into())
            .await
            .unwrap()
            .is_none());
        scan_range(&engine, "test-history", &mut cursor, 101, 200)
            .await
            .unwrap();
        assert_eq!(cursor.as_ref().unwrap().number, 200);
        let calls = calls.lock().await;
        assert_eq!(
            calls
                .iter()
                .filter(|call| call["method"] == "eth_getLogs"
                    && call["params"][0].get("fromBlock").is_some())
                .count(),
            2
        );
        assert_eq!(
            calls
                .iter()
                .filter(|call| call["method"] == "eth_getLogs"
                    && call["params"][0].get("blockHash").is_some())
                .count(),
            1
        );
        assert!(
            calls
                .iter()
                .filter(|call| call["method"] == "eth_getBlockByNumber")
                .count()
                < 25,
            "empty blocks must not each require a header read"
        );
        server.abort();
    }

    #[tokio::test]
    async fn failed_range_partial_logs_or_canonical_change_never_advance_the_checkpoint() {
        for fault in [Fault::Range, Fault::Canonical, Fault::Partial] {
            let (engine, store, _calls, server, _dir) = fixture(fault).await;
            let mut cursor = None;
            let error = scan_range(&engine, "failed-range", &mut cursor, 1, 100)
                .await
                .unwrap_err();
            assert_eq!(retryable(&error), matches!(fault, Fault::Range));
            assert!(cursor.is_none());
            assert!(store
                .get::<Cursor>("failed-range".into())
                .await
                .unwrap()
                .is_none());
            server.abort();
        }
    }

    #[tokio::test]
    async fn indexer_hints_reconstruct_rpc_logs_without_touching_scan_cursors() {
        let (engine, store, calls, server, _dir) = fixture(Fault::None).await;
        let mut hints = Hints {
            queue: VecDeque::from([Hint {
                id: "task-b".into(),
                block: 42,
                hash: B256::repeat_byte(0x66),
            }]),
            last_page: true,
            ..Default::default()
        };
        scan_hints(&engine, "http://unused.invalid", 1, 200, &mut hints)
            .await
            .unwrap();
        assert!(hints.queue.is_empty());
        assert!(hints.next_scan > Instant::now());
        assert!(store
            .get::<Cursor>(format!("merkle-cursor:{CHAIN_ID}:{}", engine.router))
            .await
            .unwrap()
            .is_none());
        assert!(store
            .get::<Cursor>(format!("merkle-recent-cursor:{CHAIN_ID}:{}", engine.router))
            .await
            .unwrap()
            .is_none());
        assert_eq!(
            calls
                .lock()
                .await
                .iter()
                .filter(|call| call["method"] == "eth_getLogs")
                .count(),
            1
        );
        server.abort();
    }
}
