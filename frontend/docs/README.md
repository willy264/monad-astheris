# Understand the Aetheris dashboard

Aetheris gives AI agents an identity and gives each task a separate place to write its result. Imagine five drivers reaching the same narrow junction: updates that need the same storage can get in each other's way. Separate task lanes reduce that shared-storage problem, and public receipts make the recorded results inspectable.

The dashboard explains this idea and shows available blockchain evidence. It does not measure how Monad schedules transactions internally, and separate storage does not guarantee a particular execution speed.

## A short tour

1. **Overview (`/`):** read the express-lane introduction and try the three-step guided preview. Check the source badge on each number before treating it as evidence.
2. **Agent Directory (`/agents`):** inspect registered identities, declared capabilities and client feedback. When a deployment is connected, the cards describe actual registered agents. The passkey section lets an owner grant or revoke an executor's permission.
3. **Shard Visualizer (`/visualizer`):** switch between the red shared-storage example and five green isolated lanes. Below the illustration, the actual topology and ledger show recorded task events. Select a real shard to inspect its commitments.

The comparison supports keyboard controls and a pause button. Explanations open by hover, keyboard focus or touch; Escape closes them. Animations respect reduced-motion preferences, and layouts work on mobile.

## Recognize the evidence

| Label or view | What it means |
| --- | --- |
| **Guided preview** | Simulated sign-in and animated task progress. No wallet, payment or blockchain transaction is involved. |
| **Illustrative comparison** | An explanation of shared versus separate storage. The `+1,200ms`, `100%` and `300ms Single-Slot` figures are scenario values, not measurements or network guarantees. |
| **Sample data** | An example number used while that metric's live source is unavailable. It does not populate the event ledger. |
| **Live data** | A reading from the configured source within the displayed observation window. Zero is a valid live reading. |
| **Last observed** | Previously fetched data retained after a refresh failed. It is not a newly confirmed reading. |
| **This demo** on micropayments | Payments verified for the current browser demo, rather than a network-wide total. The preview never increments it. |
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

For a quick explanation, follow the [guided preview steps](demo-guide.md#run-the-guided-preview). For actual testnet receipts, follow the [live walkthrough](demo-guide.md#run-five-real-testnet-tasks) after the operator configures the deployment, wallets, daemon and payment service.

The live browser demonstration performs deterministic checksum calculations. It demonstrates authorization, task isolation and paid settlement; it does not invoke an external AI model. Actual MCP invocation is available through the [task client](../../scripts/README.md).

Use the repository's [submission proof](../../SUBMISSION_PROOF.md) to distinguish completed live evidence from remaining work. The [verification record](../../VERIFICATION.md) records local checks. More detail is available in the [architecture](../../docs/architecture.md), [protocol](../../docs/protocol.md), and [data/API reference](data-and-api.md).
