# Shared protocol and daemon API

Aetheris gives each task its own on-chain workspace, records a result fingerprint, and groups completed task records into verifiable receipts. The daemon checks who may use an agent, submits transactions through authorized relayers, and coordinates payment. It does not itself run an AI model or judge whether an output is correct.

This reference follows [main.rs](../daemon/src/main.rs), [router.rs](../daemon/src/router.rs), [x402.rs](../daemon/src/x402.rs), [store.rs](../daemon/src/store.rs), and [merkle.rs](../daemon/src/merkle.rs). See the [runbook](runbook.md) for setup and [live submission guide](live-submission.md) for deployment prerequisites.

**Every JSON example below is illustrative, not live evidence.** Repeated-byte addresses and transaction hashes are fixtures. Example deadlines/timestamps are deliberately expired and 65-byte zero signatures are deliberately unusable. Use actual configuration, fresh signatures and verified receipts for a paid request. JSON blocks contain complete, parseable JSON without comments or abbreviated hex values.

## Transport and route map

The default origin is `http://127.0.0.1:8080`; public deployments need a TLS reverse proxy, bounded requests and rate limits. Chain ID is **10143**. Startup checks the RPC chain and router bytecode. The JSON body limit is **32 KiB**; payment credential verification limits its header to **16,384 characters**.

| Method and path | Purpose | Successful response |
| --- | --- | --- |
| `GET /health` | Check RPC connectivity and batch-worker state. | `200` health object. |
| `GET /v1/config` | Discover relayers, signing domain and payment requirements. | `200` configuration object. |
| `POST /v1/tasks` | Authorize, reserve, execute and settle one task. | `200` completed job; an existing in-progress job can return `202`. |
| `GET /v1/tasks/{requestId}` | Recover a reserved job without submitting another payment. | Job object with status-dependent HTTP code. |

Submission is **plural: `POST /v1/tasks`**. `POST /v1/task` is not a registered route. GET routes need no task/payment credential and have no request body or defined query parameters. Anyone who knows a request ID can read its job; the ID is not a secret access token.

POST uses `Content-Type: application/json` and the configured payment header. There is no unpaid submission mode. CORS permits `CORS_ORIGIN` (default `http://localhost:3000`), GET/POST, and content/payment headers; it exposes `PAYMENT-REQUIRED` and `PAYMENT-RESPONSE`. CORS is browser policy, not task authorization. The dashboard's `/api/demo/*` proxy is separate from this Rust API.

## GET /health

This asks the RPC for its current block with a five-second timeout. Example HTTP `200`:

```json
{
  "status": "ok",
  "batchWorker": "running",
  "chainId": 10143,
  "router": "0x1111111111111111111111111111111111111111",
  "relayers": ["0x2222222222222222222222222222222222222222"],
  "blockNumber": 4242
}
```

| Field | JSON type | Meaning |
| --- | --- | --- |
| `status` | string | `ok`, or `degraded` when an enabled batch worker has stopped. |
| `batchWorker` | string | `running`, `disabled`, or `stopped`; disabled batching alone is not unhealthy. |
| `chainId` | integer | Task chain, always `10143`. |
| `router` | 20-byte hex string | Contract receiving task transactions. |
| `relayers` | address array | Daemon-controlled executor addresses in configured order. |
| `blockNumber` | integer | RPC head as a JSON number, not a hex quantity or decimal string. |

`stopped` returns the same object with `status: "degraded"` and HTTP `503`. RPC failure/timeout instead returns HTTP `503` with an error object:

```json
{"error":"RPC timed out"}
```

The other RPC error is `RPC unavailable`. Health does not prove facilitator availability, agent permissions, token balances, or successful end-to-end execution.

## GET /v1/config

This publishes configuration without secrets; it does not perform a fresh readiness probe. Example using x402:

