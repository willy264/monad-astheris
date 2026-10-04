<img src="frontend/public/brand/aetheris-icon-512.png" width="88" height="88" alt="Aetheris logo">

# Aetheris

**Express checkout lanes for AI-agent tasks on Monad.**

## 1. Executive summary & the problem — a 30-second read

AI agents need to identify themselves, pay for services and leave a record of their work. When many tasks update the same blockchain records, they can compete for shared state: a **blockchain traffic jam**.

Aetheris gives every task its own **Express Checkout Lane**: a separate contract that stores that task's result. Agent identities make the work discoverable, signed requests control who can act, and compact receipts make recorded results easy to inspect.

The goal is to support many agents working concurrently on Monad. Today, tests demonstrate isolated task storage; they do not establish thousands of simultaneous agents or zero speed bottlenecks. Shared accounts, deployment and payment infrastructure still matter.

**Status:** locally tested prototype; live testnet deployment and a paid end-to-end demonstration remain outstanding. See the [verification record](VERIFICATION.md) and [submission evidence](SUBMISSION_PROOF.md). Intended track: Monad Metropolis Track 04, Trust, Identity & AI Infrastructure.

## 2. Plain-English glossary

| Technical term | Judge-friendly shorthand | What it means in Aetheris |
| --- | --- | --- |
| ERC-8004 | **“Verified AI Passport”** | A registered identity linking an owner and an agent profile. Ownership is checkable; registration alone does not verify the agent's résumé or output quality. |
| Ephemeral Shard | **“Private Express Checkout Lane”** | A separate result-storage contract for one task. “Private” means dedicated to that task; its blockchain data remains public. The record persists after completion. |
| State Contention | **“Blockchain Traffic Jam”** | Transactions depend on shared changing state, so some work must wait or be repeated. |
| Merkle Batch | **“Compressed Digital Receipt”** | A root hash representing a group of task records. Batch size varies; matching the receipt establishes data consistency, not whether the research is correct. |
| Passkey Delegation | **“1-Tap Face ID Sign-In”** | A supported device passkey opens wallet access. Granting an executor permission is a separate, expiring on-chain action; signing and gas requirements still apply. |

[ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) is a draft standard for identity, reputation and validation. Aetheris adds task isolation and paid routing around those registries.

## 3. How it works — a three-step story

Imagine a research agent checking **ten documents** for a client. Ten is an example workload, not a recorded performance result.

1. **Sign in and choose the spend.** The owner accesses a supported wallet with Face ID or Touch ID and grants an executor time-limited permission. The client checks a per-task price ceiling and approves each payment. Login, delegation and payment approval are separate actions; an autonomous cumulative micro-budget is a future product feature.
2. **Give each task its own lane.** The agent computes its answers off chain. The client submits signed requests, and the daemon creates separate storage contracts for their input/output fingerprints. Requests can arrive concurrently; completing one task does not write another task's result storage. This removes that shared-result dependency while preserving the network's transaction ordering.
3. **Collect receipts and review the work.** The background worker groups completed task logs into Merkle receipts, one per nonempty finalized block. Payments settle through the configured provider. The MCP client then records completion and can publish an independent client's explicit assessment; it never turns execution success into an automatic positive review. A single daily update is not the current batching schedule.

**Try the story:** the [dashboard guide](frontend/docs/README.md) explains the labeled visual preview. Its configured live mode submits **five browser checksum tasks**. For real research or other agent work, the [MCP client](scripts/README.md) calls an actual service before signing a task. The daemon records authorized commitments; it does not run the AI model.

## 4. Market impact & why Monad?

Monad's developer documentation describes an EVM-compatible network with approximately **10,000 TPS**. Its parallel execution engine checks dependencies and re-executes transactions when earlier writes invalidate their inputs. Applications can make better use of that design by keeping independent work independent. [Monad overview](https://docs.monad.xyz/introduction/monad-for-developers), [parallel execution](https://docs.monad.xyz/monad-arch/execution/parallel-execution).

Aetheris applies that idea to task-result storage while keeping Solidity, Ethereum wallets and familiar transaction tools. The network's published throughput is context for this design; it is not an Aetheris benchmark or a guaranteed task completion time.

