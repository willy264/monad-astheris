# Aetheris daemon

Rust 2021 service using Tokio, Axum, Alloy, reqwest and a transactional redb journal. It creates a CREATE2 shard, then submits a caller-authorized output commitment, waiting for successful transaction receipts. Separate funded relayer keys submit independently; transactions sharing one relayer are serialized with an explicit pending nonce. Each signer must be exclusive to one daemon process. The journal holds an exclusive filesystem lock; sharing keys with another deployment invalidates the nonce guarantee.

For the complete system setup and current submission gaps, see the [runbook](../docs/runbook.md) and [submission checklist](../docs/submission-readiness.md).

```sh
cp .env.example .env
# Fill deployed router, deployment block, funded private keys and payment settings.
cargo check --locked --jobs 2
cargo test --locked --jobs 2
cargo run --locked --release
```

The default listener is `127.0.0.1:8080`. Bind a public listener only behind a TLS proxy with rate limits and request timeouts appropriate for receipt confirmation. The server rejects an RPC on any chain other than Monad Testnet 10143 and rejects an address without deployed bytecode. Each agent owner must authorize its selected relayer through `setDelegate(agentId, relayer, expiresAt)`. Delegation is scoped to agent and expiry. The router owner must separately call `setCommitter(firstRelayer, true)` before enabling `BATCH_ENABLED` (or configure `COMMITTER_ADDRESS` in the deployment script).

## API and signed requests

| Route | Behavior |
| --- | --- |
| `GET /health` | Actual RPC liveness, current block, chain, router, relayers and `batchWorker` state; 503 on RPC failure or a stopped enabled worker. |
| `GET /v1/config` | Public relayers, EIP712 domain and configured payment requirements. |
| `POST /v1/tasks` | Authenticates task/payment, persists a job, waits for execution and settlement, then returns 200 with `PAYMENT-RESPONSE`. Work continues if the client disconnects. |
| `GET /v1/tasks/{requestId}` | Persisted status, transaction results, payment receipt and actionable failure state. |

Task JSON uses decimal strings for uint256 values:

```json
{
  "agentId": "1",
  "taskId": "0x<32-byte task identifier>",
  "sequenceNonce": "0",
  "inputHash": "0x<32-byte input commitment>",
  "outputHash": "0x<32-byte output commitment>",
  "proofHash": "0x<32-byte proof commitment or zero>",
  "executor": "0x<one of the configured relayer addresses>",
  "deadline": 1790957100,
  "authorization": "0x<65-byte ECDSA signature>"
}
```

Sign the EIP712 `TaskAuthorization` type, with fields in this exact order:

```solidity
TaskAuthorization(uint256 agentId,bytes32 taskId,uint256 sequenceNonce,bytes32 inputHash,bytes32 outputHash,bytes32 proofHash,address executor,uint64 deadline)
```

Domain: `{name: "AetherisTask", version: "1", chainId: 10143, verifyingContract: ROUTER}`. Deadline is Unix seconds within the next ten minutes. The signer and selected executor must both be authorized on-chain for the agent. `requestId` is the EIP712 signing hash. Signatures bind every committed field, executor, router and chain. P256 passkeys remain inside the wallet provider; the daemon accepts an Ethereum ECDSA delegate signature, not an unverified WebAuthn assertion. EIP1271 smart contract wallet signatures are not accepted by this transport; use a scoped EOA session delegate.

Output and proof hashes are supplied by the authorized task executor/client. The daemon does not run an arbitrary MCP agent, generate an output, or treat a proof hash as a valid TEE attestation. Validation is a separate contract flow. Category Labs threshold encryption is an external integration prerequisite: there is no invented encryption format or plaintext-as-encrypted fallback here.

`accepted`, `completed`, `settlement_pending`, and `reconciliation_required` are durable status values. A concurrent retry may return 202 for an accepted job; failures return 502 with its persisted status. Canonical identity is `(chain, router, agentId, taskId, sequenceNonce)`: renewing the signed deadline returns the original job without another payment, and changing its inputs/output/proof/executor returns 409. Job, canonical identity, payment replay ID and signed materials are reserved in one database transaction. Do not delete the database when restarting: it contains payment anti-replay state.

The daemon persists the selected nonce, calldata hash and per-relayer broadcast intent **before** calling the node, then journals the returned transaction hash before waiting for confirmations. If a crash or transport failure leaves an intent without a known hash, that signer halts across all tasks. It cannot silently reuse the nonce or rebroadcast. Restart explicitly changes interrupted `accepted`/`settlement_pending` jobs to `reconciliation_required`, retaining known results. Reconcile recorded nonce, transaction receipts and payment facilitator before resolving the journal. A settlement failure retains the confirmed task result in `settlement_pending`; an operator must reconcile it against the facilitator. This deliberately fails closed at ambiguous cross-system boundaries and does not promise exactly-once delivery across independent systems.