```json
{
  "chainId": 10143,
  "router": "0x1111111111111111111111111111111111111111",
  "relayers": ["0x2222222222222222222222222222222222222222"],
  "taskAuthorization": {"name":"AetherisTask","version":"1"},
  "payment": {
    "x402Version": 2,
    "resource": {
      "url": "https://daemon.example/v1/tasks",
      "description": "Create isolated agent shard and commit caller-supplied output hashes",
      "mimeType": "application/json"
    },
    "accepts": [{
      "scheme": "exact",
      "network": "eip155:10143",
      "amount": "1000",
      "asset": "0x4444444444444444444444444444444444444444",
      "payTo": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "maxTimeoutSeconds": 120,
      "extra": {"name":"Example Test Token","version":"1"}
    }]
  }
}
```

| Field | Meaning |
| --- | --- |
| `chainId`, `router`, `relayers` | Task network, deployment and eligible executor keys; also present in health. |
| `taskAuthorization.name`, `.version` | Fixed EIP-712 domain values; combine with `chainId` and `router` below. |
| `payment.x402Version` | Integer `2`; also used by the custom Graph Tally challenge envelope. |
| `payment.resource.url` | Operator's `PUBLIC_TASK_URL`; clients should pin it independently. |
| `payment.resource.description`, `.mimeType` | Human description and format, not task inputs. |
| `payment.accepts` | One configured payment requirement; both modes are detailed below. |
| `accepts[].scheme`, `.network` | Mechanism and payment-chain namespace. Execution remains on Monad even if Graph Tally uses another chain. |
| `accepts[].amount` | Required token base units as a decimal string, not a dollar amount. |
| `accepts[].asset`, `.payTo` | x402 token contract and recipient; Graph Tally advertises `GRT` and its service provider. |
| `accepts[].maxTimeoutSeconds` | x402 authorization window (`120`), or Graph Tally receipt maximum age. |
| `accepts[].extra` | x402 token EIP-712 name/version, or Graph Tally adapter/domain settings. |

Discovering a token/recipient is not consent to pay it. The included client independently pins resource, chain, asset, recipient, amount limit and token-signing domain before signing.

## POST /v1/tasks: request and authorization

The caller supplies commitments to an input, an output and optionally proof evidence. Raw documents stay off-chain. The scripts client obtains real MCP output first; the browser demo uses a disclosed deterministic checksum workload. Neither makes the daemon an MCP execution server.

```json
{
  "agentId": "1",
  "taskId": "0x3333333333333333333333333333333333333333333333333333333333333333",
  "sequenceNonce": "7",
  "inputHash": "0x4444444444444444444444444444444444444444444444444444444444444444",
  "outputHash": "0x5555555555555555555555555555555555555555555555555555555555555555",
  "proofHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
  "executor": "0x2222222222222222222222222222222222222222",
  "deadline": 1,
  "authorization": "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
}
```

| Field, in signed order | Solidity type / JSON encoding | Meaning and checks |
| --- | --- | --- |
| `agentId` | `uint256` / decimal string | Existing ERC-721 identity. Signer and executor must be authorized for it. |
| `taskId` | `bytes32` / 32-byte hex | Caller-chosen, nonzero task identifier. |
| `sequenceNonce` | `uint256` / decimal string | Task-instance nonce, not the relayer's transaction nonce. |
| `inputHash` | `bytes32` / 32-byte hex | Nonzero commitment to agreed input bytes. |
| `outputHash` | `bytes32` / 32-byte hex | Nonzero commitment to produced output bytes. |
| `proofHash` | `bytes32` / 32-byte hex | Evidence commitment; zero is permitted and does not claim a verified attestation. |
| `executor` | `address` / 20-byte hex | Configured daemon relayer authorized for this agent. |
| `deadline` | `uint64` / JSON integer | Unix seconds: inclusive `serverNow <= deadline <= serverNow + 600`, not milliseconds. |
| `authorization` | signature / 65-byte hex | Canonical low-S Ethereum ECDSA signature; not itself a signed struct field. |

Unknown task JSON fields are rejected. Decimal strings preserve uint256 precision; do not pass them through JavaScript `Number`. Hashes/addresses include `0x`. Agree on document serialization before hashing; the daemon does not canonicalize or recover the original bytes.

Sign primary type `TaskAuthorization` with this exact field order:

