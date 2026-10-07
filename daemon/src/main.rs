mod config;
mod merkle;
mod router;
mod store;
mod x402;

use alloy::primitives::B256;
use alloy::providers::Provider;
use axum::{
    extract::{DefaultBodyLimit, Path, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    middleware,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{sync::Arc, time::Duration};
use tokio::sync::RwLock;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[derive(Clone)]
pub struct AppState {
    pub engine: Arc<router::Engine>,
    pub payments: Arc<x402::Payments>,
    pub store: store::Store,
    pub batch_health: Arc<RwLock<&'static str>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub request_id: B256,
    pub status: String,
    pub result: Option<router::TaskResult>,
    pub payment: Option<Value>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct CanonicalTask {
    request_id: B256,
    intent: B256,
}

type ApiResult = Result<Response, ApiError>;

#[derive(Debug, PartialEq, Eq)]
enum Command {
    Serve,
    CommitBlock(u64),
    Help,
}

fn command(args: impl Iterator<Item = String>) -> anyhow::Result<Command> {
    let args: Vec<String> = args.collect();
    match args.as_slice() {
        [] => Ok(Command::Serve),
        [flag] if flag == "--help" || flag == "-h" => Ok(Command::Help),
        [flag, block] if flag == "--commit-block" => {
            anyhow::ensure!(
                !block.is_empty() && block.bytes().all(|value| value.is_ascii_digit()),
                "--commit-block requires an unsigned decimal block number"
            );
            Ok(Command::CommitBlock(block.parse().map_err(|_| {
                anyhow::anyhow!("--commit-block block number exceeds uint64")
            })?))
        }
        _ => anyhow::bail!("usage: aetheris-daemon [--commit-block DECIMAL_BLOCK | --help]"),
    }
}

pub struct ApiError(StatusCode, String);
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"error":self.1}))).into_response()
    }
}

#[tokio::main(flavor = "multi_thread")]
async fn main() -> anyhow::Result<()> {
    let command = command(std::env::args().skip(1))?;
    if command == Command::Help {
        println!("Usage: aetheris-daemon [--commit-block DECIMAL_BLOCK | --help]\nWithout arguments, serve the paid task API. --commit-block publishes one finalized nonempty task block using the first relayer and existing journal; stop every other process using that signer first. It does not start the server, contact payment services, or advance the worker cursor.");
        return Ok(());
    }
    rustls::crypto::ring::default_provider()
        .install_default()
        .map_err(|_| anyhow::anyhow!("TLS crypto provider was already configured"))?;
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "aetheris_daemon=info,tower_http=info".into()),
        )
        .init();
    let config = config::Config::from_env()?;
    let store = store::Store::open(&config.database)?;
    if command == Command::Serve {
        let interrupted = store.mark_interrupted_jobs().await?;
        if interrupted > 0 {
            tracing::warn!(
                interrupted,
                "interrupted jobs require reconciliation; no automatic rebroadcast or repayment"
            );
        }
    }
    let engine = router::Engine::connect(&config, store.clone()).await
        .map_err(|_| anyhow::anyhow!("RPC/router/relayer initialization failed; verify configured network, deployment and signer keys"))?;
    if let Command::CommitBlock(block) = command {
        anyhow::ensure!(
            block >= config.deployment_block,
            "requested block precedes DEPLOYMENT_BLOCK"
        );
        let publication = tokio::time::timeout(
            Duration::from_secs(300),
            merkle::commit_block(engine, block),
        ).await
            .map_err(|_| anyhow::anyhow!("block publication timed out; preserve the journal and reconcile any recorded transaction before retrying"))?
            .map_err(|error| anyhow::anyhow!(merkle::publication_error(&error)))?;
        println!("{}", serde_json::to_string(&publication)?);
        return Ok(());
    }
    let payments = Arc::new(x402::Payments::from_env(engine.http.clone()).await
        .map_err(|_| anyhow::anyhow!("payment initialization failed; verify payment settings and facilitator support"))?);
    let state = AppState {
        engine: engine.clone(),
        payments,
        store: store.clone(),
        batch_health: Arc::new(RwLock::new(if config.batch_enabled {
            "running"
        } else {
            "disabled"
        })),
    };
    if config.batch_enabled {
        let batch_engine = engine.clone();
        let deployment_block = config.deployment_block;
        let batch_health = state.batch_health.clone();
        tokio::spawn(async move {
            if merkle::run_worker(batch_engine, deployment_block)
                .await
                .is_err()
            {
                tracing::error!(category="merkle_worker_failed", "Merkle worker stopped; inspect canonical chain and restart after reconciliation");
                *batch_health.write().await = "stopped";
            }
        });
    }
    let origin: HeaderValue = config.cors_origin.parse()?;
    let cors = CorsLayer::new()
        .allow_origin(origin)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([
            header::CONTENT_TYPE,
            header::HeaderName::from_static("payment-signature"),
            header::HeaderName::from_static("x-graph-tally-receipt"),
        ])
        .expose_headers([
            header::HeaderName::from_static("payment-required"),
            header::HeaderName::from_static("payment-response"),
        ]);
    let paid =
        Router::new()
            .route("/v1/tasks", post(submit))
            .route_layer(middleware::from_fn_with_state(
                state.clone(),
                x402::require_payment,
            ));
    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/config", get(public_config))
        .route("/v1/tasks/{request_id}", get(job))
        .merge(paid)
        .layer(DefaultBodyLimit::max(32 * 1024))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);
    let listener = tokio::net::TcpListener::bind(config.listen).await?;
    tracing::info!(address = %config.listen, chain_id = router::CHAIN_ID, "Aetheris daemon ready");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal()?)
        .await?;
    // Durable task records flag interrupted work for operator reconciliation on restart.
    Ok(())
}

