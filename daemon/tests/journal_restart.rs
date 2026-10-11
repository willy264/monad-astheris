//! Production binary restart against isolated local RPC/payment fixtures. No real
//! signer, payment service, RPC endpoint or database is read by this test.
use axum::{
    routing::{get, post},
    Json, Router,
};
use redb::{Database, TableDefinition};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::Path,
    process::Stdio,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::process::Command;

const RECORDS: TableDefinition<&str, &[u8]> = TableDefinition::new("records");

fn seed(path: &Path) {
    let db = Database::create(path).unwrap();
    let tx = db.begin_write().unwrap();
    {
        let mut table = tx.open_table(RECORDS).unwrap();
        for (digit, status) in [
            (1, "accepted"),
            (2, "settlement_pending"),
            (3, "completed"),
            (4, "settlement_pending"),
        ] {
            let id = format!("0x{digit:064x}");
            let payment = (status == "completed")
                .then(|| json!({"success": true, "transaction": format!("0x{:064x}", 99)}));
            let records = [
                (
                    format!("job:{id}"),
                    json!({"requestId": id, "status": status, "result": null, "payment": payment, "error": null}),
                ),
                (format!("payment:{id}"), json!(id)),
                (
                    format!("task:fixture:{digit}"),
                    json!({"request_id": id, "intent": id}),
                ),
            ];
            for (key, value) in records {
                table
                    .insert(key.as_str(), serde_json::to_vec(&value).unwrap().as_slice())
                    .unwrap();
            }
        }
        // Task 2 may have reached the facilitator; task 4 never reached settle.
        for (key, value) in [
            (
                format!("settlement-intent:0x{:064x}", 2),
                json!({"paymentId": format!("0x{:064x}", 2)}),
            ),
            (
                "merkle:fixture".into(),
                json!({"transaction": format!("0x{:064x}", 88), "root": format!("0x{:064x}", 77)}),
            ),
            (
                "merkle-cursor:fixture".into(),
                json!({"number": 42, "hash": format!("0x{:064x}", 66)}),
            ),
            (
                "relayer:fixture:broadcast-state".into(),
                json!({"nonce": 7, "hash": null}),
            ),
            (
                "tx:fixture:broadcast-intent".into(),
                json!({"nonce": 7, "calldataHash": format!("0x{:064x}", 55)}),
            ),
        ] {
            table
                .insert(key.as_str(), serde_json::to_vec(&value).unwrap().as_slice())
                .unwrap();
        }
    }
    tx.commit().unwrap();
}

fn daemon_command(directory: &Path, database: &Path, port: u16, fixture: &str) -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_aetheris-daemon"));
    // Keep OS loader variables, but discard all inherited app credentials/settings.
    let os_environment: Vec<_> = std::env::vars_os()
        .filter(|(key, _)| {
            matches!(
                key.to_string_lossy().to_ascii_uppercase().as_str(),
                "PATH" | "SYSTEMROOT" | "WINDIR" | "TEMP" | "TMP"
            )
        })
        .collect();
    command
        .env_clear()
        .envs(os_environment)
        .current_dir(directory)
        .env("MONAD_RPC_URL", format!("{fixture}/rpc"))
        .env("AETHERIS_ROUTER_ADDRESS", format!("0x{:040x}", 1))
        .env("RELAYER_PRIVATE_KEYS", format!("{:064x}", 1)) // Public disposable test vector only.
        .env("LISTEN_ADDR", format!("127.0.0.1:{port}"))
        .env("DATABASE_PATH", database)
        .env("DATABASE_REQUIRE_EXISTING", "true")
        .env("DEPLOYMENT_BLOCK", "1")
        .env("TASK_SUBMISSION_ENABLED", "true")
        .env("BATCH_ENABLED", "false")
        .env("CORS_ORIGIN", "http://localhost:3000")
        .env("PAYMENT_MODE", "x402")
        .env(
            "PUBLIC_TASK_URL",
            format!("http://127.0.0.1:{port}/v1/tasks"),
        )
        .env("X402_FACILITATOR_URL", fixture)
        .env("PAYMENT_ASSET", format!("0x{:040x}", 2))
        .env("PAYMENT_RECEIVER", format!("0x{:040x}", 3))
        .env("PAYMENT_AMOUNT", "1000")
        .env("PAYMENT_ASSET_NAME", "Fixture USDC")
        .env("PAYMENT_ASSET_VERSION", "2")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    command
}