```solidity
TaskAuthorization(uint256 agentId,bytes32 taskId,uint256 sequenceNonce,bytes32 inputHash,bytes32 outputHash,bytes32 proofHash,address executor,uint64 deadline)
```

The complete EIP-712 domain for the example router is:

```json
{"name":"AetherisTask","version":"1","chainId":10143,"verifyingContract":"0x1111111111111111111111111111111111111111"}
```

`requestId = keccak256(0x1901 || domainSeparator || hashStruct(TaskAuthorization))`. For the expired fixture above it is `0x750d985926c13e12c0df053f31760c6125e5243395f1f1e78a8c9bb1c3f5db47`; the signature is excluded. The signer must be the current agent owner or an unexpired router delegate. A passkey wallet must produce a supported EOA/delegate signature; raw WebAuthn assertions and EIP-1271 signatures are not accepted by this transport.

The daemon validates signer and executor before reservation and again after acquiring the selected relayer's lock. It sends `createShard(...)` followed by `executeTask(...)` using that executor's key. The router independently enforces on-chain roles; it does not receive the HTTP EIP-712 signature. Different relayers can submit concurrently; transactions sharing one relayer are serialized. Each key must belong exclusively to one running daemon process.

## Job responses and GET /v1/tasks/{requestId}

POST normally waits for task transactions and payment settlement. Its worker continues if the HTTP connection disconnects. Save the request ID before POST; recovery GET needs only that 32-byte hex ID. There is no list, cancel, retry-payment or administrative reconciliation route.

A reserved job still in progress returns HTTP `202`:

```json
{
  "requestId": "0x750d985926c13e12c0df053f31760c6125e5243395f1f1e78a8c9bb1c3f5db47",
  "status": "accepted",
  "result": null,
  "payment": null,
  "error": null
}
```

A completed x402 job returns HTTP `200`. Result fields are **`createTx` and `executionTx`**, not `create_tx` or `executionTransactionHash`:

```json
{
  "requestId": "0x750d985926c13e12c0df053f31760c6125e5243395f1f1e78a8c9bb1c3f5db47",
  "status": "completed",
  "result": {
    "shard": "0x6666666666666666666666666666666666666666",
    "salt": "0xc0837dccb7b05109d2ced1dfbcf109adeaa1a1258e74fa924d4f5c7f13562173",
    "createTx": "0x7777777777777777777777777777777777777777777777777777777777777777",
    "executionTx": "0x8888888888888888888888888888888888888888888888888888888888888888"
  },
  "payment": {
    "success": true,
    "network": "eip155:10143",
    "payer": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "transaction": "0x9999999999999999999999999999999999999999999999999999999999999999"
  },
  "error": null
}
```

| Field | Meaning |
| --- | --- |
| `requestId` | Original EIP-712 digest; a canonical retry can return the original ID. |
| `status` | Durable state below; inspect it even when HTTP is not 2xx. |
| `result` | Null until both task transactions are confirmed, then a four-field object. |
| `result.shard`, `.salt` | CREATE2 task address and salt; verify against the deployed router and signed inputs. |
| `result.createTx`, `.executionTx` | Shard creation/completion transaction hashes on Monad Testnet. |
| `payment` | Null until semantic settlement success, then the facilitator/adapter's JSON receipt; additional provider fields can exist. |
| `payment.success`, `.network`, `.payer`, `.transaction` | Required x402 success, exact network, task payer and parseable settlement transaction hash. |
| `payment.receiptHash` | Graph Tally's required receipt digest instead of x402 network/payer/transaction requirements; adapter metadata may accompany it. |
| `error` | Null, or a diagnostic explaining unfinished work/reconciliation. |

Whenever `payment` is present, the response also contains `PAYMENT-RESPONSE: base64(UTF8(JSON(payment)))`. Header names are case-insensitive. POST and GET share this status mapping:

| Job status | HTTP | Interpretation |
| --- | --- | --- |
| `accepted` | `202` | Reserved and executing or waiting for its relayer. Poll GET. |
| `settlement_pending` | `502` | Task result retained; normal while settlement runs, or unresolved after failure. Continue bounded GET polling; an `error` can require operator reconciliation. |
| `completed` | `200` | Task transactions succeeded and facilitator/adapter reported semantic success. Independently verify receipts before showing blockchain proof. |
| `reconciliation_required` | `502` | Transaction failure/uncertainty or interrupted work after restart. Preserve the journal; do not automatically pay again. |

