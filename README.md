# Aetheris

An ERC-8004 agent registry, isolated task-result storage, and asynchronous settlement engine for Monad Testnet (chain **10143**).

Aetheris gives an AI agent a discoverable on-chain identity, gives each task its own result-storage contract, and records task outcomes that other applications can inspect. A Rust service routes signed, paid requests to those contracts. An indexer reconstructs the event history, while a developer dashboard shows agents, recent tasks, and observed network activity.

The problem it addresses is shared mutable state: if every agent updates the same result storage, otherwise independent tasks can contend for the same state. Aetheris uses deterministic CREATE2 deployments to give each task its own storage address. The implemented guarantee is storage isolation for task completion; the project does not establish a network-wide guarantee of collision-free or single-pass execution.

The supplied project brief targets **Monad Metropolis, Track 04: Trust, Identity & AI Infrastructure**. This is the intended submission context; organizer requirements and deadlines have not been supplied or verified.

## Documentation

| Read this | For |
| --- | --- |
| This README | Project purpose, implemented features, current status, and where to start. |
| [Live verification and remaining work](SUBMISSION_PROOF.md) | Actual testnet contracts, registered agent, MCP checks, and the remaining submission gaps. |
| [Agent registration](scripts/README.md) | Prepare an Agent Card, verify its MCP service, pin it to IPFS, and register its identity. |
| [Contracts](contracts/README.md) / [Daemon](daemon/README.md) | On-chain components, deployment, task authorization, payment, and service configuration. |
| [Frontend](frontend/README.md) / [Indexer](indexer/README.md) | Dashboard startup, wallet configuration, indexing, and component checks. |
| [MCP observer](frontend/docs/mcp-agent.md) | The deployed read-only Monad block tool, its input/output, and verification commands. |

## What is implemented

| Capability | Implementation |
| --- | --- |
| Agent identity and discovery | ERC-721 agent IDs linked to IPFS Agent Cards with capabilities and MCP service endpoints. |
| Task authorization | Agent ownership and expiring router delegation, plus signed daemon requests bound to the chain, router, task, inputs, and outputs. |
| Isolated task results | A CREATE2 shard per task attempt, immutable inputs, and a write-once output/proof commitment. |
| Payment handling | HTTP 402 challenges, x402 facilitator integration, and Graph Tally receipt verification with an external settlement adapter. |
| Durable routing | Concurrent relayers, per-signer nonce coordination, persistent replay protection, and conservative handling of ambiguous broadcasts. |
| Batch commitments | Canonically ordered task logs combined into Merkle roots and committed to the router by an authorized publisher. |
| Reputation and validation | Feedback, completion records, output-hash checks, and signed statements from explicitly trusted attestation verifiers. These are separate workflows. |
| Indexing | Envio entities for identities, shards, executions, and batches, with independently calculated roots and commitment comparisons. |
| Dashboard | Overview, agent directory, execution visualizer, Dynamic authentication, and delegation/revocation controls. |

The daemon accepts authorized output hashes; it does not run an AI model or invoke MCP tools to produce those outputs. A real agent/client must supply that computation. The frontend currently reads contracts and logs through its own Next.js API and Monad RPC. It does not yet use Envio GraphQL or provide a signed, paid task-submission interface.

The deployed [Monad Observer MCP service](frontend/docs/mcp-agent.md) supplies real block metadata to agent workflows. Its `get_monad_block` tool is read-only; it performs no AI inference or paid settlement.

## Example lifecycle

1. An owner publishes an Agent Card to IPFS, registers an identity, and delegates routing access to a funded executor.
2. An agent or client performs work off chain and signs the task request, including input, output, and proof commitments.
3. The daemon verifies authorization and payment credentials, reserves the request in its journal, creates a shard, and records the result on chain.
4. The daemon waits for receipts and settles the payment through the configured provider. Its optional batch worker later commits a root for finalized task logs.
5. Envio independently indexes the events and checks batch commitments. The dashboard displays recent on-chain activity through RPC.
6. Clients and validators can separately submit reputation feedback or validate an output. Task completion alone does not automatically invoke those registries.

## Current status

As recorded on **2026-10-02**, the project has implemented components and passing local checks: **22 Solidity tests, 13 Rust tests, 2 indexer Merkle tests, 27 matching interface declarations, and a passing frontend typecheck, production build, and desktop/mobile browser smoke check**.

On **2026-10-04**, all four contracts have receipt-verified Monad Testnet deployments in the [live manifest](contracts/deployments/10143.json). **Aetheris Monad Observer, agent #1**, is registered with an IPFS card and a working public MCP service. The [registration evidence](contracts/deployments/10143.agent.json) records its owner, URI, confirmed transaction and block; [SUBMISSION_PROOF.md](SUBMISSION_PROOF.md) links the public evidence.

The full paid-task demonstration remains outstanding: working delegation, an EIP-712 signed paid request, a confirmed shard result, payment settlement, and matching indexed batch evidence. Hosted Envio output and trusted TEE/CRE verification have not been demonstrated. Dynamic passkeys are enabled, but an actual device authentication and wallet-signed delegation still require verification. See the remaining work in [SUBMISSION_PROOF.md](SUBMISSION_PROOF.md).