#[tokio::test]
async fn production_process_restart_retains_receipts_and_quarantines_interrupted_work() {
    let calls = Arc::new(Mutex::new(HashMap::<String, usize>::new()));
    let rpc_calls = calls.clone();
    let verify_calls = calls.clone();
    let settle_calls = calls.clone();
    let app = Router::new()
        .route("/rpc", post(move |Json(request): Json<Value>| {
            let calls = rpc_calls.clone();
            async move {
                let method = request["method"].as_str().unwrap().to_owned();
                *calls.lock().unwrap().entry(method.clone()).or_default() += 1;
                let result = match method.as_str() {
                    "eth_chainId" => json!("0x279f"),
                    "eth_getCode" => json!("0x01"),
                    "eth_blockNumber" => json!("0x64"),
                    _ => panic!("restart must not submit a transaction or request a signature"),
                };
                Json(json!({"jsonrpc": "2.0", "id": request["id"], "result": result}))
            }
        }))
        .route("/supported", get(|| async { Json(json!({"kinds": [{"x402Version": 2, "scheme": "exact", "network": "eip155:10143"}]})) }))
        .route("/verify", post(move || { let calls = verify_calls.clone(); async move { *calls.lock().unwrap().entry("verify".into()).or_default() += 1; Json(json!({"isValid": false})) } }))
        .route("/settle", post(move || { let calls = settle_calls.clone(); async move { *calls.lock().unwrap().entry("settle".into()).or_default() += 1; Json(json!({"success": false})) } }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let fixture = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let directory = tempfile::tempdir().unwrap();
    let database = directory.path().join("retained.redb");
    seed(&database);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(1))
        .build()
        .unwrap();
    for restart in 0..2 {
        let reservation = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = reservation.local_addr().unwrap().port();
        drop(reservation);
        let mut child = daemon_command(directory.path(), &database, port, &fixture)
            .spawn()
            .unwrap();
        let base = format!("http://127.0.0.1:{port}");
        let health = tokio::time::timeout(Duration::from_secs(20), async {
            loop {
                if let Ok(response) = client.get(format!("{base}/health")).send().await {
                    if response.status().is_success() {
                        break response.json::<Value>().await.unwrap();
                    }
                }
                if let Some(status) = child.try_wait().unwrap() {
                    panic!("fixture daemon exited before health: {status}");
                }
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        })
        .await
        .unwrap();
        assert_eq!(health["taskSubmissionEnabled"], true);
        assert_eq!(health["journal"]["writable"], true);
        assert_eq!(health["journal"]["startupRecovery"]["jobs"], 4);
        assert_eq!(
            health["journal"]["startupRecovery"]["reconciliationJobs"],
            3
        );
        assert_eq!(health["journal"]["startupRecovery"]["completedJobs"], 1);
        assert_eq!(
            health["journal"]["startupRecovery"]["paymentReservations"],
            4
        );
        assert_eq!(health["journal"]["startupRecovery"]["batches"], 1);
        assert_eq!(health["journal"]["startupRecovery"]["unresolvedSigners"], 1);
        for digit in 1..=4 {
            let response = client
                .get(format!("{base}/v1/tasks/0x{digit:064x}"))
                .send()
                .await
                .unwrap();
            assert_eq!(
                response.status().as_u16(),
                if digit == 3 { 200 } else { 502 }
            );
            let job: Value = response.json().await.unwrap();
            assert_eq!(
                job["status"],
                if digit == 3 {
                    "completed"
                } else {
                    "reconciliation_required"
                }
            );
            if digit == 3 {
                assert_eq!(job["payment"]["success"], true);
            }
        }
        child.start_kill().unwrap(); // Abrupt process exit, no graceful database drop.
        let output = child.wait_with_output().await.unwrap();
        let logs = String::from_utf8_lossy(&output.stdout);
        assert!(logs.contains("journal recovery complete"));
        println!("restart {restart}: recovered 4 jobs, 4 payment reservations, 1 batch; interrupted jobs quarantined; startup summary recorded");
    }
    let before_unavailable = calls.lock().unwrap().clone();
    let missing = directory.path().join("missing.redb");
    let child = daemon_command(directory.path(), &missing, 0, &fixture)
        .spawn()
        .unwrap();
    let output = tokio::time::timeout(Duration::from_secs(10), child.wait_with_output())
        .await
        .unwrap()
        .unwrap();
    assert!(!output.status.success());
    assert!(!missing.exists());
    assert!(String::from_utf8_lossy(&output.stderr).contains("DATABASE_REQUIRE_EXISTING"));
    assert_eq!(
        *calls.lock().unwrap(),
        before_unavailable,
        "unavailable journal must stop startup before network or payment initialization"
    );
    for mounted in [false, true] {
        let mut command = daemon_command(directory.path(), &database, 0, &fixture);
        command.env("RENDER", "true");
        if mounted {
            command.env("DATABASE_MOUNT_PATH", directory.path());
        }
        let child = command.spawn().unwrap();
        let output = tokio::time::timeout(Duration::from_secs(10), child.wait_with_output())
            .await
            .unwrap()
            .unwrap();
        assert!(!output.status.success());
        assert!(String::from_utf8_lossy(&output.stderr).contains("DATABASE_MOUNT_PATH"));
        assert_eq!(
            *calls.lock().unwrap(),
            before_unavailable,
            "Render without a retained mounted disk must stop before RPC"
        );
    }
    let db = Database::open(&database).unwrap();
    let tx = db.begin_read().unwrap();
    let table = tx.open_table(RECORDS).unwrap();
    for key in [
        "merkle:fixture",
        "merkle-cursor:fixture",
        "tx:fixture:broadcast-intent",
        "relayer:fixture:broadcast-state",
    ] {
        assert!(table.get(key).unwrap().is_some());
    }
    assert!(table
        .get(format!("settlement-intent:0x{:064x}", 2).as_str())
        .unwrap()
        .is_some());
    assert!(table
        .get(format!("settlement-intent:0x{:064x}", 4).as_str())
        .unwrap()
        .is_none());
    assert!(calls.lock().unwrap().keys().all(|key| matches!(
        key.as_str(),
        "eth_chainId" | "eth_getCode" | "eth_blockNumber"
    )));
    println!("zero payment verify/settle or transaction broadcasts across both actual daemon processes; missing retained journal fails before RPC");
    server.abort();
}