The daemon waits until `head >= receiptBlock + CONFIRMATIONS` (default `12`) and checks successful transaction status. This differs from the `finalized` tag used for batches. Completion alone does not independently prove a token transfer, hardware attestation, reputation update or Merkle inclusion. Included clients additionally check task event fields, original hashes, canonical blocks and nonce-bound payment transfers.

## Payment challenge and x402 exact credentials

A missing configured payment header returns HTTP `402` before task-body extraction. Invalid credentials return another `402` after task authorization. The body is the same as `/v1/config.payment`, with `error` added (`payment proof required` or `payment verification failed`); the entire object is also base64 encoded in `PAYMENT-REQUIRED`.

In x402 mode, copy the accepted requirement only after checking your independent policy. Sign the token's EIP-712 `TransferWithAuthorization`; encode this envelope as UTF-8 JSON and standard base64 in **`PAYMENT-SIGNATURE`**. This is a decoded, unusable example, not a literal header value:

```json
{
  "x402Version": 2,
  "resource": {"url":"https://daemon.example/v1/tasks"},
  "accepted": {
    "scheme": "exact",
    "network": "eip155:10143",
    "amount": "1000",
    "asset": "0x4444444444444444444444444444444444444444",
    "payTo": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "maxTimeoutSeconds": 120,
    "extra": {"name":"Example Test Token","version":"1"}
  },
  "payload": {
    "signature": "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "authorization": {
      "from": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "to": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "value": "1000",
      "validAfter": "0",
      "validBefore": "1",
      "nonce": "0xabababababababababababababababababababababababababababababababab"
    }
  }
}
```

| Credential field | Meaning |
| --- | --- |
| `x402Version`, `resource`, `accepted` | Version, purchased resource and selected requirement. `accepted` must equal the daemon's configured JSON requirements exactly. |
| `payload.signature` | EIP-3009 signature; separate from task authorization. |
| `authorization.from` | Token payer; must equal the recovered task signer. |
| `authorization.to`, `.value` | Recipient and exact token base-unit amount. |
| `authorization.validAfter`, `.validBefore` | Unix-second bounds as decimal strings; included clients use `validAfter = 0`. |
| `authorization.nonce` | Fresh 32-byte payment nonce, distinct from task and transaction nonces. |

The exact signed payment type is `TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)`. Its domain uses token `extra.name`/`extra.version`, chain `10143`, and **the asset contract** as `verifyingContract`, not the router. The token must implement this mechanism and the payer must hold sufficient tokens.

At startup the facilitator's `GET /supported` must advertise `{x402Version:2, scheme:"exact", network:"eip155:10143"}` in `kinds`. For `POST /verify` and later `POST /settle`, the daemon sends `{x402Version:2, paymentPayload:<envelope>, paymentRequirements:<accepted>}`. Verification needs `isValid: true` and matching `payer`; settlement needs the x402 receipt fields above. Optional bearer credentials remain server-side.

The facilitator is trusted to verify token authorization/policy and perform settlement. A signature is not settled money. Replay reservation binds network, asset, payer and nonce independently of signature spelling/JSON order. Included clients additionally require the expected token `Transfer` and `AuthorizationUsed(authorizer, nonce)` logs from the settlement receipt.

## Custom Graph Tally adapter credentials

`PAYMENT_MODE=graph-tally` selects a custom Aetheris transport. It is not a standard x402 Graph Tally scheme, a shipped escrow adapter, or a claim of a Graph Tally deployment on Monad. The real aggregator/escrow deployment supplies its domain and adapter. New scripts/browser clients support x402; Graph Tally requires its own compatible client and adapter.

The config/challenge keeps the same outer envelope, but its one `accepts` entry has this shape:

