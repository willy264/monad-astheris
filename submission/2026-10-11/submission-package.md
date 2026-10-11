# Aetheris submission copy and recording kit

Prepared October 11, 2026; recording update October 12. **Not submitted.** Silent [Envio and Dynamic sponsor demos](bounty-videos/README.md) are now recorded as upload-ready MP4 files; Loom/Vimeo publication remains outstanding. The separate main technical and pitch recordings below remain outstanding. Wallet-based judging is blocked until the [readiness gates](final-readiness.md) are closed. The public product can be inspected without a wallet.

## Portal fields

**Project:** Aetheris

**One line:** Verifiable paid task infrastructure for registered agents on Monad, with isolated task contracts and indexed receipts.

**Description:** Aetheris gives each agent task its own deterministic CREATE2 storage contract. A registered agent's owner grants an executor expiring authority, while the task wallet signs the task and its exact testnet payment. A Rust daemon validates those authorizations, submits the task and journals its settlement state. Envio indexes the resulting events; a batch worker reconstructs task hashes and commits Merkle roots that can be compared with the chain.

The deployed Monad Testnet demonstration has two registered agents. The self-service workload computes five deterministic browser checksums; the Observer's MCP tool reads mined Monad block metadata. These exercise real task authorizations, x402 payments, contract execution, indexing and receipt checks. They do not demonstrate AI inference or hardware attestation. A read-only audit on October 11 verified 22 completed task lanes and 22 matching commitments. The project-controlled validation checks output integrity; the directory correctly shows no independent reputation reviews.

**Go to market:** Start with teams building agents that need auditable task records and small payments. Offer a reproducible testnet starter, MCP example, explicit approval flow and receipt viewer. Recruit initial developer teams through Monad and agent-builder communities; work with them on one paid workload each, then measure successful onboarding, verified paid completions, integration time and repeat usage. These are proposed acquisition steps and metrics, not claimed traction. Expand supported workloads after reliability and permission-recovery testing.

**Primary track:** Track 04 — Trust, Identity & AI Infrastructure. The demonstrated fit is identity, scoped executor permissions and verifiable paid execution records.

| Field | Prepared value / remaining action |
| --- | --- |
| Live HTTPS product | https://monad-astheris.vercel.app/ |
| Repository | https://github.com/willy264/monad-astheris — PUBLIC at the audit |
| Chain | Monad Testnet, 10143 |
| Logo | `frontend/public/brand/aetheris-logo.svg` and app icon assets; choose the portal's accepted file type |
| Contracts | [Four addresses and exact source inputs](../../docs/contract-source-verification.md) |
| Proof | [Verified transaction ledger](verified-transactions.md), [full chain and GraphQL evidence](final-readiness-protocol.json) |
| Technical video | **NOT VERIFIED: supply a real HTTPS recording, at most 3 minutes** |
| Pitch video | **NOT VERIFIED: supply a separate real HTTPS recording, at most 2 minutes** |
| Team | Enter the actual members, roles and motivation; no team identity was invented here |
| Bounties | [Paste-ready answers and selection audit](../../docs/bounty-submission-answers.md): keep Envio and Dynamic; remove/defer CRE, Privy and both Mera selections. No additional qualifying integration bounty found. Check signed-in eligibility; selections have not been edited |
| Deadline | Public portal still displays October 14, 03:59 UTC (04:59 WAT), consistent with the intended 2026 event. **Authenticated deadline and entry eligibility NOT VERIFIED** |
| Entry status | **NOT VERIFIED / not submitted by this task** |

