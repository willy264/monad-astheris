# Aetheris live-operation tools

These scripts connect actual deployed contracts, an MCP service and payment infrastructure. They do not contain a funded key, an example settlement provider, fabricated feedback or a simulated deployment. Unit tests use local fixtures; no live transaction or payment has been established by those tests.

Use Node 22 and pnpm 10.32.1. The package pins Viem 2.57.2, the official MCP TypeScript SDK 1.32.0, TypeScript 5.9.3 and tsx 4.23.15. From `aetheris/scripts`:

```powershell
pnpm install --frozen-lockfile
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
pnpm typecheck
pnpm test
pnpm submit-task --help
```

Fill `.env` with your real values. The task client loads `scripts/.env` explicitly; existing process environment values take precedence. Relative input/review paths and `--run-dir` resolve from the current working directory. The deployment tools additionally load component settings as described below. Neither tool automatically turns the daemon's configuration into client spending authorization.

The live **Aetheris Monad Observer, agent #1**, is already registered. See [registration and MCP verification](REGISTRATION.md) for its endpoint, safe retry rules and `pnpm verify-mcp`. See [public evidence](../SUBMISSION_PROOF.md) for confirmed results.

## Deploy, pin and register

The deployment, registration and proof utilities are separate from the task client:

| Command from `scripts` | Behavior |
| --- | --- |
| `pnpm run deploy` | Simulates the Foundry deployment using `contracts/.env`; requires a real funded deployment signer and RPC |
| `pnpm run deploy --broadcast` | Broadcasts, then verifies actual deployment receipts, compiled creation code and registry/router links before writing the live manifest |
| `pnpm finalize-deployment` | Rechecks existing Foundry broadcast receipts and writes the verified live manifest; use after an interrupted deployment rather than redeploying |
| `pnpm agent-card prepare` | Builds the card from the configured real agent name, description, capabilities, owner and MCP endpoint |
| `pnpm agent-card pin` | Uploads to Pinata using `PINATA_JWT`, then retrieves and checks the exact IPFS bytes |
| `pnpm agent-card register` | Registers the pinned card from `AGENT_OWNER_PRIVATE_KEY`, preserving the signed transaction before broadcasting |
| `pnpm agent-card all` | Runs prepare, pin and registration in order |
| `pnpm submission-proof` | Writes `submission/LIVE_CHECKS.md` from `TASK_PROOF_PATH` and deployment/agent/indexer state; preserves curated `SUBMISSION_PROOF.md`, and missing evidence remains a blocker |

The deployment script's `PRIVATE_KEY` must be configured in `contracts/.env` or the process environment. A simulation is not a live manifest. Keep deployment intent and broadcast receipts when interrupted. Registration uses a dedicated owner account; use `AGENT_OWNER_ADDRESS` for card preparation without loading its key. `AGENT_SERVICE_X402_SUPPORT` describes the actual advertised service and defaults to false.

Agent/card/deployment tools preserve local state under ignored directories. Configure `MCP_ENDPOINT` to the publicly advertised endpoint and `MCP_SERVER_URL` to the same service used by the task client. Copy the verified deployment addresses and earliest block into the four components as documented in [the runbook](../docs/runbook.md). The owner must authorize the selected executor and task signer through the router before task submission.

## Configure a real task

Required client settings:

| Setting | Meaning |
| --- | --- |
| `MONAD_RPC_URL` | RPC for Monad Testnet, chain 10143; may contain a private server-side provider credential |
| `AETHERIS_ROUTER_ADDRESS`, `REPUTATION_REGISTRY_ADDRESS` | Contracts from the same verified deployment |
| `AGENT_ID`, `EXECUTOR_ADDRESS` | Registered identity and one configured, authorized daemon relayer |
| `TASK_SIGNER_PRIVATE_KEY` | Authorized EOA owner/delegate; must be distinct from every daemon relayer key |
| `TASK_SEQUENCE_NONCE`, optional `TASK_ID` | Stable attempt identity; task ID is generated once and persisted if omitted |
| `DAEMON_URL` | Actual daemon base URL; the client uses **`/v1/tasks`**, not `/v1/task` |
| `MCP_SERVER_URL`, `MCP_TOOL_NAME`, `MCP_ARGUMENTS_FILE` | Real Streamable HTTP endpoint, advertised tool and JSON object containing its arguments |
| Optional `MCP_BEARER_TOKEN` | Credential for that MCP service; sent only in the authorization header |
| `PAYMENT_ASSET`, `PAYMENT_ASSET_NAME`, `PAYMENT_ASSET_VERSION`, `PAYMENT_RECEIVER` | Independently chosen EIP3009 token, its EIP712 domain and intended recipient |
| `PAYMENT_MAX_AMOUNT` | Explicit positive spending ceiling in token base units; there is no default amount authorization |
| `PAYMENT_MAX_TIMEOUT_SECONDS` | Maximum accepted payment validity; defaults to 120, cannot exceed 300 |
| `TASK_CONFIRMATIONS` | Receipt confirmations, default 12 |