```json
{
  "scheme": "graph-tally",
  "network": "eip155:1",
  "amount": "1000",
  "asset": "GRT",
  "payTo": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "maxTimeoutSeconds": 300,
  "extra": {
    "adapter": "aetheris-graph-tally-v1",
    "collectionId": "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "dataService": "0xdddddddddddddddddddddddddddddddddddddddd",
    "domain": {"name":"Example Tally Domain","version":"1","chainId":"1","verifyingContract":"0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"}
  }
}
```

`extra.collectionId` identifies the collection, `dataService` the service, and `domain` its EIP-712 verifier domain. Exposed `domain.chainId` is a **decimal string**. Payment chain can differ from task chain 10143; obtain every domain value from the actual deployment, not this example.

Send **`X-GRAPH-TALLY-RECEIPT: base64(UTF8(JSON(receipt)))`**, using this decoded envelope:

```json
{
  "message": {
    "collection_id": "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "payer": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "data_service": "0xdddddddddddddddddddddddddddddddddddddddd",
    "service_provider": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "timestamp_ns": "1000000000",
    "nonce": "7",
    "value": "1000"
  },
  "signature": "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
}
```

| Signed field, in order | Type / JSON encoding | Meaning and checks |
| --- | --- | --- |
| `collection_id` | `bytes32` / hex | Must match configured collection. |
| `payer` | `address` / hex | Must equal authorized task signer. |
| `data_service` | `address` / hex | Must match configured service. |
| `service_provider` | `address` / hex | Must match payment receiver. |
| `timestamp_ns` | `uint64` / decimal string | Unix nanoseconds. Whole-second timestamp may be at most five seconds ahead and no older than maximum age (default `300` seconds). |
| `nonce` | `uint64` / decimal string | Receipt nonce, not task's uint256 sequence nonce. |
| `value` | `uint128` / decimal string | At least the configured minimum value. |

Primary type is `Receipt`, retaining this exact order and snake_case names. `signature` sits outside `message`, is low-S ECDSA, and signs this struct in the Graph domain. Unknown envelope/message fields are rejected. Its recovered signer may differ from payer only if the real adapter confirms payer authorization. The receipt EIP-712 digest is its durable replay ID.

Both adapter calls receive `{adapterVersion:1, signedReceipt:<envelope>, receiptHash:<digest>, domain:<configured domain>, minimumValue:<decimal string>}`:

| Adapter route | Required behavior/result |
| --- | --- |
| `POST /verify` | Read real collection, escrow and signer authorization; no settlement side effects. Return `{isValid:true, payer:<task signer>, authorizedSigner:<recovered receipt signer>}` only when valid/funded. |
| `POST /settle` | Durably accept/aggregate with deduplication and reconciliation support; return `{success:true, receiptHash:<same digest>, ...}`. |

Receipt acceptance is not automatically final on-chain redemption. Preserve adapter metadata and reconcile uncertainty with the real service. Payment endpoints require HTTPS except allowed localhost endpoints; configured URLs cannot contain credentials, query strings or fragments.

## Error codes, retries and durable state

Application errors use `{"error":"message"}`; job errors retain the job object. Axum routing/extraction errors can be plain text; do not assume every error body is JSON. Missing payment headers can return `402` before other POST checks.

| HTTP | Actual cause / response |
| --- | --- |
| `400` | Invalid request-ID path, malformed JSON/body buffering, or application `invalid task encoding`. |
| `401` | `task authorization could not be verified`: invalid/expired signature, invalid task values, unavailable authorization checks, or unauthorized signer/executor. |
| `402` | Challenge with `payment proof required` or `payment verification failed`. |
| `404` | Unknown route, or `task request not found` for an unknown valid ID. |
| `405` | Unsupported method on a matched route. |
| `409` | `request or payment already reserved`, or `task identity already reserved for different inputs, output, proof or executor`. |
| `413` | JSON body exceeds 32 KiB. |
| `415` | Missing/unsupported JSON content type. |
| `422` | JSON cannot deserialize as `TaskRequest`: unknown fields, wrong types or malformed fixed-width hex. |
| `429` | `relayer capacity exceeded`; `MAX_INFLIGHT` bounds accepted work. |
| `500` | `storage unavailable`, `canonical task journal requires reconciliation`, or `task interrupted; query the persisted request ID`. |
| `502` | Job with `settlement_pending` or `reconciliation_required`; not permission to repeat a charge. |
| `503` | Health RPC timeout/unavailability, or health object with stopped batch worker. |

