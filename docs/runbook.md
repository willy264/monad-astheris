# Aetheris operator runbook

The dashboard can run in read-only mode on Windows. A paid task additionally requires deployed contracts, funded authorized wallets, a working MCP service and an actual payment provider. The repository now includes the [MCP task/payment client](../scripts/README.md); it does not host the remote MCP service or a Graph Tally settlement adapter. Follow the [2026-10-03 live workflow](live-submission.md) for the new deployment, registration and evidence tools; the service-level commands below remain useful.

Use [architecture.md](architecture.md) for component boundaries, [protocol.md](protocol.md) for exact hashing rules, [submission-readiness.md](submission-readiness.md) for the readiness assessment, and [VERIFICATION.md](../VERIFICATION.md) for checks already completed. Commands below are instructions for an operator; documenting them does not deploy contracts or submit payments.

## 1. Fastest path: read-only dashboard on Windows

Open PowerShell in the repository's `aetheris` directory. Install Node 22 and pnpm 10.32.1 if they are not already available. The frontend and indexer each have their own lockfile; there is no root pnpm workspace install.

```powershell
node --version
pnpm --version
Set-Location frontend
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`, then `/agents` and `/visualizer`. Leave the contract addresses and Dynamic environment ID blank for this first run. The overview reads actual Monad Testnet blocks through the public RPC. Contract-dependent panels explain their missing configuration; the directory API returns 503 until an identity registry is configured. There are no seeded agents or simulated execution events. An unavailable RPC produces an error state rather than invented statistics.

This path needs no Rust process, Envio process, Docker, wallet, or private key. Next.js server routes read RPC directly; the dashboard does not consume the daemon API or indexer's GraphQL endpoint. To display an existing deployment, fill its three public contract addresses and deployment block in `.env.local`, then restart Next.js. Do not substitute an unrelated ERC-8004 deployment for this router's identity registry.

For a production-mode local preview, stop `pnpm dev`, then run:

```powershell
pnpm typecheck
pnpm build
pnpm start
```

The default port remains 3000. A production build captures `NEXT_PUBLIC_*` values, so rebuild after changing addresses, the public RPC, or the Dynamic environment ID.

## 2. Prerequisites and fixed versions

| Component | Tooling and pinned dependencies | Operational requirement |
| --- | --- | --- |
| Contracts | Foundry 1.8.4 was tested; Solidity 0.8.24 is pinned in `foundry.toml`; OpenZeppelin 5.4.0 and forge-std 1.9.7 are pinned to commits | Git to restore vendor dependencies; RPC and testnet MON only for deployment/transactions |
| Daemon | Rust/Cargo 1.94.0 was tested; use 1.94 or newer with the committed `Cargo.lock` | Native C/C++ linker; RPC, deployed router, dedicated relayer keys, persistent disk, payment provider |
| Indexer | Node 22+, pnpm 10.32.1, Envio 3.12.1 | Linux/macOS or working WSL2; Docker for local storage, or an Envio Cloud project |
| Frontend | Node 22 works across the stack; pnpm 10.32.1; Next 14.2.35, React 18.3.1, Dynamic 5.9.2, Tailwind 3.4.17 | RPC; Dynamic project only for wallet/passkey functions |
| Optional RPC probe | Python 3, standard library only | Read access to the chosen RPC |

`Cargo.toml` declares Rust 1.91. Successful verification used Rust/Cargo 1.94.0; the minimum supported toolchain has not been independently verified. Use 1.94.0 to reproduce the recorded checks. The Windows build used the GNU Rust target and an MSYS2 MinGW linker. A fresh Windows installation needs a linker appropriate to its chosen Rust target.

Check installed tools without starting services:

```powershell
forge --version
cast --version
rustc --version
cargo --version
node --version
pnpm --version
```

In the supplied Windows workspace, Foundry was installed under `aetheris/.tools/foundry`. If those local files exist, add that directory to the current shell's PATH from `aetheris`:

```powershell
if (Test-Path .tools/foundry/forge.exe) {
    $env:PATH = (Resolve-Path .tools/foundry).Path + ';' + $env:PATH
}
```

That ignored tool directory is not a portable installation guarantee. Restore missing Solidity dependencies from `contracts` with `./script/install-deps.ps1` on PowerShell or `bash script/install-deps.sh` on Linux/macOS. These scripts check the pinned commits. Keep both pnpm lockfiles and `daemon/Cargo.lock`; use `--frozen-lockfile` and `--locked` when installing/building.

## 3. Services, ports, and environment loading