The payer is the task signer. It needs the payment token balance and testnet MON for the later reputation transaction. The executor needs its own testnet MON. All three roles and their authorizations are separate from a Dynamic login. This client accepts an EOA key; it does not export a passkey or implement EIP1271 task signing.

The client requires HTTPS for daemon/MCP endpoints except localhost, rejects URL credentials/query parameters/fragments, disables redirects and bounds requests and response bodies. Use bearer settings for secrets. Endpoint URLs are part of the persisted input context; do not put sensitive data in them.

This client implements **x402 v2 exact/EIP3009**. The daemon may support its custom Graph Tally adapter mode, but this client refuses `PAYMENT_MODE=graph-tally`; it does not manufacture Graph Tally receipts or assume a Graph settlement deployment. A real compatible x402 facilitator and token must be configured on the daemon before proceeding.

## Invoke once, sign and submit

Prepare a real JSON argument object appropriate for your selected MCP tool in a private file and set `MCP_ARGUMENTS_FILE`. Arguments are not guessed from a tool description. Choose a persistent task directory under `scripts/.state`:

```powershell
pnpm submit-task --run-dir .state/tasks/first-run
```

The client checks chain, router, daemon configuration and on-chain authorization, initializes the MCP session with the official SDK, lists tools to confirm the configured name, then calls it once. MCP protocol failures, `isError: true`, missing output and oversized responses stop the run before a paid task is submitted.

It saves canonical input/output bytes, obtains the actual unpaid 402 challenge, checks every payment term against local settings, signs the exact daemon `TaskAuthorization`, signs an EIP3009 `TransferWithAuthorization`, persists both signatures, then submits one paid POST. It does not accept Permit2, extra payment mechanisms, another chain/token/recipient, an unrelated resource URL or a price above the local ceiling.

After daemon completion, it checks the predicted CREATE2 address and salt, successful canonical creation/execution receipts, sender and every task event field. For payment, it independently checks a successful canonical receipt containing both the exact token `Transfer` and `AuthorizationUsed` for the saved random nonce. A facilitator's JSON success alone does not pass this verification.

Only then does it call `ReputationRegistry.recordTaskExecution(shard)` using the task signer. The contract exposes that as a public recording function. Existing recordings are detected; signed raw transaction bytes and their hash are saved before broadcast so an interrupted recording can reuse identical bytes rather than allocate another nonce. If another caller records first, a confirmed reverted recording transaction is retained as provenance while the existing record allows continuation. The signer must be dedicated to this workflow while it runs. Persistent signer journals coordinate this client's task journals on this host, not arbitrary wallets or external tools.

Successful output prints a request ID, shard, execution transaction hash and the path to `client-proof.json`. It never prints a private key, payment header, MCP output or raw RPC error.

### Review output before paying, or supply an independent assessment

To call MCP and persist its result without signing or submitting a paid task:

```powershell
pnpm submit-task --run-dir .state/tasks/reviewed-run --prepare-only
```

Read the private `output.canonical.json`. To submit after review:

```powershell
pnpm submit-task --run-dir .state/tasks/reviewed-run --resume
```

Reputation recording happens automatically after verified completion. **Feedback is optional and never generated by the program.** To publish a real assessment, set both `REVIEWER_PRIVATE_KEY` and `REVIEW_ASSESSMENT_FILE`. The reviewer must differ from the owner, task signer, all relayers, ERC-721 approved operators and router delegates. It needs its own gas funds.

The assessment file must explicitly contain:

```text
{
  taskId: the actual 32-byte task ID,
  outputHash: the actual saved output hash,
  reviewed: true,
  value: a reviewer-selected signed integer encoded as a decimal string,
  valueDecimals: an integer from 0 through 18,
  tag1: a real rating category (use "quality" for the dashboard's quality filter),
  tag2: a string, possibly empty,
  endpoint: the assessed public service endpoint,
  feedbackURI: the actual public feedback URI, or an empty string,
  assessment: the reviewer's written assessment
}
```

This describes a schema, not a fabricated rating file. Supply valid JSON and an honest reviewer-selected value. The assessment is hashed and bound to the exact output; changing it after a feedback transaction is prepared is rejected. The transaction is persisted before broadcasting and its `NewFeedback` event is checked, preventing another feedback transaction on resume. Adding a reviewer after an initial no-feedback completion is supported by `--resume`; public proof is updated after verification.

## Private artifacts, public proof and resume rules