Canonical task identity is `(chainId, router, agentId, taskId, sequenceNonce)`, keyed by salt. Its intent digest uses the same task struct with `deadline = 0`. After valid authorization, refreshing only the deadline returns the original job/ID without another payment verification/settlement; changing input/output/proof/executor for the same identity returns `409`. Existing POSTs still require the configured payment header and currently valid task authorization. Prefer recovery GET, which needs neither.

One redb transaction reserves canonical identity, job, payment replay ID, signed task and payment context before execution. A losing reservation cannot partially consume a new voucher. Before each send the daemon saves pending nonce, calldata hash and broadcast intent, then saves the returned hash before waiting. An intent without a known hash stops that signer across tasks until reconciled; no silent replacement is submitted.

Restart changes persisted `accepted`/`settlement_pending` jobs to `reconciliation_required`, retaining known results. Payment failure retains the confirmed task result. Neither restart nor GET automatically rebroadcasts transactions or settles payment again. Preserve `DATABASE_PATH` and reconcile nonces, chain receipts and facilitator/adapter state; independent systems do not offer an automatic exactly-once guarantee here. A timeout or immediate `404` after uncertain POST does not prove nothing happened. Included clients save request IDs before POST and recover with GET only.

## CREATE2 isolation and authorization roles

Each completed task writes to its own shard; the result can be set only once. “Ephemeral” describes task lifetime, not destruction or secrecy: shards remain public audit records. Deployment bookkeeping, payer nonces, identity reads and network capacity can still contend.

```solidity
salt = keccak256(abi.encodePacked(uint256(agentId), bytes32(taskId), uint256(sequenceNonce)));
initHash = keccak256(abi.encodePacked(type(EphemeralShard).creationCode,
    abi.encode(agentId, taskId, sequenceNonce, executor, inputHash)));
shard = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), router, salt, initHash)))));
```

The salt preimage is 96 bytes; integers occupy 32 unsigned big-endian bytes. Reused salt is rejected even if executor/input changes. Address prediction also binds deployed router and exact constructor bytecode; call its `predictShardAddress` instead of assuming a different compiler build has identical init-code hash.

| Actor | Actual authority |
| --- | --- |
| Agent owner | Sets/revokes delegates with `setDelegate(agentId, delegate, expiresAt)`; expiry `0` revokes. |
| Task signer | Current owner or unexpired delegate; pays under the configured mechanism. |
| Assigned executor | Configured relayer and authorized agent actor; creates the shard and alone may complete it through the router. Execution rechecks authorization. |
| Router administrator | Manages committers; identity ownership is separate. |
| Merkle committer | Trusted to attest canonical complete batches. The worker uses the **first relayer**, which separately needs committer permission. |
| Validation requester / validator | Owner or approved ERC-721 actor requests validation; designated validator responds. A task delegate is not automatically an ERC-721 approved requester/validator. |

Delegations bind owner, expiry and ownership epoch. Transferring an identity away and back does not revive old grants. Completion writes shard storage and emits an event without updating shared reputation/validation storage in that path.

## Canonical events and Merkle batches

The daemon, indexer and dashboard share these events:

```solidity
event ShardCreated(address indexed shard, uint256 indexed agentId, bytes32 indexed taskId,
    uint256 sequenceNonce, address executor, bytes32 inputHash);
event TaskExecuted(address indexed shard, uint256 indexed agentId, bytes32 indexed taskId,
    bytes32 inputHash, bytes32 outputHash, bytes32 proofHash);
event MerkleBatchCommitted(bytes32 indexed batchId, bytes32 root, uint256 leafCount,
    uint256 fromBlock, uint256 toBlock);
```

`ShardCreated` identifies workspace/input; `TaskExecuted` records output/evidence commitments; `MerkleBatchCommitted` attests root, actual count and inclusive block range. A batch compresses the tasks actually in that block, not a fixed group of 100 or a daily settlement.

