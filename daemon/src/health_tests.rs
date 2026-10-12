use super::*;
use alloy::{primitives::Address, providers::ProviderBuilder};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use tokio::sync::Semaphore;

#[tokio::test]
async fn liveness_preserves_a_writable_inbox_when_rpc_or_batch_worker_is_unavailable() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let rpc_available = Arc::new(AtomicBool::new(true));
    let rpc_calls = Arc::new(AtomicUsize::new(0));
    let available = rpc_available.clone();
    let calls = rpc_calls.clone();
    let rpc = Router::new().route("/", post(move |Json(request): Json<Value>| {
        let available = available.clone();
        let calls = calls.clone();
        async move {
            assert_eq!(request["method"], "eth_blockNumber", "health must never broadcast a transaction");
            calls.fetch_add(1, Ordering::SeqCst);
            if available.load(Ordering::SeqCst) {
                Json(json!({"jsonrpc":"2.0","id":request["id"],"result":"0x64"}))
            } else {
                Json(json!({"jsonrpc":"2.0","id":request["id"],"error":{"code":-32603,"message":"fixture RPC unavailable"}}))
            }
        }
    }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let rpc_server = tokio::spawn(async move { axum::serve(listener, rpc).await.unwrap() });
    let dir = tempfile::tempdir().unwrap();
    let store = store::Store::open(dir.path().join("health.redb")).unwrap();
    let inbox_record = json!({"status":"pending","requester":"fixture"});
    store
        .put("access:fixture:request:1".into(), &inbox_record)
        .await
        .unwrap();
    let engine = Arc::new(router::Engine {
        provider: ProviderBuilder::new()
            .connect_http(endpoint.parse().unwrap())
            .erased(),
        router: Address::repeat_byte(1),
        relayers: vec![],
        permits: Arc::new(Semaphore::new(1)),
        confirmations: 2,
        store: store.clone(),
        http: reqwest::Client::new(),
        rpc_url: endpoint.clone(),
    });
    let batch_health = Arc::new(RwLock::new("running"));
    let state = AppState {
        engine,
        payments: Arc::new(x402::Payments::test_x402(endpoint)),
        store: store.clone(),
        batch_health: batch_health.clone(),
        task_submission_enabled: false,
        journal_mount_verified: false,
        journal_mode: "ephemeral-testnet",
        journal_startup_state: "created",
        journal_require_existing: false,
        recovery_summary: Default::default(),
    };
    let app = health_routes().with_state(state);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let client = reqwest::Client::new();

    for (worker, available, expected_health) in [
        ("running", true, StatusCode::OK),
        ("stopped", true, StatusCode::SERVICE_UNAVAILABLE),
        ("running", false, StatusCode::SERVICE_UNAVAILABLE),
        ("stopped", false, StatusCode::SERVICE_UNAVAILABLE),
    ] {
        *batch_health.write().await = worker;
        rpc_available.store(available, Ordering::SeqCst);
        let before = rpc_calls.load(Ordering::SeqCst);
        let live = client.get(format!("{base}/live")).send().await.unwrap();
        assert_eq!(live.status(), StatusCode::OK);
        let body: Value = live.json().await.unwrap();
        assert_eq!(body["status"], "alive");
        assert_eq!(body["journal"]["writable"], true);
        assert_eq!(body["journal"]["mode"], "ephemeral-testnet");
        assert!(body["journal"]["warning"].is_string());
        assert_eq!(
            rpc_calls.load(Ordering::SeqCst),
            before,
            "liveness cannot depend on RPC availability"
        );
        let health = client.get(format!("{base}/health")).send().await.unwrap();
        assert_eq!(health.status(), expected_health);
        let body: Value = health.json().await.unwrap();
        if worker == "stopped" && available {
            assert_eq!(body["status"], "degraded");
            assert_eq!(body["batchWorker"], "stopped");
        }
        assert_eq!(
            store
                .get::<Value>("access:fixture:request:1".into())
                .await
                .unwrap(),
            Some(inbox_record.clone())
        );
        assert_eq!(
            store
                .get::<bool>("health:write-probe".into())
                .await
                .unwrap(),
            Some(true)
        );
    }
    server.abort();
    rpc_server.abort();
}

#[tokio::test]
async fn journal_probe_rejects_write_failure_without_exposing_storage_details() {
    let error = journal_probe(async { anyhow::bail!("private path and simulated disk failure") })
        .await
        .unwrap_err();
    let response = error.into_response();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    let body: Value = serde_json::from_slice(
        &axum::body::to_bytes(response.into_body(), 1024)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(
        body["error"],
        "Journal unavailable; preserve existing data and restore storage"
    );
}

#[tokio::test]
async fn journal_probe_times_out_before_the_platforms_five_second_deadline() {
    let started = tokio::time::Instant::now();
    let result = tokio::time::timeout(
        Duration::from_secs(4),
        journal_probe(std::future::pending()),
    )
    .await
    .expect("journal probe must finish before the platform health deadline");
    let error = result.unwrap_err();
    assert_eq!(error.0, StatusCode::SERVICE_UNAVAILABLE);
    assert!(error.1.contains("timed out"));
    assert!(started.elapsed() >= Duration::from_secs(3));
}