| Component | Default listener or endpoint | Persistent data |
| --- | --- | --- |
| Contracts | No local HTTP service; deployed on Monad Testnet, chain ID 10143 | On-chain state; deployment manifest and Foundry broadcast receipts |
| Daemon | `http://127.0.0.1:8080` | `daemon/aetheris.redb` by default |
| Indexer, local | GraphQL: `http://localhost:8081/v1/graphql`; Hasura administration: `/v1/metadata` | Envio-managed PostgreSQL/Docker storage |
| Frontend | `http://localhost:3000` | Build output and transient process caches; authoritative data stays on-chain |

The indexer template explicitly moves Hasura to 8081 so it does not collide with the daemon. PostgreSQL and any additional Envio service ports follow the generated Envio/Docker configuration; inspect that configuration on the host rather than assuming another fixed port. Envio Cloud supplies its own storage and GraphQL URL.

Create environment files only when missing; edit them with your actual deployment values:

```powershell
# Run from aetheris.
if (-not (Test-Path contracts/.env)) { Copy-Item contracts/.env.example contracts/.env }
if (-not (Test-Path daemon/.env)) { Copy-Item daemon/.env.example daemon/.env }
if (-not (Test-Path indexer/.env)) { Copy-Item indexer/.env.example indexer/.env }
if (-not (Test-Path frontend/.env.local)) { Copy-Item frontend/.env.example frontend/.env.local }
```

| Location | How values are loaded |
| --- | --- |
| `contracts/.env` | Foundry reads local environment configuration. `monad_testnet` in `foundry.toml` resolves `MONAD_RPC_URL`. The deployment script explicitly reads `PRIVATE_KEY`. Run Forge from `contracts`. |
| `daemon/.env` | `dotenvy` loads `.env` at startup, searching upward from the working directory. Existing process environment values take precedence. Run from `daemon` so the file and relative database path are unambiguous. |
| `indexer/.env` | Envio uses project environment configuration. Before `dev`/`start`, `scripts/check-config.mjs` also loads local `.env` with Node's `loadEnvFile()` and rejects missing/zero addresses. Run from `indexer`. |
| `frontend/.env.local` | Next.js loads local environment files. `NEXT_PUBLIC_*` values are browser-visible and compiled into production bundles; other listed values are used by server code. Restart development or rebuild/restart production after configuration changes. |

Copying a `.env` file does not export its variables into PowerShell, Bash, Python, or another project's process. The Cast examples below use explicitly assigned public variables. Do not dot-source a dotenv file as a shell script. Environment files are ignored by Git; public frontend variables must never contain signing keys, provider secrets, or a Dynamic API secret.

### Deployment values shared across components

After a successful broadcast, map the actual addresses from `contracts/deployments/10143.json` and confirmed receipts as follows:

| Source value | Contracts | Daemon | Indexer | Frontend |
| --- | --- | --- | --- | --- |
| Monad Testnet RPC | `MONAD_RPC_URL` | `MONAD_RPC_URL` | `ENVIO_MONAD_RPC_URL` | Server `MONAD_RPC_URL`; separate public `NEXT_PUBLIC_MONAD_RPC_URL` for wallet calls |
| `router` | Deployed router | `AETHERIS_ROUTER_ADDRESS` | `ENVIO_ROUTER_ADDRESS` | `NEXT_PUBLIC_ROUTER_ADDRESS` |
| `identityRegistry` | Deployed identity registry | Resolved by the router; no separate variable | `ENVIO_AGENT_REGISTRY_ADDRESS` | `NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS` |
| `reputationRegistry` | Deployed reputation registry | No variable | No variable | `NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS` |
| `validationRegistry` | Use for the separate validation flow | No variable | No variable | No variable |
| Earliest confirmed registry deployment block | Record from broadcast receipts | `DEPLOYMENT_BLOCK` | `ENVIO_START_BLOCK` | `DEPLOYMENT_BLOCK` |
| Batch publisher | `COMMITTER_ADDRESS` at deployment, or later `setCommitter` | First address represented by `RELAYER_PRIVATE_KEYS` if batches are enabled | Observes commitments | Reads router events |

Use the earliest identity-registry deployment block across these settings so registrations are not missed. Starting late can leave the indexer without an agent required by later task events. `deployments/10143.json` does not contain the deployment block. The deploy script writes that manifest during simulation too, so the file alone is not evidence that any code was deployed.

### Remaining environment variables

