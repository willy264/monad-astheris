<img src="frontend/public/brand/aetheris-icon-512.png" width="88" height="88" alt="Aetheris logo">

# Aetheris

**Express checkout lanes for AI-agent tasks on Monad.**

## 1. Executive summary & the problem — a 30-second read

AI agents need to identify themselves, pay for services and leave a record of their work. When many tasks update the same blockchain records, they can compete for shared state: a **blockchain traffic jam**.

Aetheris gives every task its own **Express Checkout Lane**: a separate contract that stores that task's result. Agent identities make the work discoverable, signed requests control who can act, and compact receipts make recorded results easy to inspect.

The goal is to support many agents working concurrently on Monad. Today, tests demonstrate isolated task storage; they do not establish thousands of simultaneous agents or zero speed bottlenecks. Shared accounts, deployment and payment infrastructure still matter.

**Live status, October 4, 2026:** all four core contracts are deployed and receipt-verified on Monad Testnet. **Aetheris Monad Observer, agent #1**, has a registered IPFS profile and a working public MCP service. Paid task execution, settlement and hosted indexing still need their own live evidence. See the [deployment manifest](contracts/deployments/10143.json), [agent registration](contracts/deployments/10143.agent.json), [verification record](VERIFICATION.md) and [submission evidence](SUBMISSION_PROOF.md). Intended track: Monad Metropolis Track 04, Trust, Identity & AI Infrastructure.

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

The deployed [Monad Observer MCP service](frontend/docs/mcp-agent.md) exposes `get_monad_block` at `https://monad-astheris.vercel.app/api/mcp`. It returns actual Monad Testnet block metadata. This read-only service performs no AI inference or paid settlement; its registration and MCP verification are recorded in [SUBMISSION_PROOF.md](SUBMISSION_PROOF.md).

## 4. Market impact & why Monad?

Monad's developer documentation describes an EVM-compatible network with parallel execution. Its execution engine checks dependencies and re-executes transactions when earlier writes invalidate their inputs. Applications can make better use of that design by keeping independent work independent. [Monad overview](https://docs.monad.xyz/introduction/monad-for-developers), [parallel execution](https://docs.monad.xyz/monad-arch/execution/parallel-execution).

Aetheris applies that idea to task-result storage while keeping Solidity, Ethereum wallets and familiar transaction tools. That architecture motivates this design; it is not an Aetheris benchmark or a guaranteed task completion time.

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

Historical feature checks include **38 Solidity tests**, **17 Rust tests**, **17 scripts tests**, **18 frontend feature tests**, and **61 ABI declarations**. Linux Envio generation/typechecking and **2 Merkle tests** passed. The subsequent live-service changes added **15 MCP tests**, **6 RPC pagination tests** and **10 IPFS card tests**. These belong to the dated revisions in [VERIFICATION.md](VERIFICATION.md); they are not a claim that all checks have already passed together on the final integration commit. Browser and deployment evidence is recorded separately from tests.

### Deployment manifest and explorer