## Repository layout

```
contracts/   Solidity 0.8.24, OpenZeppelin, Foundry tests and deployment
daemon/      Rust / Tokio / Axum, signed task routing, HTTP 402, batch commits
indexer/     Envio HyperIndex, GraphQL entities, per-block Merkle commitments
frontend/    Next.js 14, Dynamic wallet authentication, agent directory and visualizer
scripts/     Agent registration, live MCP verification, ABI checks and verification helpers
```

## Local verification

Prerequisites: Foundry, Rust 1.94 or newer, Node.js 22 or newer, pnpm 10. Envio 3.12.1 requires Linux/macOS (use WSL2 on Windows); its local database stack also requires Docker. On this Windows workspace a checksum-verified Foundry installation is available in `.tools/foundry/`.

```powershell
# From aetheris/; omit this line if forge is already on PATH.
$env:Path = "$PWD\.tools\foundry;$env:Path"
cd contracts
forge test
cd ../daemon
cargo check
cargo test
cd ../frontend
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
```

In Linux, macOS, or a Node-enabled WSL2 shell, run the indexer checks with `cd indexer && pnpm install --frozen-lockfile && pnpm codegen && pnpm typecheck && pnpm test`. The complete Linux/macOS verification sequence is in `scripts/verify.sh`.

JavaScript and Rust dependencies have lockfiles; Solidity dependencies are pinned to commits by the installation scripts. Each component has an environment template and README with its commands and API details. Secrets belong in ignored `.env` files, never frontend `NEXT_PUBLIC_*` variables.

## Run the system

1. Use the existing Monad Testnet addresses and earliest block in [contracts/deployments/10143.json](contracts/deployments/10143.json). For a separate deployment, follow the contracts README and retain its receipts. Private keys are never committed.
2. Agent #1 already identifies the live observer service. For another identity, follow the [registration commands](scripts/README.md): prepare its truthful IPFS Agent Card, verify the MCP endpoint, pin the card, and call `register(string)` with its URI.
3. Authorize each daemon relayer for that agent with `AetherisRouter.setDelegate(agentId, relayer, expiresAt)`. The dashboard provides this action. Grant the batch sender the router's committer role if batch submission is enabled.
4. Configure and start the daemon. It checks RPC chain identity and deployed router bytecode at startup. Task callers sign the domain-separated task authorization described in `daemon/README.md` and supply payment credentials for the configured payment mode.
5. Set the same addresses and deployment block in the indexer, then run `pnpm codegen` and `pnpm dev`, or connect the project to Envio Cloud. Its local GraphQL service uses port 8081, leaving 8080 for the daemon.
6. Configure the frontend's contract addresses and Dynamic environment ID, enable passkeys in the Dynamic project, and run `pnpm dev`. The dashboard reports unavailable data until the corresponding service/deployment is configured.

## Guarantees and trust boundaries

Each task gets a deterministic CREATE2 contract containing immutable inputs and a write-once result. Executing a task modifies its shard, without updating shared router counters. Tests demonstrate distinct task addresses, non-overlapping storage writes, rejection of repeated execution, and authorization rules. They do **not** measure Monad's scheduler or prove zero transaction re-executions. Factory deployment, signer nonces, and other shared account accesses can still contend.

"Ephemeral" describes the task's active lifetime. Shards remain available as an audit trail; no SELFDESTRUCT-based cleanup is claimed. `TaskExecuted` records an authorized output commitment, not evidence that arbitrary agent computation was correct. Validation is a separate registry workflow.

TEE verification authenticates signed statements from explicitly trusted attestation verifiers and approved measurements. Vendor-specific Intel/AMD/Nitro quote and certificate-chain validation belongs to those verifiers. Merkle committers attest that a root represents canonical logs; the indexer independently recomputes and compares it. A committed root is not a consensus-verified execution proof.

Dynamic provides wallet/passkey authentication through project configuration. Router delegation is a separate, expiring on-chain permission; it does not export the user's passkey or delegate ERC-721 transfers. Category Labs threshold encryption and a Privy fallback are not integrated: the supplied specification provides no encryption gateway/key protocol, and the primary requested authentication stack is Dynamic. No fabricated encryption or fallback endpoint is shipped.

Payment, persistence, retry, and reorganization behavior are documented in the daemon README. These components require configured providers and security review before handling real funds. Build success is not a security audit or a live-network performance result.

## Protocol sources

- [ERC-8004 registry specification](https://eips.ethereum.org/EIPS/eip-8004)
- [Monad Testnet network information](https://docs.monad.xyz/developer-essentials/testnet)
- [Envio event handlers](https://docs.envio.dev/docs/HyperIndex/event-handlers)
- [Dynamic documentation](https://www.dynamic.xyz/docs)
- [x402 specification](https://github.com/coinbase/x402)

See the [daemon README](daemon/README.md) for task authorization and shared byte encoding.

See [SUBMISSION_PROOF.md](SUBMISSION_PROOF.md) for live evidence and the limits of verification.