| Component | Variables | Meaning |
| --- | --- | --- |
| Contracts | `PRIVATE_KEY` | Deployment signer's local testnet key, required by the supplied script; no default |
| Contracts | `ADMIN_ADDRESS`, `COMMITTER_ADDRESS` | Optional explicit addresses; remove empty entries to use the deployer defaults |
| Daemon | `RELAYER_PRIVATE_KEYS` | Comma-separated 1–32 unique funded keys, exclusively used by this daemon process |
| Daemon | `LISTEN_ADDR`, `CORS_ORIGIN` | Defaults `127.0.0.1:8080` and `http://localhost:3000`; CORS allows one configured browser origin |
| Daemon | `DATABASE_PATH` | Durable replay protection and task/broadcast journal; default `aetheris.redb` |
| Daemon | `MAX_INFLIGHT`, `CONFIRMATIONS` | Default 32 concurrent jobs and 12 transaction confirmations; concurrency range 1–256, confirmations must be positive |
| Daemon | `BATCH_ENABLED`, `RUST_LOG` | Batch worker starts only for literal `true`; default logging is in the template |
| Daemon, both payment modes | `PAYMENT_MODE`, `PUBLIC_TASK_URL`, `PAYMENT_RECEIVER`, `PAYMENT_AMOUNT` | Mode `x402` or `graph-tally`; actual advertised task URL; receiver; positive integer price in the selected payment system's base units |
| Daemon, x402 | `X402_FACILITATOR_URL`, optional `X402_FACILITATOR_TOKEN` | Actual facilitator base URL and optional bearer token; HTTPS required except local development endpoints |
| Daemon, x402 | `PAYMENT_ASSET`, `PAYMENT_ASSET_NAME`, `PAYMENT_ASSET_VERSION` | Deployed EIP3009 token address and its correct EIP712 name/version |
| Daemon, Graph Tally | `GRAPH_TALLY_ADAPTER_URL`, optional `GRAPH_TALLY_ADAPTER_TOKEN` | External implementation of the custom adapter contract in the daemon README |
| Daemon, Graph Tally | `GRAPH_TALLY_CHAIN_ID`, `GRAPH_TALLY_VERIFYING_CONTRACT`, `GRAPH_TALLY_DOMAIN_NAME`, `GRAPH_TALLY_DOMAIN_VERSION` | Actual Graph service's receipt domain; do not assume it is the Monad router's domain |
| Daemon, Graph Tally | `GRAPH_TALLY_COLLECTION_ID`, `GRAPH_TALLY_DATA_SERVICE`, `GRAPH_TALLY_MAX_AGE_SECONDS` | Actual collection and data-service identifiers; default receipt age limit 300 seconds |
| Indexer | `ENVIO_API_TOKEN` | HyperSync access token when required by the selected local/provider setup; Envio Cloud manages access for its deployment |
| Indexer, local | `HASURA_EXTERNAL_PORT`, `HASURA_GRAPHQL_ENDPOINT`, `HASURA_GRAPHQL_ADMIN_SECRET` | Local Hasura port, **metadata** endpoint, and admin secret. The example secret is for local development only; supply a private value for self-hosting |
| Frontend | `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` | Public Dynamic environment identifier; blank keeps wallet access unconfigured |
| Frontend | `EVENT_LOOKBACK_BLOCKS` | Event observation window, default 200; code bounds it to 12–1000 blocks |
| Frontend | `IPFS_GATEWAY` | Gateway for `ipfs://` cards, default `https://ipfs.io/ipfs/`; HTTP card URIs are not fetched |

There is no `DAEMON_URL` setting in the frontend; task submission uses the scripts client. Server-only `ENVIO_GRAPHQL_URL` now selects indexed dashboard reads, with optional `ENVIO_GRAPHQL_ADMIN_SECRET` or `ENVIO_GRAPHQL_TOKEN`. An absent endpoint uses labeled RPC fallback; a configured endpoint failure remains visible.

## 4. Full-stack sequence

### A. Prepare external accounts and services

Have these real resources available before attempting a paid task:

1. A Monad Testnet RPC serving chain 10143, contract calls and logs. Optional batching also needs the `finalized` block tag and block-hash log filters.
2. A deployment signer, agent owner, and dedicated relayer wallet(s), funded with testnet MON for the transactions each submits. Wallets may share roles where appropriate, but a relayer key must not be concurrently used by another daemon or wallet process.
3. Either an x402 facilitator supporting v2 `exact` payments on `eip155:10143` and a compatible funded EIP3009 token, or the real Graph Tally service plus the custom adapter described below.
4. An IPFS-pinned Agent Card and the actual MCP/A2A service endpoints it describes, if the directory is to advertise a usable agent.
5. For wallet/passkey UI: a Dynamic environment configured for the chosen origin, EVM wallets and Monad Testnet. For local indexing: working Linux/macOS/WSL2 and Docker, or an Envio Cloud project.