Target network: **Monad Testnet — chain ID `10143`**. [Network information](https://docs.monad.xyz/developer-essentials/testnet) · [Monadscan testnet explorer](https://testnet.monadscan.com).

**Four contracts are deployed and receipt-verified.** The [live manifest](contracts/deployments/10143.json) was verified on October 4, 2026 and records earliest deployment block **67,972,561**. The links below identify the actual contracts and their deployment transactions. Agent #1 is registered; a paid task is still outstanding.

| Contract | What a reviewer will inspect | Live address / explorer receipt |
| --- | --- | --- |
| [AgentRegistry](contracts/src/AgentRegistry.sol) | Agent ownership and the IPFS profile URI. | [0x754d7f2fd55a9841dbff248f9cb91d497116f231](https://testnet.monadscan.com/address/0x754d7f2fd55a9841dbff248f9cb91d497116f231) · [deployment](https://testnet.monadscan.com/tx/0x9a30b9b3d8ce9efc2854c6015faf322adcbfb6befdb3a40a9633248c20c55924) |
| [ReputationRegistry](contracts/src/ReputationRegistry.sol) | Completion records and client feedback. | [0x8f1fe9beef6df891189355129bf48f073d9ab322](https://testnet.monadscan.com/address/0x8f1fe9beef6df891189355129bf48f073d9ab322) · [deployment](https://testnet.monadscan.com/tx/0xd33a1d00bbcff1a71520478a03843aa718e80f90fccf9855527e5ed4441992d3) |
| [ValidationRegistry](contracts/src/ValidationRegistry.sol) | Explicit validation requests and authenticated responses. | [0xcd0cf354acd2c79145caeac7d4f0639f8957308d](https://testnet.monadscan.com/address/0xcd0cf354acd2c79145caeac7d4f0639f8957308d) · [deployment](https://testnet.monadscan.com/tx/0x4e57487e9c8e249f83dc9ea294fa29c4d13de0b98177654d125900706c8b02d0) |
| [AetherisRouter](contracts/src/AetherisRouter.sol) | Registry links, permissions, CREATE2 shards and batch commitments. | [0xac4a33521b32122c9f014eac8800144dd9aa5ebe](https://testnet.monadscan.com/address/0xac4a33521b32122c9f014eac8800144dd9aa5ebe) · [deployment](https://testnet.monadscan.com/tx/0xabc10b999bf0114783274620a1f3bdb03cdc8d828d56c078ac9403780863a69a) |

The [deployment finalizer](scripts/finalize-deployment.ts) checked successful canonical receipts, deployed code, constructor inputs, registry/router links and configured roles before writing the live manifest. It contains addresses, deployment transactions, earliest block and compiler settings. These checks are distinct from explorer source-code verification. Preserve the existing deployment and its receipts; do not redeploy to resume setup. The [live workflow](docs/live-submission.md) explains how to reuse this deployment and the registered observer for paid-task and indexing verification. [SUBMISSION_PROOF.md](SUBMISSION_PROOF.md) preserves the actual registration transaction, IPFS card and live MCP output alongside the remaining gaps.

Agent #1 uses `ipfs://bafkreibo5gtw45fi27ykfsbubt7uo6vze3s4x44ytqf735ojnnhhylpuea`; its [registration transaction](https://testnet.monadscan.com/tx/0xc9bbd6e8a390f4fb1788f3d305f241293ec919b49d35238c7aeda5c829f3a716) is confirmed at block **68105690**. Reuse that identity for its advertised observer capability. Register another identity only when you intend to create a distinct agent. The [scripts guide](scripts/README.md) covers registration, MCP verification and paid task submission.

The Rust task route is **`POST /v1/tasks`**; the singular `/v1/task` is not implemented. See the [protocol and API reference](docs/protocol.md) for JSON examples, field descriptions, signatures, payment headers and recovery behavior.

| Next document | Reader's question |
| --- | --- |
| [Architecture](docs/architecture.md) | Which component does what, and where does trust enter? |
| [Protocol & daemon API](docs/protocol.md) | What exactly must a client sign and send? |
| [Frontend guide](frontend/docs/README.md) | What should a judge click, and which numbers are real? |
| [Logo and brand assets](frontend/docs/brand.md) | Where can I download the logo PNG, editable SVG and icons? |
| [Operator runbook](docs/runbook.md) | How do I configure and run every component? |
| [Submission checklist](docs/submission-readiness.md) | What remains before the project is ready to submit? |

The integration combines the feature stack with the deployed observer and production reliability fixes. Point reviewers at the exact reviewed commit and its verification record. The next live milestone is an authorized paid MCP task, confirmed shard and token-payment receipts, a matching indexed Merkle batch, and dashboard evidence. Actual device authentication, wallet-signed delegation and any advertised CRE/TEE result need their own checks. Confirm the organizer's deadline, access and submission requirements before publishing the final package.