fn shutdown_signal() -> anyhow::Result<impl std::future::Future<Output = ()>> {
    // Render and other Unix process managers send SIGTERM, not Ctrl+C.
    // Register before serving so registration failures are startup errors.
    #[cfg(unix)]
    let mut terminate =
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .map_err(|_| anyhow::anyhow!("could not register the SIGTERM shutdown handler"))?;
    Ok(async move {
        #[cfg(unix)]
        let termination = async {
            terminate.recv().await;
        };
        #[cfg(not(unix))]
        let termination = std::future::pending::<()>();
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {},
            _ = termination => {},
        }
        tracing::info!("Shutdown requested; HTTP listener draining active requests");
    })
}

async fn health(State(state): State<AppState>) -> ApiResult {
    let block = tokio::time::timeout(
        Duration::from_secs(5),
        state.engine.provider.get_block_number(),
    )
    .await
    .map_err(|_| ApiError(StatusCode::SERVICE_UNAVAILABLE, "RPC timed out".into()))?
    .map_err(|_| ApiError(StatusCode::SERVICE_UNAVAILABLE, "RPC unavailable".into()))?;
    let batch_health = *state.batch_health.read().await;
    let stopped = batch_health == "stopped";
    let code = if stopped {
        StatusCode::SERVICE_UNAVAILABLE
    } else {
        StatusCode::OK
    };
    Ok((code,Json(json!({"status":if stopped { "degraded" } else { "ok" },"batchWorker":batch_health,"chainId":router::CHAIN_ID,"router":state.engine.router,"relayers":state.engine.addresses(),"blockNumber":block}))).into_response())
}

async fn public_config(State(state): State<AppState>) -> Json<Value> {
    Json(
        json!({"chainId":router::CHAIN_ID,"router":state.engine.router,"relayers":state.engine.addresses(),"taskAuthorization":{"name":"AetherisTask","version":"1"},"payment":state.payments.required_payload()}),
    )
}

async fn job(State(state): State<AppState>, Path(id): Path<B256>) -> ApiResult {
    let job = state
        .store
        .get::<Job>(format!("job:{id}"))
        .await
        .map_err(internal)?
        .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "task request not found".into()))?;
    job_response(job)
}