The repository does not supply faucet funds, token deployments, provider accounts, IPFS pinning, an MCP task runner, or a signed payment credential. Only configure a TEE attestor after the external verifier and trust policy exist; deployment begins with no trusted attestors or measurements.

### B. Deploy and confirm the contracts

Fill `contracts/.env` with the RPC and deployment key. Remove the optional `ADMIN_ADDRESS` and `COMMITTER_ADDRESS` lines if using the deployer for both; an empty value is not the same as an absent optional variable. A distinct committer can be the first daemon relayer's public address.

From `contracts`:

```powershell
forge test --threads 1
forge script script/Deploy.s.sol:Deploy --rpc-url monad_testnet
```

Review the simulated deployment. The following command sends funded transactions when you run it:

```powershell
forge script script/Deploy.s.sol:Deploy --rpc-url monad_testnet --broadcast
```

This particular script calls `vm.envUint("PRIVATE_KEY")`; adding a `--account` flag does not replace that requirement. A hardware-wallet or keystore-only deployment needs a reviewed deployment workflow compatible with that signer. Subsequent Cast operations below can use an existing encrypted keystore account.

Inspect the successful transaction receipts in Foundry's `broadcast/Deploy.s.sol/10143/` output and confirm code at all four addresses. Distinguish actual broadcast output from dry-run artifacts. Record the earliest registry deployment block in decimal. A manifest written by a simulation can contain addresses with no code.

For read-only checks from `contracts`:

```powershell
$rpcUrl = Read-Host 'Monad Testnet RPC URL'
$deployment = Get-Content deployments/10143.json -Raw | ConvertFrom-Json
$routerAddress = $deployment.router
$identityAddress = $deployment.identityRegistry
cast chain-id --rpc-url $rpcUrl
cast code $routerAddress --rpc-url $rpcUrl
cast code $identityAddress --rpc-url $rpcUrl
cast code $deployment.reputationRegistry --rpc-url $rpcUrl
cast code $deployment.validationRegistry --rpc-url $rpcUrl
cast call $routerAddress 'identityRegistry()(address)' --rpc-url $rpcUrl
```

Expected: chain ID `10143`, nonempty bytecode rather than `0x`, and the identity address matching the manifest. Verify the receipts succeeded; code existence alone is not a complete deployment audit. Provider URLs containing credentials are better supplied through your shell's secret-management workflow than copied into shared terminal transcripts.

If `ADMIN_ADDRESS` differs from the deployer, that address is only the **pending** administrator until it accepts ownership separately on the router, reputation registry and validation registry. For an EOA admin already in a Cast keystore:

```powershell
$adminAccount = Read-Host 'Existing Cast keystore account for the pending administrator'
cast send $routerAddress 'acceptOwnership()' --account $adminAccount --rpc-url $rpcUrl
cast send $deployment.reputationRegistry 'acceptOwnership()' --account $adminAccount --rpc-url $rpcUrl
cast send $deployment.validationRegistry 'acceptOwnership()' --account $adminAccount --rpc-url $rpcUrl
```

A multisig administrator performs the same calls through its own transaction workflow. The identity registry has no analogous admin transfer. A distinct `COMMITTER_ADDRESS` receives batch permission during deployment and the deployer's batch permission is revoked.

### C. Register an agent and delegate execution

Create and pin an ERC-8004 Agent Card containing the real name, description, capabilities and service endpoints. The frontend fetches `ipfs://` cards through the configured gateway; it displays service endpoints without invoking them. See [the contracts README](../contracts/README.md) for registration and wallet semantics.

The following sends a registration transaction from an existing encrypted Cast keystore account. Use the actual pinned URI when prompted. These variables continue from the deployment example; reassign them in a new terminal as needed.

```powershell
$ownerAccount = Read-Host 'Existing Cast keystore account for the agent owner'
$agentCardUri = Read-Host 'Pinned Agent Card URI beginning ipfs://'
cast send $identityAddress 'register(string)' $agentCardUri --account $ownerAccount --rpc-url $rpcUrl
```

Obtain the assigned agent ID from that transaction's `Registered` event, not from a global supply count that another registration could change. One way to decode its first indexed topic is:

