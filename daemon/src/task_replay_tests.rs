use super::*;
use alloy::{signers::SignerSync, sol_types::SolValue};
use axum::{extract::State, http::HeaderMap, response::IntoResponse, routing::post, Json, Router};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicUsize, Ordering};

#[derive(Clone, Copy)]
enum ChainTask {
    Exists,
    Absent,
    Unavailable,
}

#[derive(Clone, Copy)]
enum SavedTask {
    None,
    ExactRequest,
    RefreshedRequest,
}

// Exercise the real submission handler, including its journal lookups and
// payment verifier. The only permitted network calls are mock reads and a
// deliberately rejected mock payment verification for the fresh-task control.
#[tokio::test]
async fn missing_journal_rejects_onchain_tasks_before_payments_or_reservations() {
    for (chain_task, saved_task, expected_status, expected_payment_calls) in [
        (ChainTask::Exists, SavedTask::None, 409, 0),
        (ChainTask::Unavailable, SavedTask::None, 503, 0),
        (ChainTask::Absent, SavedTask::None, 402, 1),
        (ChainTask::Exists, SavedTask::ExactRequest, 200, 0),
        (ChainTask::Exists, SavedTask::RefreshedRequest, 200, 0),
    ] {
        let saved_job = !matches!(saved_task, SavedTask::None);
        let _ = rustls::crypto::ring::default_provider().install_default();
        let calls = Arc::new(Mutex::new(Vec::<Value>::new()));
        let captured = calls.clone();
        let payments_called = Arc::new(AtomicUsize::new(0));
        let captured_payments = payments_called.clone();
        let app = Router::new()
            .route("/", post(move |Json(request): Json<Value>| {
                let calls = captured.clone();
                async move {
                    calls.lock().await.push(request.clone());
                    assert_eq!(request["method"], "eth_call", "must not broadcast or estimate a transaction");
                    let data = request["params"][0]["input"].as_str()
                        .or_else(|| request["params"][0]["data"].as_str()).unwrap();
                    let input = hex::decode(data.trim_start_matches("0x")).unwrap();
                    let output = if input[..4] == AetherisRouter::isAuthorizedCall::SELECTOR {
                        true.abi_encode()
                    } else {
                        assert_eq!(input[..4], AetherisRouter::shardsBySaltCall::SELECTOR);
                        let query = AetherisRouter::shardsBySaltCall::abi_decode(&input).unwrap();
                        assert_eq!(query.salt, storage_salt(U256::from(1), B256::repeat_byte(1), U256::from(7)));
                        if matches!(chain_task, ChainTask::Unavailable) {
                            return Json(json!({"jsonrpc":"2.0","id":request["id"],"error":{"code":-32603,"message":"read unavailable"}}));
                        }
                        if matches!(chain_task, ChainTask::Exists) {
                            Address::repeat_byte(8).abi_encode()
                        } else {
                            Address::ZERO.abi_encode()
                        }
                    };
                    Json(json!({"jsonrpc":"2.0","id":request["id"],"result":format!("0x{}", hex::encode(output))}))
                }
            }))
            .route("/verify", post(move || {
                captured_payments.fetch_add(1, Ordering::SeqCst);
                async { Json(json!({"isValid":false})) }
            }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("state.redb")).unwrap();
        let provider = ProviderBuilder::new()
            .connect_http(endpoint.parse().unwrap())
            .erased();
        let engine = Arc::new(Engine {
            provider: provider.clone(),
            router: Address::repeat_byte(2),
            relayers: vec![Relayer {
                address: Address::repeat_byte(4),
                provider,
                lock: Mutex::new(()),
            }],
            permits: Arc::new(Semaphore::new(1)),
            confirmations: 2,
            store: store.clone(),
            http: reqwest::Client::new(),
            rpc_url: endpoint.clone(),
        });
        let signer: PrivateKeySigner =
            "0000000000000000000000000000000000000000000000000000000000000001"
                .parse()
                .unwrap();
        let mut task = TaskRequest {
            agent_id: "1".into(),
            task_id: B256::repeat_byte(1),
            sequence_nonce: "7".into(),
            input_hash: B256::repeat_byte(2),
            output_hash: B256::repeat_byte(3),
            proof_hash: B256::ZERO,
            executor: Address::repeat_byte(4),
            deadline: unix_seconds().unwrap() + 300,
            authorization: String::new(),
        };
        task.authorization = signer
            .sign_hash_sync(&task.digest(engine.router).unwrap())
            .unwrap()
            .to_string();
        let request_id = if matches!(saved_task, SavedTask::RefreshedRequest) {
            let mut original = task.clone();
            original.deadline -= 10;
            let original_id = original.digest(engine.router).unwrap();
            store
                .put(
                    task.canonical_key(engine.router).unwrap(),
                    &crate::CanonicalTask {
                        request_id: original_id,
                        intent: original.intent_hash(engine.router).unwrap(),
                    },
                )
                .await
                .unwrap();
            original_id
        } else {
            task.digest(engine.router).unwrap()
        };
        let payments = crate::x402::Payments::test_x402(endpoint);
        let payload = json!({"x402Version":2,"accepted":payments.required_payload()["accepts"][0],"payload":{"authorization":{"from":signer.address(),"nonce":B256::repeat_byte(9)}}});
        let mut headers = HeaderMap::new();
        headers.insert(
            "payment-signature",
            STANDARD
                .encode(serde_json::to_vec(&payload).unwrap())
                .parse()
                .unwrap(),
        );
        if saved_job {
            store
                .put(
                    format!("job:{request_id}"),
                    &crate::Job {
                        request_id,
                        status: "completed".into(),
                        result: None,
                        payment: Some(json!({"transaction":"saved-receipt"})),
                        error: None,
                    },
                )
                .await
                .unwrap();
        }
        let before = store
            .scan_prefix::<Value>(String::new(), 100)
            .await
            .unwrap();
        let state = crate::AppState {
            engine,
            payments: Arc::new(payments),
            store: store.clone(),
            batch_health: Arc::new(tokio::sync::RwLock::new("disabled")),
            task_submission_enabled: true,
            journal_mount_verified: false,
            journal_mode: "temporary_testnet",
            journal_startup_state: "fresh",
            journal_require_existing: false,
            recovery_summary: Default::default(),
        };
        let response = crate::submit(State(state), headers, Json(task))
            .await
            .into_response();
        assert_eq!(response.status().as_u16(), expected_status);
        let body: Value = serde_json::from_slice(
            &axum::body::to_bytes(response.into_body(), 16_384)
                .await
                .unwrap(),
        )
        .unwrap();
        if expected_status == 409 {
            assert!(body["error"]
                .as_str()
                .unwrap()
                .contains("reconciliation required"));
            assert!(
                body.get("payment").is_none(),
                "must not fabricate a missing receipt"
            );
        }
        if saved_job {
            assert_eq!(body["payment"]["transaction"], "saved-receipt");
            assert_eq!(body["requestId"], json!(request_id));
        }
        assert_eq!(
            payments_called.load(Ordering::SeqCst),
            expected_payment_calls
        );
        assert_eq!(calls.lock().await.len(), if saved_job { 2 } else { 3 });
        assert_eq!(
            store
                .scan_prefix::<Value>(String::new(), 100)
                .await
                .unwrap(),
            before,
            "preflight must not reserve a job, payment, or broadcast"
        );
        server.abort();
    }
}
