# Aetheris

An ERC-8004 agent registry, isolated task-result storage, and asynchronous settlement engine for Monad Testnet (chain **10143**).

Aetheris gives an AI agent a discoverable on-chain identity, gives each task its own result-storage contract, and records task outcomes that other applications can inspect. A Rust service routes signed, paid requests to those contracts. An indexer reconstructs the event history, while a developer dashboard shows agents, recent tasks, and observed network activity.

The problem it addresses is shared mutable state: if every agent updates the same result storage, otherwise independent tasks can contend for the same state. Aetheris uses deterministic CREATE2 deployments to give each task its own storage address. The implemented guarantee is storage isolation for task completion; the project does not establish a network-wide guarantee of collision-free or single-pass execution.

The supplied project brief targets **Monad Metropolis, Track 04: Trust, Identity & AI Infrastructure**. This is the intended submission context; organizer requirements and deadlines have not been supplied or verified.

## Documentation

| Read this | For |
| --- | --- |
| This README | Project purpose, implemented features, current status, and where to start. |
| [Architecture](docs/architecture.md) | System and sequence diagrams, component responsibilities, data flow, authorization, storage isolation, and trust boundaries. |
| [Runbook](docs/runbook.md) | Prerequisites, a quick dashboard preview, full-stack configuration, deployment, service startup, verification, and troubleshooting. |
| [Submission readiness](docs/submission-readiness.md) | What is done, what remains, acceptance criteria, demonstration steps, and submission deliverables. |
| [Shared protocol](docs/protocol.md) | Exact salt, Merkle leaf, batch ID, ordering, and signature conventions. |
| [Verification record](VERIFICATION.md) | Results actually observed in this workspace and checks still outstanding. |

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

## Example lifecycle

1. An owner publishes an Agent Card to IPFS, registers an identity, and delegates routing access to a funded executor.
2. An agent or client performs work off chain and signs the task request, including input, output, and proof commitments.
3. The daemon verifies authorization and payment credentials, reserves the request in its journal, creates a shard, and records the result on chain.
4. The daemon waits for receipts and settles the payment through the configured provider. Its optional batch worker later commits a root for finalized task logs.
5. Envio independently indexes the events and checks batch commitments. The dashboard displays recent on-chain activity through RPC.
6. Clients and validators can separately submit reputation feedback or validate an output. Task completion alone does not automatically invoke those registries.

## Current status

As recorded on **2026-10-02**, the project has implemented components and passing local checks: **22 Solidity tests, 13 Rust tests, 2 indexer Merkle tests, 27 matching interface declarations, and a passing frontend typecheck, production build, and desktop/mobile browser smoke check**.

It is not yet an end-to-end demonstrated submission. No contracts have been deployed from this workspace and no paid task has been run through the complete stack. Envio code generation and generated-type validation remain blocked locally by the unavailable Windows addon and a WSL startup failure. Dynamic passkeys, payment settlement, hosted indexing, and trusted TEE validation need their actual external configuration and integration checks.

The next milestone is one reproducible testnet demonstration: registered agent, working delegation, real signed paid task, confirmed shard result, matching indexed batch commitment, and dashboard evidence. The [submission checklist](docs/submission-readiness.md) breaks this into concrete completion criteria.

## Repository layout

```
contracts/   Solidity 0.8.24, OpenZeppelin, Foundry tests and deployment
daemon/      Rust / Tokio / Axum, signed task routing, HTTP 402, batch commits
indexer/     Envio HyperIndex, GraphQL entities, per-block Merkle commitments
frontend/    Next.js 14, Dynamic wallet authentication, agent directory and visualizer
docs/        Protocol encoding and operational assumptions
scripts/     ABI consistency checks and local verification helpers
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

JavaScript and Rust dependencies have lockfiles; Solidity dependencies are pinned to commits by the installation scripts. Each component has an environment template. Read the [runbook](docs/runbook.md) for complete commands and each component's README for its API details. Secrets belong in ignored `.env` files, never frontend `NEXT_PUBLIC_*` variables.

## Run the system

1. Deploy the contracts using `contracts/script/Deploy.s.sol` and the contracts README. Save the four addresses and the earliest deployment block. This repository does not contain deployed addresses or a funded private key.
2. Register an agent with an IPFS Agent Card. A card carries the ERC-8004 registration type, agent description, MCP service endpoint, and capabilities; the registry stores its URI.
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

See [protocol.md](docs/protocol.md) for the shared byte encoding.

See [VERIFICATION.md](VERIFICATION.md) for the commands run and the limits of local validation.