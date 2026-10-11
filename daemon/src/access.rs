//! Wallet-authenticated, durable access requests. A session can manage messages,
//! but only an explicit owner approval or a verified transaction can grant authority.
use crate::{
    internal,
    router::{Engine, CHAIN_ID},
    store::Store,
    ApiError, ApiResult, AppState,
};
use alloy::{
    primitives::{Address, Signature, B256, U256},
    providers::Provider,
    rpc::types::{BlockId, BlockNumberOrTag, TransactionReceipt},
    sol,
    sol_types::{eip712_domain, SolCall, SolEvent, SolStruct},
};
use anyhow::{ensure, Context, Result};
use axum::{
    extract::{FromRef, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, LazyLock, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

const SESSION_PURPOSE: &str = "Manage agent access requests and notifications";
const SESSION_TTL: u64 = 900;
const REQUEST_TTL: u64 = 48 * 60 * 60;
const INBOX_LIMIT: usize = 100;
static ACTIVE_APPROVALS: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));
struct ApprovalWorker(String);
impl ApprovalWorker {
    fn start(key: String) -> Option<Self> {
        ACTIVE_APPROVALS
            .lock()
            .ok()?
            .insert(key.clone())
            .then_some(Self(key))
    }
    fn active(key: &str) -> bool {
        ACTIVE_APPROVALS
            .lock()
            .map(|active| active.contains(key))
            .unwrap_or(true)
    }
}
impl Drop for ApprovalWorker {
    fn drop(&mut self) {
        if let Ok(mut active) = ACTIVE_APPROVALS.lock() {
            active.remove(&self.0);
        }
    }
}

#[derive(Clone)]
struct AccessState {
    engine: Arc<Engine>,
    store: Store,
}
impl FromRef<AppState> for AccessState {
    fn from_ref(state: &AppState) -> Self {
        Self {
            engine: state.engine.clone(),
            store: state.store.clone(),
        }
    }
}