The optional worker scans from `DEPLOYMENT_BLOCK` through RPC `finalized`. It fetches this router's `TaskExecuted` logs by `blockHash`, validates address/hash/number/nonremoved status, rejects duplicate/missing positions, and sorts by `(blockNumber, transactionIndex, logIndex)`. Log index is global within a block. Include **all** matching events, even tasks submitted outside this daemon; do not globally sort leaves.

```solidity
leaf = keccak256(abi.encodePacked(keccak256(abi.encodePacked(
    uint256(chainId), address(router), address(shard), uint256(agentId),
    bytes32(taskId), bytes32(inputHash), bytes32(outputHash), bytes32(proofHash)
))));
batchId = keccak256(abi.encodePacked(
    uint256(chainId), address(router), uint256(blockNumber), bytes32(blockHash)
));
```

Inner leaf preimage: **232 bytes**. Outer preimage: its 32-byte digest. Double hashing separates leaves from 64-byte internal-node preimages. Batch-ID preimages are **116 bytes**. Chain/router binding prevents reusing another deployment's logs.

At each level, sort **each pair** of hashes lexicographically, concatenate and Keccak-256 hash. Duplicate an odd last node; a singleton root is its leaf. Empty blocks advance the cursor without a commitment. This convention differs from some third-party Merkle builders.

Each nonempty finalized block becomes one commit with `fromBlock == toBlock` and actual `leafCount`. The worker checks parent continuity/hashes before committing and rechecks its durable cursor on the next loop. A changed finalized hash or unsupported finalized RPC stops the worker and makes health degraded; immutable commitments cannot be silently rolled back. Committer trust remains because the router does not reconstruct logs itself.

The indexer stores durable tree frontiers, closes a block after the next arrives, and compares commitment batch ID, root, count and range. Its `complete` status is an indexing boundary, not consensus finality. Mismatches remain explicit; normal indexer chain rollback still applies.

Fixtures (not live addresses): chain `10143`; router `0x11` repeated to 20 bytes; shard `0x22` to 20 bytes; agent `1`; task `0x33`, input `0x44`, output `0x55`, proof `0x66`, each repeated to 32 bytes:

| Fixture | Expected digest |
| --- | --- |
| Leaf with those fields | `0xb039a3d2a6aa1f34fff2aaa77864a33cda193c69d6c66559fee65c8474d61fdf` |
| Batch ID for block `42`, block hash `0x66` repeated to 32 bytes | `0x25369331dc35862a909c5dfb0a7a48efbd9879c308345fdb1d575f40574c8aa5` |
| Salt for agent `1`, task `0x33` repeated to 32 bytes, nonce `7` | `0xc0837dccb7b05109d2ced1dfbcf109adeaa1a1258e74fa924d4f5c7f13562173` |

## Identity, reputation and validation boundaries

An ERC-721 identity's `tokenURI` links to an ERC-8004 Agent Card, normally on IPFS. Declared skills/MCP endpoints are off-chain statements; registration does not establish availability or truth. Registration uses the registry's `register(string)`, not a daemon HTTP endpoint.

The daemon does not call reputation as part of `/v1/tasks`. After confirming execution/payment, the [scripts task client](../scripts/README.md) calls `recordTaskExecution(shard)` or verifies an existing record. Optional feedback requires an independently eligible reviewer key and explicit written assessment bound to task/output; the client invents no positive rating. Values are signed fixed-point integers (`value`, `valueDecimals`); aggregates need a trusted client allowlist to resist Sybil feedback.

`proofHash` commits evidence; it does not verify it. Output-hash validation needs an explicit request/expected output. TEE verification trusts a configured attestor to check hardware quotes off-chain, then enforces its signature, allowlisted measurement, output, expiry and replay protection. CRE separately authenticates the forwarder/exact workflow, binds report to request/agent/output/domain, and enforces time/replay rules. See [CRE integration](../contracts/CRE.md) for 64-byte metadata and report format. Task completion or Merkle inclusion automatically invokes neither flow and cannot establish output truthfulness.