## Payments and Graph Tally trust boundary

The default mode implements [x402 v2](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md) HTTP `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` signaling for the `exact` EIP3009 scheme. Payment configuration is mandatory. At startup the facilitator must advertise x402 v2 `exact` support for `eip155:10143`. A facilitator URL or token is never built into the repository. The asset must actually implement the facilitator's EIP3009 payment mechanism. Configure its EIP712 name/version correctly.

The middleware returns 402 with a base64 JSON `PAYMENT-REQUIRED` header. The client returns a base64 JSON x402 payload in `PAYMENT-SIGNATURE`. The daemon compares the exact accepted requirements, binds the EIP3009 sender to the authorized task signer, calls `/verify`, consumes a durable `(network, asset, payer, nonce)` replay key, executes the task, and calls `/settle`. The facilitator is trusted to check token transfers/authorization and escrow as appropriate. An HTTP 200 from it is insufficient: the daemon verifies semantic success, payer, network and transaction hash. A signed receipt alone is never described as settled money.

`PAYMENT_MODE=graph-tally` verifies the **actual Graph Tally v2 EIP712 Receipt layout** from [Graph Tally source](https://github.com/graphprotocol/graph-tally/blob/main/crates/graph/src/receipt.rs). See [Graph Tally overview](https://thegraph.com/docs/en/gateways/subgraphs/components/graph-tally/) and [escrow documentation](https://thegraph.com/docs/en/gateways/subgraphs/supply-side/managing-escrow/). This is a custom Aetheris adapter transport, **not** an official Graph Tally HTTP API, a standard x402 `graph-tally` scheme, or a claim that Graph Tally is deployed on Monad.

Use `X-GRAPH-TALLY-RECEIPT: base64(JSON)` with this envelope (large integer fields are decimal strings):

```text
{message:{collection_id,payer,data_service,service_provider,timestamp_ns,nonce,value},signature}
```

The daemon checks the configured collection, data service, receiver, payer, minimum value, timestamp window, low-S ECDSA signature and configured EIP712 domain. The canonical receipt signing hash is the durable replay ID. Domain name/version, chain and verifier must come from the deployed Graph service; they have no guessed defaults. Since these checks cannot prove a payer's funded escrow or authorized signing keys, a deployment must supply `GRAPH_TALLY_ADAPTER_URL` implementing the following **custom** contract:

| Endpoint | Required behavior |
| --- | --- |
| `POST /verify` | Receive `{adapterVersion:1,signedReceipt,receiptHash,domain,minimumValue}`; validate real collection state, payer-authorized signer and sufficient escrow; return `{isValid:true,payer,authorizedSigner}` only on success. No settlement side effects. |
| `POST /settle` | Receive the same body; durably accept/aggregate the receipt under the real Graph Tally service and return `{success:true,receiptHash,...}` only when accepted. It must deduplicate receipt hashes and expose reconciliation for uncertain requests. |

No permissive adapter or mock escrow verifier ships. A correct adapter is a deployment dependency and belongs alongside the actual Graph Tally aggregator/escrow service. Its receipt acceptance is not automatically final on-chain redemption; retain its reconciliation metadata.

## Merkle settlement

The optional worker scans from `DEPLOYMENT_BLOCK`, reads only RPC `finalized` blocks, uses a `blockHash` log filter and verifies continuity and canonical hashes. Logs sort by `(blockNumber, transactionIndex, logIndex)`. A finalized hash change stops the worker for reconciliation; unsupported finalized RPC also stops it. It never silently settles an orphaned block. Empty blocks advance the durable cursor without a commit.

```text
leaf = keccak256(keccak256(abi.encodePacked(
  uint256(10143), address(router), address(shard), uint256(agentId),
  bytes32(taskId), bytes32(inputHash), bytes32(outputHash), bytes32(proofHash)
)))
parent = keccak256(min(left,right) || max(left,right))
```

Duplicate the last node at each odd level. A single leaf is its own root. Batch ID is `keccak256(abi.encodePacked(uint256(10143),address(router),uint256(blockNumber),bytes32(blockHash)))`. Each nonempty block becomes one authorized router commit. This commits verified canonical log data; it does not make those outputs truthful or establish TEE validity.

Measure actual RPC latency with `python scripts/rpc_latency.py --rpc <RPC_URL> --samples 20`. The configurable 300 ms comparison is a latency budget, not a hardcoded claim about Monad's current block interval or achieved TPS. Tests cover payment/task signature binding, expiry, amount/receiver checks, persistent replay reservation and Merkle rules without requiring private keys or RPC access.