sol! {
    #[sol(rpc)]
    interface AccessRouter {
        function identityRegistry() external view returns (address);
        function delegates(uint256 agentId, address delegate) external view returns (address owner, uint64 expiresAt, uint256 ownershipEpoch);
        function isAuthorized(uint256 agentId, address account) external view returns (bool);
        function setDelegate(uint256 agentId, address delegate, uint64 expiresAt) external;
        event DelegateSet(uint256 indexed agentId, address indexed delegate, uint64 expiresAt, address owner);
    }
    #[sol(rpc)]
    interface AccessIdentity {
        function ownerOf(uint256 agentId) external view returns (address);
        function ownershipEpoch(uint256 agentId) external view returns (uint256);
    }
    struct AccessSession { address wallet; string purpose; uint64 expiresAt; }
    struct AccessApproval {
        bytes32 requestId;
        uint256 agentId;
        address requester;
        uint256 ownershipEpoch;
        uint64 expiresAt;
        uint64 deadline;
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Session {
    wallet: Address,
    expires_at: u64,
    signature: String,
}

impl Session {
    fn verify(&self, router: Address, now: u64) -> Result<Address> {
        ensure!(
            self.wallet != Address::ZERO
                && self.expires_at > now
                && self.expires_at <= now.saturating_add(SESSION_TTL),
            "session expired"
        );
        let digest = AccessSession { wallet: self.wallet, purpose: SESSION_PURPOSE.into(), expiresAt: self.expires_at }
            .eip712_signing_hash(&eip712_domain! { name: "AetherisAccess", version: "1", chain_id: CHAIN_ID, verifying_contract: router, });
        ensure!(
            recover(&self.signature, digest)? == self.wallet,
            "session signer mismatch"
        );
        Ok(self.wallet)
    }
}

fn recover(signature: &str, digest: B256) -> Result<Address> {
    ensure!(signature.len() == 132, "expected a 65-byte signature");
    let signature: Signature = signature.parse()?;
    ensure!(signature.normalize_s().is_none(), "noncanonical signature");
    Ok(signature.recover_address_from_prehash(&digest)?)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    auth: Session,
    action: String,
    payload: Value,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Record {
    id: B256,
    agent_id: String,
    owner: Address,
    requester: Address,
    ownership_epoch: String,
    duration_seconds: u64,
    reason: String,
    created_at: u64,
    request_expires_at: u64,
    status: String,
    decision_at: Option<u64>,
    decision_note: Option<String>,
    transaction_hash: Option<B256>,
    grant_expires_at: Option<u64>,
    approval_error: Option<String>,
    prepared_expires_at: Option<u64>,
    approval_deadline: Option<u64>,
    revision: u64,
    owner_seen: u64,
    requester_seen: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NewRequest {
    id: B256,
    agent_id: String,
    owner: Address,
    duration_seconds: u64,
    reason: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct IdPayload {
    id: B256,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Denial {
    id: B256,
    note: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Approval {
    id: B256,
    transaction_hash: B256,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Grant {
    id: B256,
    expires_at: u64,
    deadline: u64,
    authorization: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Seen {
    items: Vec<SeenItem>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SeenItem {
    id: B256,
    revision: u64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Page {
    cursor: Option<String>,
}

struct Snapshot {
    block: u64,
    time: u64,
    owner: Address,
    epoch: U256,
}

fn now() -> Result<u64> {
    Ok(SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs())
}
fn error(status: StatusCode, message: &str) -> ApiError {
    ApiError(status, message.into())
}
fn conflict(message: &str) -> ApiError {
    error(StatusCode::CONFLICT, message)
}
fn rpc_error(_: impl std::fmt::Display) -> ApiError {
    error(
        StatusCode::SERVICE_UNAVAILABLE,
        "Monad Testnet could not be reached. Try again.",
    )
}
fn payload<T: DeserializeOwned>(value: Value) -> Result<T, ApiError> {
    serde_json::from_value(value)
        .map_err(|_| error(StatusCode::BAD_REQUEST, "Invalid access request details."))
}
fn scope(engine: &Engine) -> String {
    format!("access:{CHAIN_ID}:{}", engine.router)
}
fn key(engine: &Engine, id: B256) -> String {
    format!("{}:request:{id}", scope(engine))
}
fn inbox_prefix(engine: &Engine, wallet: Address) -> String {
    format!("{}:inbox:{wallet}:", scope(engine))
}
fn index_key(engine: &Engine, record: &Record, wallet: Address) -> String {
    format!(
        "{}{:020}:{}",
        inbox_prefix(engine, wallet),
        u64::MAX - record.created_at,
        record.id
    )
}
fn copies(engine: &Engine, record: &Record) -> Vec<(String, Value)> {
    vec![
        (key(engine, record.id), json!(record)),
        (index_key(engine, record, record.owner), json!(record)),
        (index_key(engine, record, record.requester), json!(record)),
    ]
}
async fn save(state: &AccessState, old: &Record, new: &Record) -> Result<bool, ApiError> {
    state
        .store
        .compare_and_put(
            vec![(key(&state.engine, old.id), Some(json!(old)))],
            copies(&state.engine, new),
        )
        .await
        .map_err(internal)
}

async fn snapshot(engine: &Engine) -> Result<Snapshot> {
    let block = engine
        .provider
        .get_block_by_number(BlockNumberOrTag::Latest)
        .await?
        .context("latest block unavailable")?;
    let number = block.header.number;
    let router = AccessRouter::new(engine.router, &engine.provider);
    let identity = router
        .identityRegistry()
        .block(BlockId::number(number))
        .call()
        .await?;
    let registry = AccessIdentity::new(identity, &engine.provider);
    let owner = registry
        .ownerOf(U256::from(1))
        .block(BlockId::number(number))
        .call()
        .await?;
    let epoch = registry
        .ownershipEpoch(U256::from(1))
        .block(BlockId::number(number))
        .call()
        .await?;
    Ok(Snapshot {
        block: number,
        time: block.header.timestamp,
        owner,
        epoch,
    })
}

fn current_status<'a>(record: &'a Record, snapshot: &Snapshot) -> &'a str {
    if matches!(record.status.as_str(), "pending" | "approving") {
        if record.owner != snapshot.owner || record.ownership_epoch != snapshot.epoch.to_string() {
            return "invalidated";
        }
        if record.status == "pending" && snapshot.time >= record.request_expires_at {
            return "expired";
        }
    }
    &record.status
}

fn require_pending_owner(
    record: &Record,
    actor: Address,
    snapshot: &Snapshot,
) -> Result<(), ApiError> {
    if actor != record.owner || actor != snapshot.owner {
        return Err(error(
            StatusCode::FORBIDDEN,
            "Only the current agent owner can decide this request.",
        ));
    }
    if current_status(record, snapshot) != "pending" {
        return Err(conflict(
            "This request is no longer awaiting a decision. Refresh your notifications.",
        ));
    }
    Ok(())
}

async fn find(state: &AccessState, id: B256, actor: Address) -> Result<Record, ApiError> {
    let record = state
        .store
        .get::<Record>(key(&state.engine, id))
        .await
        .map_err(internal)?;
    record
        .filter(|record| record.owner == actor || record.requester == actor)
        .ok_or_else(|| {
            error(
                StatusCode::NOT_FOUND,
                "Access request not found for this wallet.",
            )
        })
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/v1/access-requests/config", get(config))
        .route("/v1/access-requests", post(handle))
}

async fn config(State(state): State<AccessState>) -> ApiResult {
    let identity = AccessRouter::new(state.engine.router, &state.engine.provider)
        .identityRegistry()
        .call()
        .await
        .map_err(rpc_error)?;
    Ok(Json(json!({"chainId": CHAIN_ID, "router": state.engine.router, "identity": identity, "sessionTtlSeconds": SESSION_TTL, "relayers": state.engine.addresses()})).into_response())
}

async fn handle(State(state): State<AccessState>, Json(envelope): Json<Envelope>) -> ApiResult {
    let actor = envelope
        .auth
        .verify(state.engine.router, now().map_err(internal)?)
        .map_err(|_| {
            error(
                StatusCode::UNAUTHORIZED,
                "Your notification session expired or could not be verified. Sign in again.",
            )
        })?;
    let snap = snapshot(&state.engine).await.map_err(rpc_error)?;
    let mut extra = None;
    let mut cursor = None;
    match envelope.action.as_str() {
        "list" => {
            cursor = payload::<Page>(envelope.payload)?.cursor;
        }
        "request" => create(&state, actor, payload(envelope.payload)?, &snap).await?,
        "deny" => deny(&state, actor, payload(envelope.payload)?, &snap).await?,
        "prepare" => extra = Some(prepare(&state, actor, payload(envelope.payload)?, &snap).await?),
        "cancel" => cancel(&state, actor, payload(envelope.payload)?, &snap).await?,
        "grant" => grant(&state, actor, payload(envelope.payload)?, &snap).await?,
        "approve" => approve(&state, actor, payload(envelope.payload)?, &snap).await?,
        "seen" => seen(&state, actor, payload(envelope.payload)?).await?,
        _ => {
            return Err(error(
                StatusCode::BAD_REQUEST,
                "Unknown access request action.",
            ))
        }
    }
    let (requests, next_cursor) = page(&state, actor, &snap, cursor).await?;
    let mut response = json!({"requests": requests, "nextCursor": next_cursor});
    if let Some(approval) = extra {
        response["approval"] = approval;
    }
    Ok(Json(response).into_response())
}

async fn create(
    state: &AccessState,
    actor: Address,
    request: NewRequest,
    snap: &Snapshot,
) -> Result<(), ApiError> {
    let reason = request.reason.trim();
    if request.agent_id != "1"
        || request.id == B256::ZERO
        || ![3600, 21600, 86400, 604800].contains(&request.duration_seconds)
        || reason.is_empty()
        || reason.chars().count() > 500
    {
        return Err(error(
            StatusCode::BAD_REQUEST,
            "Choose a duration and enter a reason of 1–500 characters for Agent #1.",
        ));
    }
    if request.owner != snap.owner {
        return Err(conflict(
            "The agent owner has changed. Refresh the agent before requesting access.",
        ));
    }
    if actor == snap.owner || state.engine.addresses().contains(&actor) {
        return Err(error(
            StatusCode::BAD_REQUEST,
            "Use a separate task wallet. The agent owner already has authority.",
        ));
    }
    if let Some(existing) = state
        .store
        .get::<Record>(key(&state.engine, request.id))
        .await
        .map_err(internal)?
    {
        if existing.requester == actor
            && existing.owner == request.owner
            && existing.duration_seconds == request.duration_seconds
            && existing.reason == reason
        {
            return Ok(());
        }
        return Err(conflict(
            "This request ID has already been used. Start a new request.",
        ));
    }
    let pending_key = format!("{}:pending:{}:{}", scope(&state.engine), actor, snap.epoch);
    let day_key = format!(
        "{}:daily:{}:{}",
        scope(&state.engine),
        actor,
        snap.time / 86400
    );
    for _ in 0..5 {
        let previous = state
            .store
            .get::<B256>(pending_key.clone())
            .await
            .map_err(internal)?;
        if let Some(id) = previous {
            if let Some(existing) = state
                .store
                .get::<Record>(key(&state.engine, id))
                .await
                .map_err(internal)?
            {
                if id == request.id
                    && existing.owner == request.owner
                    && existing.duration_seconds == request.duration_seconds
                    && existing.reason == reason
                {
                    return Ok(());
                }
                if matches!(current_status(&existing, snap), "pending" | "approving") {
                    return Err(conflict("You already have a pending request for this agent. Open notifications to follow it."));
                }
            }
        }
        let count = state
            .store
            .get::<u64>(day_key.clone())
            .await
            .map_err(internal)?;
        if count.unwrap_or_default() >= 5 {
            return Err(error(
                StatusCode::TOO_MANY_REQUESTS,
                "You can send up to five access requests per day. Try again tomorrow.",
            ));
        }
        let record = Record {
            id: request.id,
            agent_id: "1".into(),
            owner: snap.owner,
            requester: actor,
            ownership_epoch: snap.epoch.to_string(),
            duration_seconds: request.duration_seconds,
            reason: reason.into(),
            created_at: snap.time,
            request_expires_at: snap.time.saturating_add(REQUEST_TTL),
            status: "pending".into(),
            decision_at: None,
            decision_note: None,
            transaction_hash: None,
            grant_expires_at: None,
            approval_error: None,
            prepared_expires_at: None,
            approval_deadline: None,
            revision: 1,
            owner_seen: 0,
            requester_seen: 1,
        };
        let mut records = copies(&state.engine, &record);
        records.push((pending_key.clone(), json!(request.id)));
        records.push((day_key.clone(), json!(count.unwrap_or_default() + 1)));
        if state
            .store
            .compare_and_put(
                vec![
                    (key(&state.engine, request.id), None),
                    (pending_key.clone(), previous.map(|v| json!(v))),
                    (day_key.clone(), count.map(|v| json!(v))),
                ],
                records,
            )
            .await
            .map_err(internal)?
        {
            return Ok(());
        }
    }
    Err(conflict(
        "Another request was updated at the same time. Refresh and try again.",
    ))
}

async fn deny(
    state: &AccessState,
    actor: Address,
    denial: Denial,
    snap: &Snapshot,
) -> Result<(), ApiError> {
    let old = find(state, denial.id, actor).await?;
    if old.status == "denied" && old.owner == actor {
        return Ok(());
    }
    require_pending_owner(&old, actor, snap)?;
    let note = denial.note.trim();
    if note.chars().count() > 500 {
        return Err(error(
            StatusCode::BAD_REQUEST,
            "The decision note must be at most 500 characters.",
        ));
    }
    let mut new = old.clone();
    new.status = "denied".into();
    new.decision_at = Some(snap.time);
    new.decision_note = Some(note.into());
    new.revision += 1;
    new.owner_seen = new.revision;
    if !save(state, &old, &new).await? {
        return Err(conflict(
            "This request changed while you were deciding. Refresh notifications.",
        ));
    }
    Ok(())
}

async fn prepare(
    state: &AccessState,
    actor: Address,
    request: IdPayload,
    snap: &Snapshot,
) -> Result<Value, ApiError> {
    let old = find(state, request.id, actor).await?;
    let relayed = state.engine.addresses().contains(&actor);
    if !relayed
        && old.owner == actor
        && snap.owner == actor
        && current_status(&old, snap) == "approving"
    {
        return Ok(
            json!({"id": old.id, "expiresAt": old.prepared_expires_at, "deadline": old.approval_deadline, "ownershipEpoch": old.ownership_epoch, "relayed": false}),
        );
    }
    require_pending_owner(&old, actor, snap)?;
    let mut new = old.clone();
    new.prepared_expires_at = Some(snap.time.saturating_add(old.duration_seconds));
    new.approval_deadline = Some(snap.time.saturating_add(300));
    if !relayed {
        new.status = "approving".into();
        new.grant_expires_at = new.prepared_expires_at;
    }
    if !save(state, &old, &new).await? {
        return Err(conflict(
            "This request changed. Refresh notifications before approving.",
        ));
    }
    Ok(
        json!({"id": old.id, "expiresAt": new.prepared_expires_at, "deadline": new.approval_deadline, "ownershipEpoch": old.ownership_epoch, "relayed": relayed}),
    )
}

async fn cancel(
    state: &AccessState,
    actor: Address,
    request: IdPayload,
    snap: &Snapshot,
) -> Result<(), ApiError> {
    let old = find(state, request.id, actor).await?;
    if actor != old.owner || actor != snap.owner || state.engine.addresses().contains(&actor) {
        return Err(error(
            StatusCode::FORBIDDEN,
            "Only a browser approval that was rejected before submission can be cancelled.",
        ));
    }
    if old.status == "pending" {
        return Ok(());
    }
    if current_status(&old, snap) != "approving" || old.transaction_hash.is_some() {
        return Err(conflict("This approval may already have been submitted. Confirm its transaction instead of cancelling."));
    }
    let mut new = old.clone();
    new.status = "pending".into();
    new.prepared_expires_at = None;
    new.approval_deadline = None;
    new.grant_expires_at = None;
    if !save(state, &old, &new).await? {
        return Err(conflict(
            "This request changed while cancelling. Refresh notifications.",
        ));
    }
    Ok(())
}

fn verify_approval(record: &Record, grant: &Grant, router: Address, snap: &Snapshot) -> Result<()> {
    ensure!(
        Some(grant.expires_at) == record.prepared_expires_at
            && Some(grant.deadline) == record.approval_deadline,
        "approval differs from prepared request"
    );
    ensure!(
        grant.deadline > snap.time && grant.deadline <= snap.time.saturating_add(300),
        "approval deadline expired"
    );
    ensure!(
        grant.expires_at > snap.time
            && grant
                .expires_at
                .abs_diff(snap.time.saturating_add(record.duration_seconds))
                <= 300,
        "approval duration mismatch"
    );
    let typed = AccessApproval {
        requestId: record.id,
        agentId: record.agent_id.parse()?,
        requester: record.requester,
        ownershipEpoch: record.ownership_epoch.parse()?,
        expiresAt: grant.expires_at,
        deadline: grant.deadline,
    };
    let digest = typed.eip712_signing_hash(&eip712_domain! { name: "AetherisAccess", version: "1", chain_id: CHAIN_ID, verifying_contract: router, });
    ensure!(
        recover(&grant.authorization, digest)? == record.owner,
        "approval was not signed by owner"
    );
    Ok(())
}

async fn grant(
    state: &AccessState,
    actor: Address,
    approval: Grant,
    snap: &Snapshot,
) -> Result<(), ApiError> {
    let old = find(state, approval.id, actor).await?;
    if old.owner != actor {
        return Err(error(
            StatusCode::FORBIDDEN,
            "Only the owner can approve access.",
        ));
    }
    if matches!(old.status.as_str(), "approving" | "approved") {
        return Ok(());
    }
    require_pending_owner(&old, actor, snap)?;
    if !state.engine.addresses().contains(&actor) {
        return Err(error(
            StatusCode::BAD_REQUEST,
            "Approve this request with an owner-wallet transaction.",
        ));
    }
    verify_approval(&old, &approval, state.engine.router, snap).map_err(|_| error(StatusCode::UNAUTHORIZED, "The owner approval signature expired or did not match this request. Prepare approval again."))?;
    let mut new = old.clone();
    new.status = "approving".into();
    new.grant_expires_at = Some(approval.expires_at);
    new.approval_error = None;
    let worker = ApprovalWorker::start(key(&state.engine, old.id))
        .ok_or_else(|| conflict("This approval is already being processed."))?;
    if !save(state, &old, &new).await? {
        return Err(conflict(
            "This request already has another decision. Refresh notifications.",
        ));
    }
    let state = state.clone();
    tokio::spawn(async move {
        let worker = worker;
        let outcome = state
            .engine
            .approve_access(
                new.owner,
                U256::from(1),
                new.requester,
                approval.expires_at,
                snap_epoch(&new),
                approval.deadline,
                new.id,
            )
            .await;
        let hash = match outcome {
            Ok(hash) => Some(hash),
            Err(_) => state
                .store
                .get::<B256>(format!("access-grant:{}", new.id))
                .await
                .ok()
                .flatten(),
        };
        if let Ok(mut latest) = find(&state, new.id, new.owner).await {
            if latest.status != "approving" {
                return;
            }
            if let (Some(hash), Ok(snapshot)) = (hash, snapshot(&state.engine).await) {
                if let Ok(confirmed) = approved_record(&state, &latest, hash, &snapshot).await {
                    let _ = save(&state, &latest, &confirmed).await;
                    return;
                }
            }
            let old = latest.clone();
            latest.transaction_hash = hash;
            latest.approval_error = Some(if hash.is_some() { "Approval was submitted. Confirmation is still being checked; no additional approval will be sent." } else { "Approval could not be confirmed. The owner should reconcile this request before trying another transaction." }.into());
            let _ = save(&state, &old, &latest).await;
        }
        drop(worker);
        if let Ok(latest) = find(&state, new.id, new.owner).await {
            let _ = recover_unsubmitted(&state, &latest).await;
        }
    });
    Ok(())
}

fn snap_epoch(record: &Record) -> U256 {
    record
        .ownership_epoch
        .parse()
        .expect("validated stored ownership epoch")
}

fn receipt_event(
    receipt: &TransactionReceipt,
    hash: B256,
    router: Address,
    record: &Record,
) -> Result<u64> {
    ensure!(
        receipt.status()
            && receipt.transaction_hash == hash
            && receipt.from == record.owner
            && receipt.to == Some(router),
        "receipt does not match owner approval"
    );
    let block = receipt.block_number.context("receipt block absent")?;
    let block_hash = receipt.block_hash.context("receipt block hash absent")?;
    ensure!(
        block_hash != B256::ZERO && receipt.transaction_index.is_some(),
        "invalid receipt metadata"
    );
    let mut expiry = None;
    for log in receipt.logs().iter().filter(|log| {
        log.address() == router && log.topic0() == Some(&AccessRouter::DelegateSet::SIGNATURE_HASH)
    }) {
        ensure!(
            !log.removed
                && log.block_number == Some(block)
                && log.block_hash == Some(block_hash)
                && log.transaction_hash == Some(hash)
                && log.transaction_index == receipt.transaction_index
                && log.log_index.is_some(),
            "inconsistent receipt event metadata"
        );
        let event = log
            .log_decode_validate::<AccessRouter::DelegateSet>()?
            .inner
            .data;
        ensure!(
            expiry.is_none()
                && event.agentId == U256::from(1)
                && event.delegate == record.requester
                && event.owner == record.owner
                && event.expiresAt != 0,
            "wrong delegation event"
        );
        expiry = Some(event.expiresAt);
    }
    expiry.context("delegation event absent")
}

async fn verify_transaction(
    engine: &Engine,
    record: &Record,
    hash: B256,
    snap: &Snapshot,
) -> Result<u64> {
    let receipt = engine
        .provider
        .get_transaction_receipt(hash)
        .await?
        .context("approval receipt pending")?;
    let expires = receipt_event(&receipt, hash, engine.router, record)?;
    let number = receipt.block_number.context("receipt block absent")?;
    ensure!(
        snap.block >= number.saturating_add(1),
        "two confirmations required"
    );
    let block = engine
        .provider
        .get_block_by_number(BlockNumberOrTag::Number(number))
        .await?
        .context("approval block missing")?;
    ensure!(
        block.header.number == number
            && Some(block.header.hash) == receipt.block_hash
            && block.header.timestamp >= record.created_at,
        "receipt is not canonical or predates request"
    );
    let latest_permitted_expiry = block
        .header
        .timestamp
        .saturating_add(record.duration_seconds);
    if let Some(prepared) = record.prepared_expires_at {
        ensure!(
            expires == prepared
                && expires > block.header.timestamp
                && expires <= latest_permitted_expiry.saturating_add(300),
            "delegation differs from prepared approval"
        );
    } else {
        ensure!(
            expires.abs_diff(latest_permitted_expiry) <= 300 && expires > block.header.timestamp,
            "delegation duration does not match request"
        );
    }
    let transaction = engine
        .rpc("eth_getTransactionByHash", json!([hash]))
        .await?;
    let input = transaction["input"]
        .as_str()
        .context("transaction input absent")?;
    let expected = AccessRouter::setDelegateCall {
        agentId: U256::from(1),
        delegate: record.requester,
        expiresAt: expires,
    }
    .abi_encode();
    ensure!(
        input == format!("0x{}", hex::encode(expected)),
        "wrong delegation calldata"
    );
    let router = AccessRouter::new(engine.router, &engine.provider);
    let identity = router
        .identityRegistry()
        .block(BlockId::number(number))
        .call()
        .await?;
    let registry = AccessIdentity::new(identity, &engine.provider);
    let owner = registry
        .ownerOf(U256::from(1))
        .block(BlockId::number(number))
        .call()
        .await?;
    let epoch = registry
        .ownershipEpoch(U256::from(1))
        .block(BlockId::number(number))
        .call()
        .await?;
    let grant = router
        .delegates(U256::from(1), record.requester)
        .block(BlockId::number(number))
        .call()
        .await?;
    ensure!(
        owner == record.owner
            && epoch == snap_epoch(record)
            && grant.owner == record.owner
            && grant.expiresAt == expires
            && grant.ownershipEpoch == epoch,
        "confirmed delegation differs from receipt"
    );
    Ok(expires)
}

async fn approved_record(
    state: &AccessState,
    old: &Record,
    hash: B256,
    snap: &Snapshot,
) -> Result<Record> {
    let expiry = verify_transaction(&state.engine, old, hash, snap).await?;
    let mut new = old.clone();
    new.status = "approved".into();
    new.transaction_hash = Some(hash);
    new.grant_expires_at = Some(expiry);
    new.decision_at = Some(snap.time);
    new.approval_error = None;
    new.revision += 1;
    new.owner_seen = new.revision;
    Ok(new)
}

async fn approve(
    state: &AccessState,
    actor: Address,
    approval: Approval,
    snap: &Snapshot,
) -> Result<(), ApiError> {
    let old = find(state, approval.id, actor).await?;
    if actor != old.owner {
        return Err(error(
            StatusCode::FORBIDDEN,
            "Only the approving owner can confirm this transaction.",
        ));
    }
    if old.status == "approved" && old.transaction_hash == Some(approval.transaction_hash) {
        return Ok(());
    }
    if !matches!(old.status.as_str(), "pending" | "approving") {
        return Err(conflict("This request is no longer awaiting approval."));
    }
    let new = approved_record(state, &old, approval.transaction_hash, snap).await.map_err(|_| conflict("The delegation transaction is not yet confirmed for this exact request. Check its receipt and retry confirmation; do not submit another grant."))?;
    if !save(state, &old, &new).await? {
        return Err(conflict(
            "The request changed while its receipt was checked. Refresh notifications.",
        ));
    }
    Ok(())
}

async fn seen(state: &AccessState, actor: Address, request: Seen) -> Result<(), ApiError> {
    if request.items.len() > INBOX_LIMIT {
        return Err(error(StatusCode::BAD_REQUEST, "Too many notification IDs."));
    }
    for item in request.items {
        for _ in 0..3 {
            let old = find(state, item.id, actor).await?;
            if old.revision != item.revision {
                break;
            }
            let mut new = old.clone();
            if actor == new.owner {
                new.owner_seen = new.revision;
            } else {
                new.requester_seen = new.revision;
            }
            if save(state, &old, &new).await? {
                break;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
async fn list(
    state: &AccessState,
    actor: Address,
    snap: &Snapshot,
) -> Result<Vec<Value>, ApiError> {
    Ok(page(state, actor, snap, None).await?.0)
}

async fn recover_unsubmitted(
    state: &AccessState,
    record: &Record,
) -> Result<Option<Record>, ApiError> {
    if record.status != "approving"
        || !state.engine.addresses().contains(&record.owner)
        || record.transaction_hash.is_some()
        || ApprovalWorker::active(&key(&state.engine, record.id))
    {
        return Ok(None);
    }
    let journal = crate::router::access_grant_journal_key(record.id);
    for suffix in ["", ":approval-intent", ":broadcast-intent"] {
        if state
            .store
            .get::<Value>(format!("{journal}{suffix}"))
            .await
            .map_err(internal)?
            .is_some()
        {
            return Ok(None);
        }
    }
    let mut new = record.clone();
    new.status = "pending".into();
    new.prepared_expires_at = None;
    new.approval_deadline = None;
    new.grant_expires_at = None;
    new.approval_error =
        Some("Approval was not submitted. Prepare and sign a new approval to retry.".into());
    new.revision += 1;
    if save(state, record, &new).await? {
        Ok(Some(new))
    } else {
        Ok(None)
    }
}

async fn page(
    state: &AccessState,
    actor: Address,
    snap: &Snapshot,
    cursor: Option<String>,
) -> Result<(Vec<Value>, Option<String>), ApiError> {
    let prefix = inbox_prefix(&state.engine, actor);
    let after = match cursor {
        None => None,
        Some(cursor) => {
            let (timestamp, id) = cursor
                .split_once(':')
                .ok_or_else(|| error(StatusCode::BAD_REQUEST, "Invalid notification page."))?;
            if timestamp.len() != 20
                || !timestamp.bytes().all(|byte| byte.is_ascii_digit())
                || timestamp.parse::<u64>().is_err()
                || id.parse::<B256>().is_err()
            {
                return Err(error(StatusCode::BAD_REQUEST, "Invalid notification page."));
            }
            Some(format!("{prefix}{cursor}"))
        }
    };
    let mut records = if after.is_some() {
        state
            .store
            .scan_prefix_after::<Record>(prefix, after, INBOX_LIMIT + 1)
            .await
            .map_err(internal)?
    } else {
        state
            .store
            .scan_prefix::<Record>(prefix, INBOX_LIMIT + 1)
            .await
            .map_err(internal)?
    };
    let next_cursor = if records.len() > INBOX_LIMIT {
        records.truncate(INBOX_LIMIT);
        records
            .last()
            .map(|record| format!("{:020}:{}", u64::MAX - record.created_at, record.id))
    } else {
        None
    };
    let mut resolved = Vec::with_capacity(records.len());
    for mut record in records {
        if record.owner != actor && record.requester != actor {
            continue;
        }
        if let Some(recovered) = recover_unsubmitted(state, &record).await? {
            record = recovered;
        }
        if record.status == "approving" {
            let hash = if record.transaction_hash.is_some() {
                record.transaction_hash
            } else {
                state
                    .store
                    .get::<B256>(format!("access-grant:{}", record.id))
                    .await
                    .map_err(internal)?
            };
            if let Some(hash) = hash {
                if let Ok(updated) = approved_record(state, &record, hash, snap).await {
                    if save(state, &record, &updated).await? {
                        record = updated;
                    }
                } else {
                    record.transaction_hash = Some(hash);
                }
            }
        }
        resolved.push(record);
    }
    let mut authorities = HashMap::new();
    let mut reads = tokio::task::JoinSet::new();
    let capacity = Arc::new(tokio::sync::Semaphore::new(8));
    let wallets: HashSet<_> = resolved
        .iter()
        .filter(|record| record.status == "approved")
        .map(|record| record.requester)
        .collect();
    for wallet in wallets {
        let engine = state.engine.clone();
        let block = snap.block;
        let capacity = capacity.clone();
        reads.spawn(async move {
            let _permit = capacity.acquire().await.ok()?;
            let router = AccessRouter::new(engine.router, &engine.provider);
            let value = router
                .isAuthorized(U256::from(1), wallet)
                .block(BlockId::number(block))
                .call()
                .await
                .ok()?;
            Some((wallet, value))
        });
    }
    // Current access is supplementary to the durable decision. A slow RPC must
    // not make the inbox disappear or manufacture a revoked/active status.
    let _ = tokio::time::timeout(std::time::Duration::from_secs(4), async {
        while let Some(result) = reads.join_next().await {
            if let Ok(Some((wallet, authority))) = result {
                authorities.insert(wallet, authority);
            }
        }
    })
    .await;
    reads.abort_all();
    let mut views = Vec::with_capacity(resolved.len());
    for record in resolved {
        let status = current_status(&record, snap);
        let current_authority = authorities.get(&record.requester).copied();
        views.push(json!({"id": record.id, "agentId": record.agent_id, "owner": record.owner, "requester": record.requester,
            "durationSeconds": record.duration_seconds, "reason": record.reason, "createdAt": record.created_at, "requestExpiresAt": record.request_expires_at,
            "status": status, "decisionAt": record.decision_at, "decisionNote": record.decision_note, "transactionHash": record.transaction_hash,
            "grantExpiresAt": record.grant_expires_at, "approvalError": record.approval_error, "revision": record.revision, "unread": if actor == record.owner { record.owner_seen < record.revision } else { record.requester_seen < record.revision }, "currentAuthority": current_authority}));
    }
    Ok((views, next_cursor))
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::{
        primitives::keccak256,
        providers::ProviderBuilder,
        signers::{local::PrivateKeySigner, SignerSync},
        sol_types::SolValue,
    };
    use tokio::sync::Semaphore;

    fn state_with_store(store: Store, endpoint: &str) -> AccessState {
        let _ = rustls::crypto::ring::default_provider().install_default();
        let engine = Arc::new(Engine {
            provider: ProviderBuilder::new()
                .connect_http(endpoint.parse().unwrap())
                .erased(),
            router: Address::repeat_byte(2),
            relayers: vec![],
            permits: Arc::new(Semaphore::new(1)),
            confirmations: 2,
            store: store.clone(),
            http: reqwest::Client::new(),
            rpc_url: endpoint.into(),
        });
        AccessState { engine, store }
    }

    fn fixture() -> (AccessState, Snapshot, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let state = state_with_store(
            Store::open(dir.path().join("access.redb")).unwrap(),
            "http://127.0.0.1:1",
        );
        let snapshot = Snapshot {
            block: 50,
            time: 10000,
            owner: Address::repeat_byte(1),
            epoch: U256::from(1),
        };
        (state, snapshot, dir)
    }

    fn request(id: u8, snapshot: &Snapshot) -> NewRequest {
        NewRequest {
            id: B256::repeat_byte(id),
            agent_id: "1".into(),
            owner: snapshot.owner,
            duration_seconds: 3600,
            reason: "Read a block for my research".into(),
        }
    }

    fn expect_error<T>(result: Result<T, ApiError>, status: StatusCode) {
        match result {
            Err(error) => assert_eq!(error.0, status, "{}", error.1),
            Ok(_) => panic!("expected {status}"),
        }
    }

    #[test]
    fn inbox_session_binds_wallet_purpose_contract_network_and_expiry() {
        let signer: PrivateKeySigner = hex::encode([7u8; 32]).parse().unwrap();
        let router = Address::repeat_byte(2);
        let message = AccessSession {
            wallet: signer.address(),
            purpose: SESSION_PURPOSE.into(),
            expiresAt: 10900,
        };
        let digest = message.eip712_signing_hash(&eip712_domain! { name: "AetherisAccess", version: "1", chain_id: CHAIN_ID, verifying_contract: router, });
        let mut session = Session {
            wallet: signer.address(),
            expires_at: 10900,
            signature: signer.sign_hash_sync(&digest).unwrap().to_string(),
        };
        assert_eq!(session.verify(router, 10000).unwrap(), signer.address());
        assert!(session.verify(Address::repeat_byte(3), 10000).is_err());
        assert!(session.verify(router, 9999).is_err());
        assert!(session.verify(router, 10900).is_err());
        session.wallet = Address::repeat_byte(9);
        assert!(session.verify(router, 10000).is_err());
        session.wallet = signer.address();
        session.expires_at -= 1;
        assert!(session.verify(router, 10000).is_err());
        session.expires_at += 1;
        let wrong = AccessSession {
            purpose: "Grant executor access".into(),
            ..message
        };
        let wrong = wrong.eip712_signing_hash(&eip712_domain! { name: "AetherisAccess", version: "1", chain_id: CHAIN_ID, verifying_contract: router, });
        session.signature = signer.sign_hash_sync(&wrong).unwrap().to_string();
        assert!(session.verify(router, 10000).is_err());
    }

    #[test]
    fn typed_signatures_match_frontend_viem_vectors() {
        let domain = eip712_domain! { name: "AetherisAccess", version: "1", chain_id: CHAIN_ID, verifying_contract: Address::repeat_byte(0x33), };
        let session = AccessSession {
            wallet: Address::repeat_byte(0x11),
            purpose: SESSION_PURPOSE.into(),
            expiresAt: 1800000800,
        };
        assert_eq!(
            session.eip712_signing_hash(&domain).to_string(),
            "0x2d74ebd083f940e38b8f761af96b5df8db2f2be8eb9a3d0c066499f5d54db1bd"
        );
        let approval = AccessApproval {
            requestId: B256::repeat_byte(0x55),
            agentId: U256::from(1),
            requester: Address::repeat_byte(0x22),
            ownershipEpoch: U256::from(2),
            expiresAt: 1800003600,
            deadline: 1800000300,
        };
        assert_eq!(
            approval.eip712_signing_hash(&domain).to_string(),
            "0x4aff28fb06ea96bcf7bfad2aaf0d4460178900bd2cb4849198561b53e352147c"
        );
    }

    #[tokio::test]
    async fn requests_are_idempotent_private_and_deduplicated_under_concurrency() {
        let (state, snap, _dir) = fixture();
        let requester = Address::repeat_byte(4);
        let (a, b) = tokio::join!(
            create(&state, requester, request(10, &snap), &snap),
            create(&state, requester, request(11, &snap), &snap)
        );
        assert_ne!(a.is_ok(), b.is_ok());
        let id = if a.is_ok() { 10 } else { 11 };
        assert!(create(&state, requester, request(id, &snap), &snap)
            .await
            .is_ok());
        assert_eq!(list(&state, requester, &snap).await.unwrap().len(), 1);
        let owner = list(&state, snap.owner, &snap).await.unwrap();
        assert_eq!(owner.len(), 1);
        assert_eq!(owner[0]["unread"], true);
        assert!(list(&state, Address::repeat_byte(8), &snap)
            .await
            .unwrap()
            .is_empty());
        expect_error(
            find(&state, B256::repeat_byte(id), Address::repeat_byte(8)).await,
            StatusCode::NOT_FOUND,
        );
        expect_error(
            create(&state, Address::repeat_byte(8), request(id, &snap), &snap).await,
            StatusCode::CONFLICT,
        );
        expect_error(
            deny(
                &state,
                requester,
                Denial {
                    id: B256::repeat_byte(id),
                    note: "spoof".into(),
                },
                &snap,
            )
            .await,
            StatusCode::FORBIDDEN,
        );
    }

    #[tokio::test]
    async fn denial_notification_survives_restart_and_stale_seen_cannot_hide_it() {
        let (state, snap, dir) = fixture();
        let requester = Address::repeat_byte(4);
        let id = B256::repeat_byte(10);
        assert!(create(&state, requester, request(10, &snap), &snap)
            .await
            .is_ok());
        assert!(deny(
            &state,
            snap.owner,
            Denial {
                id,
                note: "Try tomorrow".into()
            },
            &snap
        )
        .await
        .is_ok());
        assert!(seen(
            &state,
            requester,
            Seen {
                items: vec![SeenItem { id, revision: 1 }]
            }
        )
        .await
        .is_ok());
        let result = list(&state, requester, &snap).await.unwrap();
        assert_eq!(result[0]["status"], "denied");
        assert_eq!(result[0]["unread"], true);
        assert_eq!(result[0]["revision"], 2);
        drop(state);
        let state = state_with_store(
            Store::open(dir.path().join("access.redb")).unwrap(),
            "http://127.0.0.1:1",
        );
        let result = list(&state, requester, &snap).await.unwrap();
        assert_eq!(result[0]["decisionNote"], "Try tomorrow");
        assert_eq!(result[0]["unread"], true);
        assert!(seen(
            &state,
            requester,
            Seen {
                items: vec![SeenItem { id, revision: 2 }]
            }
        )
        .await
        .is_ok());
        assert_eq!(
            list(&state, requester, &snap).await.unwrap()[0]["unread"],
            false
        );
    }

    #[tokio::test]
    async fn preparing_browser_approval_excludes_denial_until_explicit_cancel() {
        let (state, snap, _dir) = fixture();
        let requester = Address::repeat_byte(4);
        let id = B256::repeat_byte(10);
        assert!(create(&state, requester, request(10, &snap), &snap)
            .await
            .is_ok());
        let approval = prepare(&state, snap.owner, IdPayload { id }, &snap)
            .await
            .ok()
            .unwrap();
        let again = prepare(
            &state,
            snap.owner,
            IdPayload { id },
            &Snapshot {
                time: snap.time + 20,
                ..snap
            },
        )
        .await
        .ok()
        .unwrap();
        assert_eq!(approval, again);
        expect_error(
            deny(
                &state,
                snap.owner,
                Denial {
                    id,
                    note: "No".into(),
                },
                &snap,
            )
            .await,
            StatusCode::CONFLICT,
        );
        expect_error(
            cancel(&state, requester, IdPayload { id }, &snap).await,
            StatusCode::FORBIDDEN,
        );
        assert!(cancel(&state, snap.owner, IdPayload { id }, &snap)
            .await
            .is_ok());
        assert!(deny(
            &state,
            snap.owner,
            Denial {
                id,
                note: "No".into()
            },
            &snap
        )
        .await
        .is_ok());
    }

    #[tokio::test]
    async fn pending_requests_expire_and_transfer_away_and_back_invalidates_epoch() {
        let (state, mut snap, _dir) = fixture();
        let requester = Address::repeat_byte(4);
        assert!(create(&state, requester, request(10, &snap), &snap)
            .await
            .is_ok());
        snap.time += REQUEST_TTL;
        assert_eq!(
            list(&state, requester, &snap).await.unwrap()[0]["status"],
            "expired"
        );
        snap.time -= REQUEST_TTL;
        snap.epoch += U256::from(2);
        assert_eq!(
            list(&state, requester, &snap).await.unwrap()[0]["status"],
            "invalidated"
        );
        expect_error(
            prepare(
                &state,
                snap.owner,
                IdPayload {
                    id: B256::repeat_byte(10),
                },
                &snap,
            )
            .await,
            StatusCode::CONFLICT,
        );
        assert!(create(&state, requester, request(11, &snap), &snap)
            .await
            .is_ok());
    }

    #[tokio::test]
    async fn request_rate_limit_and_details_cannot_be_bypassed_with_new_ids() {
        let (state, snap, _dir) = fixture();
        let requester = Address::repeat_byte(4);
        let mut bad = request(2, &snap);
        bad.owner = requester;
        expect_error(
            create(&state, requester, bad, &snap).await,
            StatusCode::CONFLICT,
        );
        let mut bad = request(2, &snap);
        bad.agent_id = "2".into();
        expect_error(
            create(&state, requester, bad, &snap).await,
            StatusCode::BAD_REQUEST,
        );
        for id in 10..15 {
            assert!(create(&state, requester, request(id, &snap), &snap)
                .await
                .is_ok());
            assert!(deny(
                &state,
                snap.owner,
                Denial {
                    id: B256::repeat_byte(id),
                    note: "No".into()
                },
                &snap
            )
            .await
            .is_ok());
        }
        expect_error(
            create(&state, requester, request(15, &snap), &snap).await,
            StatusCode::TOO_MANY_REQUESTS,
        );
    }

    #[tokio::test]
    async fn owner_approval_signature_is_distinct_and_binds_every_grant_field() {
        let (state, mut snap, _dir) = fixture();
        let signer: PrivateKeySigner = hex::encode([7u8; 32]).parse().unwrap();
        snap.owner = signer.address();
        let requester = Address::repeat_byte(4);
        let id = B256::repeat_byte(10);
        assert!(create(&state, requester, request(10, &snap), &snap)
            .await
            .is_ok());
        assert!(prepare(&state, snap.owner, IdPayload { id }, &snap)
            .await
            .is_ok());
        let record = find(&state, id, requester).await.ok().unwrap();
        let typed = AccessApproval {
            requestId: id,
            agentId: U256::from(1),
            requester,
            ownershipEpoch: snap.epoch,
            expiresAt: 13600,
            deadline: 10300,
        };
        let digest = typed.eip712_signing_hash(&eip712_domain! { name: "AetherisAccess", version: "1", chain_id: CHAIN_ID, verifying_contract: state.engine.router, });
        let grant = Grant {
            id,
            expires_at: 13600,
            deadline: 10300,
            authorization: signer.sign_hash_sync(&digest).unwrap().to_string(),
        };
        assert!(verify_approval(&record, &grant, state.engine.router, &snap).is_ok());
        let mut bad = record.clone();
        bad.requester = Address::repeat_byte(5);
        assert!(verify_approval(&bad, &grant, state.engine.router, &snap).is_err());
        let mut bad = record.clone();
        bad.id = B256::repeat_byte(11);
        assert!(verify_approval(&bad, &grant, state.engine.router, &snap).is_err());
        let mut bad = record.clone();
        bad.ownership_epoch = "2".into();
        assert!(verify_approval(&bad, &grant, state.engine.router, &snap).is_err());
        let mut bad = record.clone();
        bad.duration_seconds = 86400;
        assert!(verify_approval(&bad, &grant, state.engine.router, &snap).is_err());
        assert!(verify_approval(&record, &grant, Address::repeat_byte(3), &snap).is_err());
        let session = AccessSession {
            wallet: signer.address(),
            purpose: SESSION_PURPOSE.into(),
            expiresAt: 10900,
        };
        let digest = session.eip712_signing_hash(&eip712_domain! { name: "AetherisAccess", version: "1", chain_id: CHAIN_ID, verifying_contract: state.engine.router, });
        let wrong = Grant {
            authorization: signer.sign_hash_sync(&digest).unwrap().to_string(),
            ..grant
        };
        assert!(verify_approval(&record, &wrong, state.engine.router, &snap).is_err());
    }

    fn receipt_value(record: &Record, router: Address) -> Value {
        let transaction = keccak256(b"access test transaction");
        let block_hash = B256::repeat_byte(9);
        let event = AccessRouter::DelegateSet {
            agentId: U256::from(1),
            delegate: record.requester,
            expiresAt: 13600,
            owner: record.owner,
        }
        .encode_log_data();
        let log = json!({"address":router,"topics":event.topics(),"data":event.data,"blockNumber":"0x2a","blockHash":block_hash,
            "transactionHash":transaction,"transactionIndex":"0x0","logIndex":"0x0","removed":false});
        json!({"transactionHash":transaction,"blockHash":block_hash,"blockNumber":"0x2a","transactionIndex":"0x0","from":record.owner,"to":router,
            "status":"0x1","type":"0x2","cumulativeGasUsed":"0x5208","gasUsed":"0x5208","effectiveGasPrice":"0x1","logsBloom":format!("0x{}", "00".repeat(256)),"logs":[log]})
    }

    #[tokio::test]
    async fn receipt_requires_exact_delegation_and_consistent_log_metadata() {
        let (state, snap, _dir) = fixture();
        let requester = Address::repeat_byte(4);
        assert!(create(&state, requester, request(10, &snap), &snap)
            .await
            .is_ok());
        let record = find(&state, B256::repeat_byte(10), requester)
            .await
            .ok()
            .unwrap();
        let good = receipt_value(&record, state.engine.router);
        let check = |value| {
            let receipt: TransactionReceipt = serde_json::from_value(value).unwrap();
            receipt_event(
                &receipt,
                keccak256(b"access test transaction"),
                state.engine.router,
                &record,
            )
        };
        assert_eq!(check(good.clone()).unwrap(), 13600);
        for (field, value) in [
            ("status", json!("0x0")),
            ("from", json!(requester)),
            ("to", json!(Address::ZERO)),
            ("transactionHash", json!(B256::ZERO)),
            ("logs", json!([])),
        ] {
            let mut bad = good.clone();
            bad[field] = value;
            assert!(check(bad).is_err(), "{field}");
        }
        let mut bad = good.clone();
        bad["logs"][0]["topics"][2] = json!(B256::ZERO);
        assert!(check(bad).is_err());
        let mut bad = good.clone();
        bad["logs"][0]["removed"] = json!(true);
        assert!(check(bad).is_err());
        let mut bad = good.clone();
        bad["logs"] = json!([good["logs"][0], good["logs"][0]]);
        assert!(check(bad).is_err());
        let mut bad = good.clone();
        bad["logs"][0]["blockHash"] = json!(B256::ZERO);
        assert!(check(bad).is_err());
    }

    #[tokio::test]
    async fn pagination_keeps_older_pending_requests_reachable_and_scopes_cursors() {
        let (state, snap, _dir) = fixture();
        for n in 1..=101u64 {
            let requester = Address::from_word(B256::from(U256::from(n + 100)));
            let mut item = request(10, &snap);
            item.id = B256::from(U256::from(n));
            assert!(create(&state, requester, item, &snap).await.is_ok());
        }
        let (first, cursor) = page(&state, snap.owner, &snap, None).await.unwrap();
        assert_eq!(first.len(), 100);
        assert!(cursor.is_some());
        let (last, next) = page(&state, snap.owner, &snap, cursor.clone())
            .await
            .unwrap();
        assert_eq!(last.len(), 1);
        assert!(next.is_none());
        assert!(!first.iter().any(|record| record["id"] == last[0]["id"]));
        let stranger = Address::repeat_byte(9);
        assert!(page(&state, stranger, &snap, cursor)
            .await
            .unwrap()
            .0
            .is_empty());
        expect_error(
            page(&state, stranger, &snap, Some("../another-wallet".into())).await,
            StatusCode::BAD_REQUEST,
        );
    }

    async fn rpc_fixture(
        record: Record,
        fault: &'static str,
        store: Store,
    ) -> (AccessState, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let app = Router::new().route(
            "/",
            post(move |Json(request): Json<Value>| {
                let record = record.clone();
                async move {
                    let result = match request["method"].as_str().unwrap() {
                        "eth_getTransactionReceipt" => {
                            receipt_value(&record, Address::repeat_byte(2))
                        }
                        "eth_getBlockByNumber" => {
                            let mut block = alloy::rpc::types::Block::<
                                alloy::rpc::types::Transaction,
                            >::default();
                            block.header.number = 42;
                            block.header.timestamp = if fault == "delayed" { 11000 } else { 10020 };
                            block.header.hash =
                                B256::repeat_byte(if fault == "reorg" { 8 } else { 9 });
                            serde_json::to_value(block).unwrap()
                        }
                        "eth_getTransactionByHash" => {
                            let input = AccessRouter::setDelegateCall {
                                agentId: U256::from(1),
                                delegate: if fault == "calldata" {
                                    Address::ZERO
                                } else {
                                    record.requester
                                },
                                expiresAt: 13600,
                            }
                            .abi_encode();
                            json!({"input":format!("0x{}", hex::encode(input))})
                        }
                        "eth_call" => {
                            let data = request["params"][0]["input"]
                                .as_str()
                                .or_else(|| request["params"][0]["data"].as_str())
                                .unwrap();
                            let bytes = hex::decode(data.trim_start_matches("0x")).unwrap();
                            let selector = &bytes[..4];
                            let output = if selector == AccessRouter::identityRegistryCall::SELECTOR
                            {
                                Address::repeat_byte(3).abi_encode()
                            } else if selector == AccessIdentity::ownerOfCall::SELECTOR {
                                (if fault == "owner" {
                                    Address::repeat_byte(8)
                                } else {
                                    record.owner
                                })
                                .abi_encode()
                            } else if selector == AccessIdentity::ownershipEpochCall::SELECTOR {
                                U256::from(if fault == "epoch" { 9 } else { 1 }).abi_encode()
                            } else if selector == AccessRouter::delegatesCall::SELECTOR {
                                (
                                    record.owner,
                                    if fault == "expiry" {
                                        13601u64
                                    } else {
                                        13600u64
                                    },
                                    U256::from(1),
                                )
                                    .abi_encode()
                            } else if selector == AccessRouter::isAuthorizedCall::SELECTOR {
                                false.abi_encode()
                            } else {
                                panic!("unexpected access read")
                            };
                            if selector != AccessRouter::isAuthorizedCall::SELECTOR {
                                assert_eq!(
                                    request["params"][1], "0x2a",
                                    "grant checks must use its receipt block"
                                );
                            }
                            json!(format!("0x{}", hex::encode(output)))
                        }
                        method => panic!("receipt verifier must not broadcast: {method}"),
                    };
                    Json(json!({"jsonrpc":"2.0","id":request["id"],"result":result}))
                }
            }),
        );
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        (state_with_store(store, &endpoint), server)
    }

    #[tokio::test]
    async fn approval_verifies_canonical_receipt_calldata_epoch_and_preserves_expired_history() {
        let (state, snap, _dir) = fixture();
        let requester = Address::repeat_byte(4);
        let id = B256::repeat_byte(10);
        assert!(create(&state, requester, request(10, &snap), &snap)
            .await
            .is_ok());
        assert!(prepare(&state, snap.owner, IdPayload { id }, &snap)
            .await
            .is_ok());
        let record = find(&state, id, requester).await.unwrap();
        let later = Snapshot {
            time: 20000,
            block: 50,
            owner: Address::repeat_byte(8),
            epoch: U256::from(2),
        };
        for fault in [
            "none", "delayed", "reorg", "calldata", "owner", "epoch", "expiry",
        ] {
            let (rpc, server) = rpc_fixture(record.clone(), fault, state.store.clone()).await;
            let checked = verify_transaction(
                &rpc.engine,
                &record,
                keccak256(b"access test transaction"),
                &later,
            )
            .await;
            if matches!(fault, "none" | "delayed") {
                assert_eq!(checked.unwrap(), 13600);
                let unconfirmed = Snapshot { block: 42, ..later };
                assert!(verify_transaction(
                    &rpc.engine,
                    &record,
                    keccak256(b"access test transaction"),
                    &unconfirmed
                )
                .await
                .is_err());
            } else {
                assert!(checked.is_err(), "{fault}");
            }
            server.abort();
        }
        let (rpc, server) = rpc_fixture(record, "none", state.store.clone()).await;
        assert!(approve(
            &rpc,
            snap.owner,
            Approval {
                id,
                transaction_hash: keccak256(b"access test transaction")
            },
            &later
        )
        .await
        .is_ok());
        let inbox = list(&rpc, requester, &later).await.unwrap();
        assert_eq!(inbox[0]["status"], "approved");
        assert_eq!(inbox[0]["currentAuthority"], false);
        assert_eq!(inbox[0]["unread"], true);
        server.abort();
    }
}