Requirements were rechecked from the public [project form](https://hackathon.monad.xyz/project), [tracks](https://hackathon.monad.xyz/tracks) and [resources](https://hackathon.monad.xyz/resources), including their served form UI. Public requirements include project details, logo, go-to-market plan, HTTPS product/video URLs, accessible repository, one primary track and answers for chosen bounties. Confirm the cutoff, build-window eligibility and saved entry in your authenticated account. See [retrieval evidence](final-readiness-public.json).

## Pasteable judge instructions

Start without connecting a wallet. On Overview, inspect registered agents, network samples and data freshness. Open guided setup, select **Guided preview**, then **Preview passkey sign-in** and **Preview 5 task lanes**; these lanes are explicitly simulated. In Agent Directory, compare Observer #1 with Checksum Agent #2, expand their cards and inspect the IPFS/MCP links and indexed history. On Shard Visualizer, switch the illustrative comparison modes, then scroll to the actual indexed lanes. Select a shard and open its execution receipt. Merkle rows link to real commitments; a matched root proves agreement of the recorded hashes, not AI quality or measured parallel performance.

**Do not connect a wallet while the site has a blocking wallet-security classification.** Following clearance and operator readiness, a new user can connect a distinct personal test wallet, register an agent, authorize the displayed executor, check funds and run five checksum tasks. Existing owners can use their token ID without registering again. Each task requires one task signature and one payment signature: **ten signatures for five tasks**, in addition to any login signature, registration transaction and required executor-grant transaction(s). Five payments total **0.005 testnet USDC** under current policy; setup also needs testnet MON gas. Obtain funds from the [Monad faucet](https://faucet.monad.xyz/) and [Circle faucet](https://faucet.circle.com/) using Monad Testnet. Successful green lanes indicate the app checked the task and exact payment receipts with two confirmations. Reloading/recovering checks saved requests without creating a new paid run.

The [manual guide](../../frontend/docs/manual-test-guide.md) contains the detailed procedure, failure checks and evidence to save. Access requests currently require the updated daemon deployment; a request alone never grants authority. Device passkey enrollment/sign-in and live revocation remain unverified. Mera, Privy, Chainlink CRE, genuine TEE attestation, independent quality review, Graph Tally settlement and spending caps are not demonstrated completion claims.

## Technical demonstration — maximum 3 minutes

| Time | Actual screen / action | Narration |
| --- | --- | --- |
| 0:00–0:20 | Overview, chain label and identity cards | “Aetheris records independently authorized, paid tasks on Monad Testnet. Each task has a separate deterministic contract.” |
| 0:20–0:45 | Guided preview; visibly keep its simulated label | “This preview explains the workflow without a wallet. Real testnet tasks use separate task and payment approvals.” |
| 0:45–1:15 | Directory, actual Agent #2 owner and history | “Users register their own identity and grant expiring executor permission. These indexed completions belong to the registered identity.” |
| 1:15–1:45 | Select an actual shard; open a verified execution link | “This receipt records the task result hash and its isolated address. Our demo computes browser checksums; it does not run an AI model.” |
| 1:45–2:10 | Open a real payment proof from the ledger | “The client independently checks the exact testnet USDC authorization and transfer.” |
| 2:10–2:35 | Root-matched Merkle row and explorer transaction | “Envio reconstructs the batch and compares it with the router commitment.” |
| 2:35–2:55 | Readiness report and manual testing guide | “These are the verified capabilities and remaining gates. Device ceremonies, independent reviews and measured scheduler performance are separate evidence.” |

If security clearance and live approvals are completed before recording, replace part of the preview with a short truthful excerpt of that recorded run. Never cut an unverified or failed step into a success claim. Keep the final recording under three minutes and mostly show the working product.

## Pitch — maximum 2 minutes

| Time | Speaker / content |
| --- | --- |
| 0:00–0:20 | Actual team member(s): names, roles and genuine reason for building the project |
| 0:20–0:45 | Problem: coordinating permissions, payments and result records across many agent tasks makes failures and accountability hard to inspect |
| 0:45–1:15 | Solution: registered identities, expiring delegation, isolated task storage and receipts tied to payment and indexed commitments |
| 1:15–1:40 | Show the real product and verified testnet evidence; distinguish infrastructure from the checksum/MCP demonstration workload |
| 1:40–1:55 | Proposed first users, developer integration plan and next reliability milestones |

## Recording and entry checklist

- Record a clean browser without secret env files, credentials, private signatures, recovery phrases or access tokens. Use public transaction links.
- Check legibility, audio and the two independent duration limits. Show the actual app, not only slides/code. Identify preview footage as simulated.
- Keep team statements factual. Obtain team consent before recording them.
- Upload both real videos yourself and verify the HTTPS links work for a signed-out reviewer. No recording/publication occurred in this task.
- Review logo, track/bounty answers, build-window eligibility, repository access and deadline in the signed-in portal. Save confirmation only after an actual successful submission.