async fn submit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(task): Json<router::TaskRequest>,
) -> ApiResult {
    let permit = state
        .engine
        .clone()
        .permits
        .clone()
        .try_acquire_owned()
        .map_err(|_| {
            ApiError(
                StatusCode::TOO_MANY_REQUESTS,
                "relayer capacity exceeded".into(),
            )
        })?;
    let client = state.engine.validate(&task).await.map_err(|_| {
        ApiError(
            StatusCode::UNAUTHORIZED,
            "task authorization could not be verified".into(),
        )
    })?;
    let request_id = task
        .digest(state.engine.router)
        .map_err(|_| ApiError(StatusCode::BAD_REQUEST, "invalid task encoding".into()))?;
    if let Some(existing) = state
        .store
        .get::<Job>(format!("job:{request_id}"))
        .await
        .map_err(internal)?
    {
        return job_response(existing);
    }
    let canonical_key = task.canonical_key(state.engine.router).map_err(internal)?;
    let canonical = CanonicalTask {
        request_id,
        intent: task.intent_hash(state.engine.router).map_err(internal)?,
    };
    if let Some(existing) = canonical_job(&state, &canonical_key, canonical.intent).await? {
        return job_response(existing);
    }
    let payment = match state.payments.verify(&headers, client).await {
        Ok(payment) => payment,
        Err(_) => return Ok(state.payments.challenge("payment verification failed")),
    };
    let record = Job {
        request_id,
        status: "accepted".into(),
        result: None,
        payment: None,
        error: None,
    };
    if !state
        .store
        .reserve_all(vec![
            (canonical_key.clone(), json!(canonical)),
            (format!("job:{request_id}"), json!(record)),
            (format!("payment:{}", payment.id), json!(request_id)),
            (format!("request:{request_id}"), json!(task)),
            (format!("payment-context:{request_id}"), json!(payment)),
        ])
        .await
        .map_err(internal)?
    {
        if let Some(existing) = canonical_job(&state, &canonical_key, canonical.intent).await? {
            return job_response(existing);
        }
        return Err(ApiError(
            StatusCode::CONFLICT,
            "request or payment already reserved".into(),
        ));
    }
    // Awaiting a spawned worker preserves execution if the HTTP connection is dropped.
    let worker = tokio::spawn(async move {
        let _permit = permit;
        let mut record = record;
        match state.engine.dispatch(&task).await {
            Ok(result) => {
                record.result = Some(result);
                record.status = "settlement_pending".into();
                if state
                    .store
                    .put(format!("job:{request_id}"), &record)
                    .await
                    .is_err()
                {
                    tracing::error!(%request_id, category="journal_write_failed", "cannot journal confirmed execution; settlement paused");
                    record.error =
                        Some("confirmed execution requires journal reconciliation".into());
                    return record;
                }
                match state.payments.settle(&payment).await {
                    Ok(receipt) => {
                        record.status = "completed".into();
                        record.payment = Some(receipt);
                    }
                    Err(_) => {
                        record.status = "settlement_pending".into();
                        record.error = Some("Payment settlement failed; confirmed execution retained for reconciliation".into());
                    }
                }
            }
            Err(_) => {
                record.status = "reconciliation_required".into();
                record.error = Some("Task transaction failed or receipt remains unresolved; reconcile the persisted journal".into());
            }
        }
        if state
            .store
            .put(format!("job:{request_id}"), &record)
            .await
            .is_err()
        {
            tracing::error!(%request_id, category="journal_write_failed", "failed to persist task outcome; reconcile journal");
        }
        record
    });
    let finished = worker.await.map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "task interrupted; query the persisted request ID".into(),
        )
    })?;
    job_response(finished)
}

async fn canonical_job(state: &AppState, key: &str, intent: B256) -> Result<Option<Job>, ApiError> {
    if let Some(previous) = state
        .store
        .get::<CanonicalTask>(key.to_owned())
        .await
        .map_err(internal)?
    {
        if previous.intent != intent {
            return Err(ApiError(
                StatusCode::CONFLICT,
                "task identity already reserved for different inputs, output, proof or executor"
                    .into(),
            ));
        }
        let job = state
            .store
            .get::<Job>(format!("job:{}", previous.request_id))
            .await
            .map_err(internal)?
            .ok_or_else(|| {
                ApiError(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "canonical task journal requires reconciliation".into(),
                )
            })?;
        return Ok(Some(job));
    }
    Ok(None)
}

fn job_response(job: Job) -> ApiResult {
    let status = match job.status.as_str() {
        "completed" => StatusCode::OK,
        "accepted" => StatusCode::ACCEPTED,
        _ => StatusCode::BAD_GATEWAY,
    };
    let mut response = (status, Json(&job)).into_response();
    if let Some(receipt) = &job.payment {
        let encoded = STANDARD.encode(serde_json::to_vec(receipt).map_err(|e| internal(e.into()))?);
        response.headers_mut().insert(
            "payment-response",
            HeaderValue::from_str(&encoded).map_err(|e| internal(e.into()))?,
        );
    }
    Ok(response)
}

fn internal(_error: anyhow::Error) -> ApiError {
    tracing::error!(category = "storage_failed", "request storage failure");
    ApiError(
        StatusCode::INTERNAL_SERVER_ERROR,
        "storage unavailable".into(),
    )
}

#[cfg(test)]
mod command_tests {
    use super::*;

    #[test]
    fn commit_block_requires_one_decimal_number_and_preserves_server_default() {
        let parse = |args: &[&str]| command(args.iter().map(|value| (*value).to_owned()));
        assert_eq!(parse(&[]).unwrap(), Command::Serve);
        assert_eq!(parse(&["--help"]).unwrap(), Command::Help);
        assert_eq!(
            parse(&["--commit-block", "68105690"]).unwrap(),
            Command::CommitBlock(68105690)
        );
        for args in [
            vec!["--commit-block"],
            vec!["--commit-block", ""],
            vec!["--commit-block", "-1"],
            vec!["--commit-block", "+1"],
            vec!["--commit-block", "0x2a"],
            vec!["--commit-block", "42.0"],
            vec!["--commit-block", "18446744073709551616"],
            vec!["--commit-block", "42", "--commit-block", "43"],
            vec!["--typo"],
        ] {
            assert!(
                parse(&args).is_err(),
                "invalid arguments must never start the server"
            );
        }
    }
}