| Artifact in the task directory | Contents and handling |
| --- | --- |
| `state-00000000.json`, subsequent numbered snapshots | Private journal: signed task/payment, invocation/submission state and any signed reputation transactions. Never publish these files |
| `input.canonical.json`, `output.canonical.json` | Exact UTF-8 commitment bytes; private by default because MCP inputs/outputs may be sensitive |
| `client.lock` | Exclusive operation marker; normally removed on clean exit |
| `client-proof.json` | Explicit public-field allowlist: deployment/task/hash/receipt evidence, payment token/amount/nonce, reputation references and task authorization message/domain |

The client rejects `--run-dir` outside `scripts/.state`. POSIX files use restrictive creation modes; Windows operators must also restrict directory ACLs. Signed raw transactions and payment authorizations are credentials even though they contain no private key. Back up the journal consistently and keep it across restarts.

Canonicalization is named `aetheris-sorted-json-v1`: sort object keys lexicographically; preserve array order; use JSON string/number encoding; encode UTF-8 with no whitespace or trailing newline. Unsafe integer numbers, non-finite numbers and undefined values are rejected. Large numeric arguments should be decimal strings. The input envelope is `{format:"aetheris-mcp-input-v1",endpoint,tool,arguments}`. Output is the validated MCP `CallToolResult`, not the HTTP/JSON-RPC envelope. Hashes are Ethereum Keccak-256 over those exact files. This format is explicitly defined here; it is not an assertion of complete RFC 8785 coverage.

Resume the same directory:

```powershell
pnpm submit-task --run-dir .state/tasks/first-run --resume
```

Resume behavior deliberately follows durable facts:

- An interrupted MCP call is marked `mcp_started`. Its outcome may be unknown, so it is not called again. Reconcile with the tool server.
- Saved output can continue to signing without another MCP invocation.
- Saved, unsubmitted signatures may be used only while still valid. Expired signatures are not automatically replaced with another payment.
- A persisted paid-submission intent resumes using `GET /v1/tasks/{requestId}` only. A 404 or ambiguous timeout does not trigger another paid POST. The original request may have reached the daemon or provider; reconcile before another attempt.
- Accepted jobs are polled for a bounded interval; resume again if still pending. Settlement/reconciliation failures remain visible and do not cause another payment.
- Reputation/feedback resumes inspect the saved transaction hash, then only rebroadcast the identical signed bytes when the RPC has no transaction and the sender nonce has not advanced. A changed signer/intent/assessment is rejected.
- A global journal under `scripts/.state/signers/<address>` reserves each pending nonce across task directories until its transaction is confirmed successful or reverted. An ambiguous send blocks other tasks using that signer. Resume the original owning task; its signed bytes survive even a crash between the global and per-task saves.

If a process crashed with `client.lock` still present, first verify that the old process is stopped. Remove only that known lock file to allow resume; do not remove state snapshots, change request identity or create a new journal to conceal an unresolved operation. There is no automatic cross-system reconciliation command. The daemon's own redb journal remains a separate durable requirement.

Default public proof omits the task signature while it is active and always omits payment signatures. After the task's ten-minute authorization deadline has passed, explicitly export an expired signed sample:

```powershell
pnpm submit-task --run-dir .state/tasks/first-run --resume --export-proof
```

This requires a previously verified task, rechecks chain/payment receipts, skips reputation/feedback writes, and includes only the now-expired task signature. Set `TASK_PROOF_PATH` to that proof file for `pnpm submission-proof`. The proof collector can independently recompute the request digest and verify its signer without publishing an active authorization. Public proof never includes provider URLs, bearer tokens, raw signed transactions, MCP contents or arbitrary provider response fields.

## Tests and boundaries

`pnpm test` runs one test file at a time. Client tests exercise actual EIP712 signatures, challenge overspend/domain/recipient rejection, event tampering, exact payment nonce matching, durable locks/state, signed-transaction intent checks, review binding, expired-only signature export and a local HTTP MCP handshake/list/call/error fixture. `pnpm typecheck` also includes the deployment/card/proof tools.

These checks do not establish a live paid integration, funded escrow, truthful MCP output, hardware attestation, production throughput or an independent security audit. A committed output hash proves the bytes that were submitted; this client uses a zero proof hash and does not invent a TEE attestation. Supply a real service, deployment and payment configuration to collect live evidence.

Implementation references: [official MCP TypeScript v1 SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x), [x402 EIP3009 client implementation](https://github.com/x402-foundation/x402/blob/main/typescript/packages/mechanisms/evm/src/exact/client/eip3009.ts), [ERC-3009 authorization and events](https://eips.ethereum.org/EIPS/eip-3009), and [daemon API](../daemon/README.md).
