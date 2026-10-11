# Submission readiness: live-site audit

Evidence files identified as local files below are retained only in the verification workspace and are not published in this repository. Existing linked transaction evidence remains available in the repository.

**Checked October 11, 2026. The core testnet workflow works, but the project is not ready to invite judges to connect a wallet.** MetaMask's current domain scan still returns `BLOCK`. Resolve that classification and the remaining proof/presentation items below before an interactive judging session.

The audit covered the deployed [Overview](https://monad-astheris.vercel.app/), [Agent Directory](https://monad-astheris.vercel.app/agents), and [Shard Visualizer](https://monad-astheris.vercel.app/visualizer) at desktop and mobile sizes. It also checked production APIs, Monad contract state, wallet balances/permissions, Envio, the automatic batch worker, Dynamic's public settings, official explorer pages and the live MCP protocol. No wallet authentication, device ceremony, signatures, payments or new transactions were performed during this audit. Existing transaction evidence is identified separately.

Use the [manual testing guide](../frontend/docs/manual-test-guide.md) for exact buttons, expected results and evidence to save. [SUBMISSION_PROOF.md](../SUBMISSION_PROOF.md) contains transaction proofs; [VERIFICATION.md](../VERIFICATION.md) records automated checks and their scope.

## What is already working

| Area | Observed state | Boundary |
| --- | --- | --- |
| Public site | **13 functional checks passed** across 1440px and 390px: navigation, guided preview, search, agent details, delegation dialog and shard inspection. | Opening login UI does not prove authentication. |
| Self-service onboarding | Agent #2 belongs to the user's personal wallet. Its original five-task run has independently checked registration, delegation, task and payment receipts. | A new visitor needs funds and their own approvals; no operator allowlist is needed. |
| Tasks and indexing | **2 agents, 16 completed task lanes: 1 for Observer #1 and 15 for Checksum Agent #2.** Hosted Envio returns these records. | Recent executions can correctly be zero outside the recent block window. |
| Merkle publication | **16 verified batch commitments, no known outstanding batches.** The hosted worker automatically published the latest ten. | The table displays the latest 12. Full deployment-history RPC scanning is still progressing; settlement of the known indexed tasks is evidenced. |
| Production configuration | Overview, directory and both agent-specific paid-demo configurations return HTTP 200. Render reports a running batch worker. | A point-in-time check does not establish continuous availability or durable storage. |
| MCP service | **11 fresh protocol checks passed**, including `get_monad_block` and independent block/hash checks. | Reads blockchain metadata; no AI model. The free MCP read is separate from paid task recording. |
| Contracts | All four deployed runtime bytecode hashes match the deployment manifest. | This does not establish accepted explorer source verification. |
| Reputation and validation | Original Observer completion and project-controlled output-integrity validation have receipts. | Completion is not a reviewed rating. `Unrated` / `0` feedback is truthful. |

Evidence: browser audit (local file: `submission/2026-10-11/readiness-browser-audit.json`), backend audit (local file: `submission/2026-10-11/readiness-backend-audit.json`), MCP verification (local file: `submission/2026-10-11/readiness-mcp-protocol.json`), [original self-service run](../submission/2026-10-10/self-service-agent2.json), and [automatic settlement](../submission/2026-10-11/agent2-automatic-batch-settlement.json). Current release verification includes 173 frontend tests and 36 Rust tests; consult the verification record for other suites and revisions.

## What remains, in priority order

| Priority | Remaining work | How to close it |
| --- | --- | --- |
| **Before wallet-based judging** | **Resolve the MetaMask website classification.** The current scan returns `recommendedAction: BLOCK`; the cause is unknown. | Request manual URL review through official support, investigate the finding, record the outcome and recheck the deployed site in MetaMask. Do not ask judges to override the warning. A passing build or earlier payment is not clearance. |
| **Before wallet-based judging** | **Correct the authentication identity.** Dynamic still advertises `uiriamuzu`; the login UI displays Sandbox. | Correct the display name to Aetheris in the intended Dynamic environment; verify project ownership, allowed production origin, network and authentication methods. Confirm the new sign-in text. Sandbox alone is not a security defect; renaming is separate from clearing the classification. |
| **Before unattended paid judging** | **Make the daemon journal durable and rehearse recovery.** Render currently has an ephemeral filesystem. | Persist the existing task/payment journal, coordinating a single writer during migration. Test restart/recovery without duplicate payment or transaction submission, retain backups and monitor health. Free-service sleep also creates first-visit delay. |
| **Before your next live run** | **Renew Agent #2's daemon executor permission.** Its grant expired at `2026-10-10T18:24:41Z`. | After security clearance, select Agent #2 → **Authorize for 1 hour** → **Check balances & status**. This is expected expiry, not a new funding problem. |
| **Strongly recommended for inspection** | **Publish verified source for all four contracts on Monadscan.** Current pages invite source verification and show no verified-source marker. | Verify the exact deployed compiler inputs/settings and constructor arguments against the existing addresses. Save accepted explorer links; no redeployment is needed. |
| **Original objective incomplete** | **Physical passkey enrollment and subsequent sign-in.** | Record successful device prompts and restored authentication. A MetaMask signature is not this ceremony. If uncompleted, mark it unverified and remove successful-passkey claims from the demonstration. |
| **Original objective incomplete** | **Explicit executor revocation and blocked subsequent use.** Expiry alone is insufficient. | On Agent #2, capture the revoke receipt, zero expiry / unauthorized state and a blocked new run before payment. Existing receipts must remain readable. Restore authorization afterward if continuing. |
| **Original feedback objective incomplete** | **A genuine reviewed reputation assessment, if demonstrating ratings.** | An eligible independent reviewer assesses actual output and supplies a rating. Verify its transaction and directory result. Otherwise retain truthful `Unrated`; never infer positive feedback from successful execution. |
| **Accessibility improvement** | **Dynamic login overlay does not initially receive keyboard focus or expose a dialog role.** First Tab reaches the background footer. | Fix/integrate provider focus and modal semantics, then retest keyboard/screen-reader operation. Reproduced with trusted pointer input at both sizes. Mouse controls work; the app's own delegation dialog handles focus correctly. |
| **Submission package** | **Prepare the two recordings and complete the entry.** | For the intended Monad Metropolis event, the public form requires a technical demo up to 3 minutes and a pitch up to 2 minutes, plus project/repository/live-product details. See the verified requirements below. Check account eligibility and selected bounty conditions in the signed-in portal. No tracked video was found; an external recording may already exist. |

MetaMask's [official guidance](https://support.metamask.io/configure/wallet/security-alerts/) routes URL-classification concerns to manual support review. A [prepared, unsent request](../submission/2026-10-07/wallet-security-review.md) is available; update its source revision/date before sending. No support message was sent in this audit. Render documents [free-service sleep and ephemeral files](https://render.com/docs/free) and [persistent disk options](https://render.com/docs/disks).

## Your current test wallet

Read at `2026-10-11T01:14:30Z` on chain 10143:

| Item | Current state |
| --- | --- |
| Address | `0xce77b053D322ae8380aD2D0458f3605966EBDD22` |
| Agent | Owns **Agent #2**. Select it instead of registering a duplicate. |
| Testnet MON / USDC | **5.91381612 MON / 20.985 USDC** |
| Five-task price | **0.005 testnet USDC** total at current policy, plus setup gas. |
| Client authority | Owner authority for Agent #2 is valid. |
| Daemon authority | Expired; renew after security clearance. |
| Observer #1 authority | None. Its disabled action is correct; use your own agent on Overview. |

The current daemon executor is `0x5D8853E81F580A12e3Affaa9a7c76E0A65E02F57`. Check the actual configured address shown during setup. It must differ from the browser task wallet; do not use the daemon's shared owner/relayer key as a browser payer.

## Claims to keep precise

- The homepage runs five deterministic browser checksums and commits hashes: a working demonstration of paid agent-task infrastructure, not five AI models doing research.
- Observer #1's MCP tool reads mined Monad block metadata. HTTP GET shows protocol instructions; an MCP client uses JSON-RPC POST.
- Green lanes mean task/payment receipts were checked with two confirmations. A matching Merkle root establishes consistency of recorded data, not AI quality or hardware attestation.
- Visualizer retries, delay and efficiency percentages are labeled illustrations. No measured throughput advantage or absence of Monad scheduler contention has been established.
- Device authentication and expiring on-chain delegation are separate. No arbitrary raw P-256 signature verification on the router is demonstrated. Mera's PRF account is a separate optional flow.
- CRE delivery, genuine hardware TEE evidence, Mera device ceremony, Privy, real Graph Tally settlement, independent quality approval and cumulative spending caps need separate implementation/evidence if claimed. They need not be added to present the working x402 flow.

## Submission requirements for the intended event

The README identifies **Monad Metropolis, Track 04: Trust, Identity & AI Infrastructure**. The user has not separately confirmed the event for this audit. Public organizer pages and the official project form's served UI were checked without signing into an account; saved primary-source findings (local file: `submission/2026-10-11/readiness-organizer-requirements.json`) record the method and limits.

| Requirement | What to prepare |
| --- | --- |
| Deadline | The official portal displays **October 14, 2026 at 03:59 UTC**, or **04:59 WAT in Lagos**. This is October 13 at 23:59 Eastern daylight time. Confirm the displayed cutoff in your signed-in project and submit earlier. |
| Project details | Name, one-line description, full description, logo, and go-to-market/user-acquisition strategy. |
| Working product | HTTPS live product on Monad Mainnet or Testnet; Aetheris uses Testnet 10143. |
| Code access | GitHub repository public or shared with the review address specified by the portal. The current repository is public. |
| Technical demo | **Up to 3 minutes** showing the functioning product, rather than a slides-only or code-only walkthrough; supply an HTTPS video link. |
| Pitch | **Up to 2 minutes** introducing the team, problem and motivation; supply a separate HTTPS video link. |
| Track and bounties | Select one primary track and answer required questions for each selected sponsor bounty. A library import alone does not establish bounty eligibility. |
| Judge instructions | Optional form field; use it for the no-wallet tour, self-service test steps, testnet funding, real approval count and known limitations. Do not provide secret credentials. |
| Code license | Open sourcing is encouraged, not mandatory in the retrieved guidance. No root LICENSE exists; selecting a suitable license is a project decision, not a verified disqualification. |
| Build-window eligibility | Existing teams/projects are allowed, but submitted work must have been built during the event's six-week window. Confirm which work is eligible. |

Sources: [official project portal](https://hackathon.monad.xyz/project), [tracks](https://hackathon.monad.xyz/tracks), and [organizer page](https://monad.xyz/developers/hackathons/metropolis). Detailed account eligibility, complete bounty criteria and scoring weights were not available without authentication. The public form does not establish that this project's entry is complete or submitted. Video-publication consent is separate from providing videos for judges.

## Final rehearsal

After wallet-security clearance, complete a fresh ordinary-user run, reload and recover without paying again, then inspect its indexed tasks and batch commitments. Save public request IDs and transaction hashes. Test explicit revocation last and restore authorization for any remaining session. Repeat the no-wallet tour on desktop and phone.

Prepare a recording showing **Connect → Register/select → Authorize → Fund/check → Run → Receipt → Indexed batch**, with real approval steps and edited waiting periods clearly identified. Give judges the live site, repository, exact reviewed revision, architecture, contract links, evidence, test instructions and known limitations. Never publish private keys, recovery phrases, service tokens or active signatures.

This audit reconciles outdated documentation: production Envio is configured, paid execution is evidenced, and Agent #2's browser workflow has live receipts. Those corrections do not close the security, device, revocation or durability work above.