| Intended market | Example job | What Aetheris contributes |
| --- | --- | --- |
| Multi-agent micropayments | One agent buys a small service from another. | Signed work requests, payment-provider integration and checkable execution receipts. |
| Autonomous data collection | Agents collect and summarize permitted public data. | Discoverable service identities and separate records for each task's result. |
| Automated financial research | Agents compare documents, prices or reports for a human reviewer. | Traceable input/output commitments and a separate feedback/validation trail. |

These are target use cases. Customer adoption, market size and commercial performance have not been measured in this repository. The immediate milestone is a reproducible paid testnet workflow with matching on-chain, indexer and dashboard evidence.

## 5. Technical installation & testnet explorer links

### Start the dashboard

Use **Node 24+** and **pnpm 10.32.1**. Each component has its own package/configuration; there is no root pnpm workspace installation.

```sh
# From the repository root
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`. The guided preview requires no wallet. Read-only network data uses the configured RPC; sample metric cards and simulated lanes are explicitly labeled. Copy `frontend/.env.example` to `.env.local` and follow the [frontend setup guide](frontend/README.md) to enable actual contract reads, Envio and paid tasks.

### Run local checks

Install Foundry and a Rust toolchain; Rust 1.94 was used for the recorded checks. On a fresh checkout, first restore pinned Solidity dependencies from `contracts` with `bash script/install-deps.sh` on Linux/macOS or `./script/install-deps.ps1` in PowerShell.

```sh
# From the repository root
cd contracts
forge test
cd ../daemon
cargo check --locked
cargo test --locked
cd ../frontend
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

Recorded results: **38 Solidity tests**, **17 scripts tests**, **18 frontend tests**, **40 browser checks**, **61 ABI declarations**, and successful Rust compilation. The **13 Rust tests** passed on 2026-10-02; Rust compilation was rerun on 2026-10-03. Envio generation, typechecking and **2 Merkle tests** passed on Linux. These are prior observed results, detailed in [VERIFICATION.md](VERIFICATION.md).

### Deployment manifest and explorer

Target network: **Monad Testnet — chain ID `10143`**. [Network information](https://docs.monad.xyz/developer-essentials/testnet) · [Monadscan testnet explorer](https://testnet.monadscan.com).

**No receipt-verified deployment is recorded yet.** The table below names the contracts to deploy; no live contract address or transaction link is available.

| Contract | What a reviewer will inspect | Live address / explorer receipt |
| --- | --- | --- |
| [AgentRegistry](contracts/src/AgentRegistry.sol) | Agent ownership and the IPFS profile URI. | Pending deployment |
| [ReputationRegistry](contracts/src/ReputationRegistry.sol) | Completion records and client feedback. | Pending deployment |
| [ValidationRegistry](contracts/src/ValidationRegistry.sol) | Explicit validation requests and authenticated responses. | Pending deployment |
| [AetherisRouter](contracts/src/AetherisRouter.sol) | Registry links, permissions, CREATE2 shards and batch commitments. | Pending deployment |

After broadcast, the [deployment finalizer](scripts/finalize-deployment.ts) writes `contracts/deployments/10143.json` only after checking successful receipts, code, constructor inputs and contract linkages. It records addresses, deployment transactions, earliest block and compiler settings. A dry-run `10143.candidate.json` is not that live manifest. The [live workflow](docs/live-submission.md) explains deployment, registration and evidence collection; [SUBMISSION_PROOF.md](SUBMISSION_PROOF.md) records which evidence is still missing.

The Rust task route is **`POST /v1/tasks`**. See the [protocol and API reference](docs/protocol.md) for JSON examples, field descriptions, signatures, payment headers and recovery behavior.

| Next document | Reader's question |
| --- | --- |
| [Architecture](docs/architecture.md) | Which component does what, and where does trust enter? |
| [Protocol & daemon API](docs/protocol.md) | What exactly must a client sign and send? |
| [Frontend guide](frontend/docs/README.md) | What should a judge click, and which numbers are real? |
| [Logo and brand assets](frontend/docs/brand.md) | Where can I download the logo PNG, editable SVG and icons? |
| [Operator runbook](docs/runbook.md) | How do I configure and run every component? |
| [Submission checklist](docs/submission-readiness.md) | What remains before the project is ready to submit? |

The complete implementation currently spans staged feature branches. Point reviewers at the full submission branch/commit; `main` intentionally has not received the entire stack. Confirm the organizer's actual deadline, access and submission requirements before publishing the final package.