```powershell
$registrationTx = Read-Host 'Successful registration transaction hash'
$receipt = cast receipt $registrationTx --rpc-url $rpcUrl --json | ConvertFrom-Json
$registeredTopic = cast keccak 'Registered(uint256,string,address)'
$registered = $receipt.logs | Where-Object {
    $_.address -ieq $identityAddress -and $_.topics[0] -ieq $registeredTopic
}
if (-not $registered) { throw 'No Registered event from the configured identity registry' }
$agentId = cast to-dec $registered.topics[1]
cast call $identityAddress 'ownerOf(uint256)(address)' $agentId --rpc-url $rpcUrl
```

Fund each configured relayer and record its public address. The agent's current NFT owner grants a time-limited router delegation to every executor that will serve it:

```powershell
$relayerAddress = Read-Host 'Public address of a funded daemon relayer'
$expiry = [DateTimeOffset]::UtcNow.AddHours(1).ToUnixTimeSeconds()
cast send $routerAddress 'setDelegate(uint256,address,uint64)' $agentId $relayerAddress $expiry --account $ownerAccount --rpc-url $rpcUrl
cast call $routerAddress 'isAuthorized(uint256,address)(bool)' $agentId $relayerAddress --rpc-url $rpcUrl
```

Expected authorization result: `true`. A task's client signer must separately be the owner or another unexpired delegate; authorize that EOA too if it differs from the owner. ERC-721 transfer approvals and the `agentWallet` metadata field do not grant router task rights. The daemon does not accept EIP1271 contract-wallet task signatures; a contract-wallet owner can authorize an EOA session delegate through its own wallet workflow.

To revoke a grant, the current owner calls the same `setDelegate` function with expiry `0`. Identity transfers invalidate prior delegates through the ownership epoch. Alternatively, the configured dashboard's Agent access module can sign, simulate and submit owner delegation/revocation transactions.

### D. Configure payments before starting the daemon

With `PAYMENT_MODE=x402`, supply the actual facilitator URL, receiver, token address, EIP712 token name/version and amount. Startup calls the facilitator's `/supported` endpoint and requires this advertised combination:

```json
{"x402Version":2,"scheme":"exact","network":"eip155:10143"}
```

The facilitator must implement verification and settlement for that deployed token on this network. The payer must have the relevant token balance and sign the proper authorization; testnet MON for transaction gas is a different resource. The daemon binds the EIP3009 sender to the signer authorizing the task. No unpaid mode or permissive local facilitator ships.

