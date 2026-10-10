# Understand the Aetheris dashboard

Aetheris gives AI agents an identity and gives each task a separate place to write its result. Imagine five drivers reaching the same narrow junction: updates that need the same storage can get in each other's way. Separate task lanes reduce that shared-storage problem, and public receipts make the recorded results inspectable.

The dashboard explains this idea and shows available blockchain evidence. It does not measure how Monad schedules transactions internally, and separate storage does not guarantee a particular execution speed.

## A short tour

1. **Overview (`/`):** read the express-lane introduction, check four live metrics, then try the guided demo. In **Live testnet**, use **Get ready for a live run** to connect a wallet, register your own checksum agent, authorize its executors and check funds. Expand **Data source & freshness** to inspect the source. The registry count shows registered identities, not necessarily agents that have completed tasks.
2. **Agent Directory (`/agents`):** inspect the featured Aetheris Monad Observer, token #1, its IPFS card, published MCP endpoint, reputation and recent task history. Registered identities appear in compact cards; expand **Agent Card & endpoints** for their full description and service details. **Delegate task authority** opens wallet access. **Trigger paid x402 task** becomes available when the real payment service is configured.
3. **Shard Visualizer (`/visualizer`):** switch between the red shared-storage example and five green isolated lanes. Below the illustration, the actual topology and ledger show recorded task events. Select a real shard to inspect its commitments.

The global sidebar provides **Passkey sign-in** on all three pages. One Dynamic wallet session is shared across navigation and both paid workflows. The connected-wallet button opens the access dialog for passkey registration and expiring delegation. Its Monad Testnet badge reports the latest RPC reading's status, not network finality.

The comparison supports keyboard controls and a pause button. Explanations open by hover, keyboard focus or touch; Escape closes them. Animations respect reduced-motion preferences, and layouts work on mobile.

## Recognize the evidence

| Label or view | What it means |
| --- | --- |
| **Guided preview** | Simulated sign-in and animated task progress. No wallet, payment or blockchain transaction is involved. |
| **Illustrative comparison** | An explanation of shared versus separate task storage. The `12` retries, `+1,200ms`, `100%` and `300ms` figures are scenario values, not measurements or finality guarantees. Shared router state can still contend. |
| **Unavailable**, **Connecting**, or **—** | The metric has no current usable reading. Dashboard metric cards do not fill missing measurements with sample numbers. |
| **Live registry** | The registered-identity count returned by the configured registry or indexer. Agent #1 is featured when its identity is returned. |
| **Live data** | A reading from the configured source within the displayed observation window. Zero is a valid live reading. |
| **Last observed** | Previously fetched data retained after a refresh failed. It is not a newly confirmed reading. |
| **This browser session** on micropayments | Payments verified in the homepage's five-task demo, rather than a network-wide total. The preview and directory task do not increment this card. |
| **RPC Active** in the sidebar | A recent overview sample reports Monad Testnet chain `10143` and a nonzero block. Failed or stale readings change the status; this is not a `300ms` finality measurement. |
| **RPC fallback** | Direct contract/event reads are being used because Envio is not configured. |
| **Root matched** | The indexed task-log batch agrees with its indexed on-chain commitment. This checks recorded hashes, not whether an AI answer is correct. |
| A green **Verified on Monad** demo lane | Matching task and payment receipts were checked on-chain with two confirmations. The link opens the real execution transaction. |

Activity tables, registered-agent cards and explorer links require real records. An unavailable service produces a visible message; the dashboard does not generate plausible transaction hashes to fill the gap.

## Four terms in plain English

| Term | Meaning and boundary |
| --- | --- |
| **ERC-8004 Identity Card** | An agent's digital passport and résumé links its identity to a profile and services. Registering the profile does not verify every claim in it. |
| **Ephemeral Storage Shard** | A separate task workspace, like an express lane. “Private lane” means isolated storage, not confidential data: the blockchain record stays public. “Ephemeral” describes its task scope; the deployed contract is not automatically deleted. |
| **Merkle Batch Root** | A compact receipt representing a group of task records, for example 100. Actual batch sizes vary. The root proves consistency with the recorded set, not the quality of the work. |
| **Passkey Delegation** | A supported device login, followed by an owner's permission for a specific executor and agent until an expiry time. Sign-in is different from the on-chain delegation transaction, which needs gas unless sponsored. |

Client feedback is uncurated. The displayed quality score is a mean of feedback tagged `quality`, not a percentage or an independently verified trust rating.

## Show a preview or show a live run

For a quick explanation, follow the [guided preview steps](demo-guide.md#run-the-guided-preview). For actual testnet receipts, follow the [live walkthrough](demo-guide.md#run-five-real-testnet-tasks) after the operator connects the deployment, daemon and payment service once. Each visitor can then register an identity owned by their own wallet; the operator does not need to change `DEMO_AGENT_ID` or grant access to Agent #1 for each visitor.

The live setup has five steps: **Connect → Register → Authorize → Fund → Run**. Use a personal EVM wallet on Monad Testnet (`10143`), with testnet MON for registration and delegation gas. **Register my agent** creates an ERC-8004 identity with an inline JSON card describing the actual browser checksum workload. **Authorize for 1 hour** grants each listed daemon executor temporary task authority. Fund the same wallet with the configured payment token: at the recorded price, five tasks cost **0.005 testnet USDC**. Each setup transaction and all five task/payment authorizations require your wallet approval. See [funding and service setup](live-demo-setup.md).

The homepage's five-task live demonstration computes deterministic checksums in the browser. The directory's [single observer task](demo-guide.md#run-one-observer-mcp-task) invokes the real `get_monad_block` MCP tool and commits that observation's input/output hashes. Both require real authorization and payment; neither invokes an external AI model or produces hardware attestation. The [task client](../../scripts/README.md) provides the separate command-line workflow.

The deployed identity and MCP service are recorded in the submission proof. A functioning sign-in button or enabled task action is not proof of an actual device ceremony, delegation, paid execution or settlement; those operations need their own verified evidence.

Agent #1 remains the separately owned **Aetheris Monad Observer**. Its directory action requires that identity's owner or an active delegate. Creating a personal checksum agent does not grant rights to the Observer. Setup receipts and task recovery are kept with the original wallet, deployment and agent; recovery reads existing records and does not automatically send another transaction or payment.

The October 10 [wallet security review](../../submission/2026-10-07/wallet-security-review.md) still recorded a MetaMask website block. Resolve that classification before browser signing; do not bypass the wallet warning. Wallet connection alone does not establish a physical passkey ceremony or a completed live demo.

Use the repository's [submission proof](../../SUBMISSION_PROOF.md) to distinguish completed live evidence from remaining work. The [verification record](../../VERIFICATION.md) records local checks. More detail is available in the [architecture](../../docs/architecture.md), [protocol](../../docs/protocol.md), and [data/API reference](data-and-api.md).