For `PAYMENT_MODE=graph-tally`, configure the real Graph Tally receipt domain, collection, data service, receiver and price. Deploy or provide an adapter implementing the precise `/verify` and `/settle` contract in [daemon/README.md](../daemon/README.md#payments-and-graph-tally-trust-boundary). It must verify escrow and authorized receipt signers, durably aggregate/accept receipts, deduplicate them, and support reconciliation. This custom adapter transport is not an official Graph Tally HTTP API or a claim that Graph Tally is deployed on Monad. Local receipt verification alone does not redeem funds.

Set `PUBLIC_TASK_URL` to the exact endpoint clients will call, including any HTTPS hostname used by a reverse proxy. Provider bearer tokens stay in server configuration. Neither a provider nor an adapter can be replaced with placeholder credentials to obtain a meaningful end-to-end run.

### E. Start the daemon and inspect readiness

Complete `daemon/.env` using the mapping above, including `DEPLOYMENT_BLOCK` even when batching is off. Start with `BATCH_ENABLED=false`. From `daemon`:

```powershell
cargo check --locked --jobs 1
cargo run --locked --release --jobs 1
```

The first build requires dependency downloads unless cached. Keep this process running. In a second terminal:

```powershell
curl.exe --include http://127.0.0.1:8080/health
curl.exe --include http://127.0.0.1:8080/v1/config
```

Expected health response: HTTP 200 with `status: "ok"`, `chainId: 10143`, the configured router, public relayer addresses, a current `blockNumber`, and `batchWorker: "disabled"`. Startup rejects the wrong chain, a router without code, malformed keys and unusable payment configuration. The health check confirms RPC and worker liveness; it does not prove every relayer is funded/delegated or that a future payment will settle.

For batch commitments, authorize the first relayer as a router committer if the deployment script did not already do so. The router's current administrator sends:

```powershell
cast send $routerAddress 'setCommitter(address,bool)' $relayerAddress true --account $adminAccount --rpc-url $rpcUrl
cast call $routerAddress 'committers(address)(bool)' $relayerAddress --rpc-url $rpcUrl
```

Here `$relayerAddress` must be the **first** configured relayer and `$adminAccount` must represent the current router owner, which can be the deployer if no transfer occurred. Set `BATCH_ENABLED=true` and restart. Health should show `batchWorker: "running"`. The worker scans finalized blocks from the configured deployment block, commits each nonempty block's Merkle root, and advances its durable cursor across empty blocks. It needs gas as well as committer authorization.

### F. Start indexing on a supported platform

Use Linux/macOS or a working WSL2 distribution with Docker available. Native Windows Envio 3.12.1 cannot load its required addon. The supplied machine's WSL startup also failed, so full code generation and generated-type checking remain an environment prerequisite; passing the standalone Merkle tests does not substitute for them.

In a Linux/macOS/WSL terminal at `aetheris/indexer`, with `.env` filled and Docker running:

```sh
pnpm install --frozen-lockfile
pnpm codegen
pnpm typecheck
pnpm test
pnpm dev
```

Install dependencies in that operating system; do not reuse a Windows `node_modules` tree for Linux native addons. A separate Linux checkout is the least ambiguous setup. The zero-address YAML fallbacks permit schema generation, but the `dev` and `start` scripts reject missing deployment addresses. The start block must include registrations needed by later events.

`pnpm dev` launches the local Envio development stack. `pnpm start` is also provided for starting the indexer with an already prepared runtime/storage configuration; it is not a cloud deployment command. For Envio Cloud, select the `indexer` directory as the project root, provide its deployed `ENVIO_*` values and provider settings, and use the cloud service's managed database/GraphQL endpoint. Do not pass the local Hasura URLs into a cloud deployment.

Query the local GraphQL endpoint using your configured Hasura authentication. The example query in [indexer/README.md](../indexer/README.md) reads `TaskExecution` and `MerkleBatch`. An empty result is expected before any corresponding transactions. Indexer commitments are checked against independently computed roots; the indexer does not send settlement transactions.

### G. Configure and start the full dashboard

Set the frontend's router, identity and reputation addresses to the same deployment, and set its deployment block. Optionally configure the Dynamic environment ID after enabling EVM wallets, Monad Testnet, allowed origins, embedded-wallet/passkey authentication and recovery in your Dynamic project. Use HTTPS for hosted WebAuthn; localhost is the development exception.

From `frontend`, run `pnpm install --frozen-lockfile`, then either `pnpm dev` or `pnpm build` followed by `pnpm start`. The UI can now discover registered identities and observe router events. A Dynamic login does not itself grant agent authorization. Passkey enrollment and signing depend on the actual Dynamic environment and supported wallet; the application does not extract a P-256 key or deploy a raw P-256 verifier.

## 5. Submit a signed, paid task

Use the supplied [task-signing/payment CLI](../scripts/README.md), which invokes the MCP tool and supplies the exact daemon authorization/payment formats. The dashboard has no task-submission form. The manual commands below remain send-only examples for existing signed artifacts; the daemon itself does not generate outputs.

The required sequence is:

1. Read `GET /v1/config` for the router, configured relayer addresses, authorization domain and payment requirements. Select an authorized relayer as `executor`.
2. Construct the exact task JSON documented in the daemon README. Encode `agentId` and `sequenceNonce` as decimal strings, hashes as 32-byte hex, and `deadline` as Unix seconds within the next ten minutes. Use a fresh `(agentId, taskId, sequenceNonce)` for a new attempt.
3. Have an authorized EOA sign EIP712 `TaskAuthorization`, binding agent, task, nonce, input/output/proof hashes, executor and deadline. Domain: `AetherisTask`, version `1`, chain `10143`, verifying contract equal to the deployed router. A raw passkey assertion or arbitrary `personal_sign` message is not this signature.
4. Obtain the exact payment authorization for the configured mode. For x402, the same task signer is the EIP3009 payer; send base64 JSON in `PAYMENT-SIGNATURE`. For the custom Graph Tally mode, obtain the authorized receipt and send base64 JSON in `X-GRAPH-TALLY-RECEIPT`.
5. Submit the signed task, preserve its request ID, and inspect both execution receipts and payment result. The API waits for confirmed create/execute transactions before settlement; allow for RPC latency and confirmation time.

You can inspect the payment challenge without signing or spending funds:

```powershell
curl.exe --include --request POST http://127.0.0.1:8080/v1/tasks --header 'Content-Type: application/json' --data '{}'
```

Expected: HTTP 402 with a base64 `PAYMENT-REQUIRED` header and JSON requirements, because payment middleware runs before the task handler. This does not demonstrate successful task authorization or payment settlement.

Once your external client has written a valid `task.json` and placed the encoded x402 credential in the current process's `AETHERIS_PAYMENT_SIGNATURE` environment variable, this **send-only** command transmits those existing artifacts:

```powershell
if (-not $env:AETHERIS_PAYMENT_SIGNATURE) { throw 'Supply a real client-generated payment credential first' }
curl.exe --include --request POST http://127.0.0.1:8080/v1/tasks --header 'Content-Type: application/json' --header "PAYMENT-SIGNATURE: $env:AETHERIS_PAYMENT_SIGNATURE" --data-binary '@task.json'
```

`AETHERIS_PAYMENT_SIGNATURE` is a shell variable for this example, not a daemon configuration key. In Graph Tally mode replace the payment header with `X-GRAPH-TALLY-RECEIPT` containing the real encoded receipt. Substitute the configured public URL when calling a hosted service. Keep signed request and payment artifacts out of source control.

On Linux/macOS, use `curl` rather than `curl.exe`; equivalent header interpolation is `--header "PAYMENT-SIGNATURE: $AETHERIS_PAYMENT_SIGNATURE"`. Curl does not generate either signature. PowerShell's `curl.exe` spelling avoids the older `curl` alias to `Invoke-WebRequest`.

| Result | Meaning and next action |
| --- | --- |
| 200, `status: "completed"` | Successful confirmed task result and provider-accepted payment response; retain `createTx`, `executionTx`, shard and settlement metadata |
| 202, `status: "accepted"` | Existing job is still running; poll `GET /v1/tasks/{requestId}` |
| 401 | Task authorization rejected; check domain, fields, deadline and on-chain signer/executor rights |
| 402 plus `PAYMENT-REQUIRED` | Missing/rejected payment; inspect the renewed requirements and provider-side reason without blindly repaying |
| 409 | Conflicting canonical task intent or already reserved payment credential |
| 429 | Daemon concurrency capacity exhausted; retry with bounded backoff |
| 502, `settlement_pending` or `reconciliation_required` | Preserve the job and journal; reconcile transactions/payment before any new payment or attempt |
| 400 or 413 | Malformed request or body over the 32 KiB limit |

Axum may also return 422 for a JSON body whose types do not match the request schema. A missing job returns 404. To poll a known job:

```powershell
$requestId = Read-Host 'Original task requestId'
curl.exe --include "http://127.0.0.1:8080/v1/tasks/$requestId"
```

Canonical task identity is `(chain, router, agentId, taskId, sequenceNonce)`. Renewing only the signed deadline for the same intent returns the original job without another charge; changing input/output/proof/executor under that identity conflicts. An intentional fresh execution uses a new sequence nonce. Do not create a new identity simply to work around an unresolved payment or broadcast.

Neither completed-task submission nor indexing automatically publishes reputation feedback or validates a TEE proof. Those are separate registry transactions and policies. A nonzero `proofHash` is only a commitment to bytes until the actual validation workflow verifies it.

## 6. Verification without deploying or paying

The completed local record is [VERIFICATION.md](../VERIFICATION.md): 22 contract tests, 13 Rust tests, two indexer Merkle tests, ABI consistency checks, frontend typecheck/build and browser smoke checks passed. No deployment, paid task, live passkey enrollment or hosted GraphQL run was performed. Native Windows Envio code generation was blocked; full generated-type checking must still run on a supported platform.

From each indicated directory, these checks require no funded keys:

| Directory | Commands |
| --- | --- |
| `contracts` | `forge test --threads 1`; `forge fmt --check` |
| `aetheris` | `node scripts/check-interfaces.mjs` after contract artifacts/ABIs are available |
| `daemon` | `cargo fmt -- --check`; `cargo check --locked --jobs 1`; `cargo test --locked --jobs 1` |
| `indexer`, supported platform | `pnpm install --frozen-lockfile`; `pnpm codegen`; `pnpm typecheck`; `pnpm test` |
| `frontend` | `pnpm install --frozen-lockfile`; `pnpm typecheck`; `pnpm build` |

Use `--offline` for Cargo only after its dependencies are cached. On memory-constrained machines, run component builds sequentially and retain the single-job Rust commands. The Linux/macOS helper `bash scripts/verify.sh` runs the broader sequence, including dependency installation and Envio code generation; it uses two Cargo jobs and requires a supported Envio environment. There is no `scripts/verify.ps1` helper.

Read-only service smoke checks while running:

```powershell
curl.exe --include http://localhost:3000/api/overview
curl.exe --include 'http://localhost:3000/api/agents?page=0'
curl.exe --include http://127.0.0.1:8080/health
```

The overview can succeed without contract addresses; the agent endpoint requires its registry. A configured deployment with no agents/tasks should show honest empty states. Observed TPS is calculated from a short block sample; state-collision savings remain unavailable because standard RPC does not expose the required counterfactual scheduler measurements.

For an optional read-only RPC latency probe from `daemon`, set the RPC in the shell and run:

```powershell
$env:MONAD_RPC_URL = Read-Host 'RPC URL for read-only latency measurement'
python scripts/rpc_latency.py --samples 20 --concurrency 2
```

The script does not load `.env` itself. It prints success/failure counts and p50/p95 request latency. Its default 300 ms comparison is a configurable budget, not an assertion about Monad block time or achieved task latency.

## 7. Troubleshooting, persistence, and reconciliation

| Symptom | Check |
| --- | --- |
| Daemon refuses startup | Required values, chain 10143, deployed router bytecode, unique valid keys, database access, and actual facilitator support; no unsupported payment bypass exists |
| Port already in use | Keep frontend 3000, daemon 8080 and local Hasura 8081 distinct; update the corresponding advertised URL/CORS setting if you change a port |
| Health returns 503 for RPC | Provider reachability, rate limits and host network latency; health has a five-second RPC deadline |
| Health has `batchWorker: "stopped"` | Investigate finalized-tag support, canonical block continuity, committer permission, gas balance and transaction state before restarting |
| Task rejected as unauthorized | Current `ownerOf`, router `isAuthorized`, expiry, identity transfers, configured executor, signature domain and local clock |
| Task hangs or fails after submission | Read the persisted job and available transaction hashes; verify nonce/receipt state at the RPC and payment state with the provider |
| Directory has no agents | Matching registry/router deployment, registration receipt, earliest start block, IPFS URI/gateway availability; an empty fresh registry is normal |
| Visualizer misses an older task | The frontend has a bounded observation window; inspect the event's actual block or query indexed history |
| Envio reports missing agent/shard | Addresses belong to one deployment and `ENVIO_START_BLOCK` includes the original registration/creation history |
| Envio fails to load on Windows | Use Linux/macOS or repair WSL2/Docker; changing contract addresses cannot fix an unsupported native addon |
| Passkey/wallet UI unavailable | Dynamic environment ID at build time, allowed origin, HTTPS/localhost, environment authentication configuration and wallet support |

The daemon journal is part of payment correctness. It stores task identity, reserved payment credentials, signed materials, selected nonce, broadcast intent, known transaction hashes and the batch cursor. Restrict access, persist it across releases, and take a consistent backup with the daemon stopped or through a reviewed database-aware backup workflow. Do not remove it to clear an error or run another process with the same relayer keys against a different journal.

Before sending a transaction, the daemon records its nonce and calldata hash. A crash or transport failure can leave the broadcast outcome unknown; that signer then stops accepting further sends. A confirmed reverted transaction consumes its nonce and, after the required confirmations, does not permanently lock unrelated future work. Interrupted `accepted` and `settlement_pending` jobs become `reconciliation_required` on startup, with known execution results retained. HTTP client disconnection alone does not cancel the spawned task.

There is **no recovery CLI or journal-editing API** in this repository. An operator must preserve the database and correlate the original request ID, relayer address/nonce, any known transaction receipts and the payment provider's records. An unknown transaction may already have been accepted; a settlement timeout may already have charged the payer. Resolve those external facts before implementing and reviewing a targeted recovery procedure. Do not blindly resubmit, issue a new voucher, reuse a nonce, or edit/delete journal rows.

The enabled batch worker stops on an unsupported finality query or canonical-history inconsistency. Restart only after investigating the cause; its durable cursor is not automatically discarded. A finalized reorganization can conflict with immutable on-chain batch commitments and requires explicit reconciliation. Indexer rollback handles its own derived entities, but cannot undo a submitted payment or immutable router commitment.

For a hosted deployment, put the daemon behind TLS with rate limits and proxy timeouts suitable for confirmed transactions, use persistent storage, and keep relayer keys exclusive. Configure private provider credentials only in server-side settings. Detailed trust assumptions and incomplete external integrations are recorded in [architecture.md](architecture.md) and [submission-readiness.md](submission-readiness.md).
