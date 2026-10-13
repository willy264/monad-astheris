# Aetheris: implemented features and submission video scripts

Prepared October 13, 2026 (Africa/Lagos) from the current implementation and recorded verification. Application release `51b1ec2` is the latest verified inbox recovery release; `2a66eeb` records its deployment. This document is a feature inventory and recording script, not a new live transaction test or a submitted portal entry. Earlier dated audits contain superseded backend outage information.

## What has been built

Aetheris is a Monad Testnet application for registering agents, granting task authority, paying for tasks and inspecting their recorded results. Each task receives a separate deterministic contract for its result. The working demonstration uses browser checksums and a Monad block observer; the infrastructure can accept authorized commitments from other clients, but does not itself run arbitrary AI models.

| Area | Implemented features | Evidence or qualification |
| --- | --- | --- |
| Dashboard and branding | Charcoal/yellow design, matching logo/favicon assets, Josefin Sans, responsive layouts, sticky shared navigation, compact cards and bounded scrolling for the shard map and ledgers | Implemented and deployed; desktop/mobile checks recorded |
| Navigation and accessibility | Overview, Agent Directory and Visualizer; header search, agent shortcuts, keyboard focus handling, dialog semantics, visible focus indicators and scroll offsets for sticky navigation | Browser/keyboard checks exist; automated checks do not establish every screen-reader/device combination |
| Live network overview | Registered identities, task activity, browser-session payment counts, block samples, network transaction-rate samples and source/freshness indicators | Counts identify their scope; network activity is not a benchmark of Aetheris |
| Agent directory | Searchable cards, owner and agent ID, capabilities, metadata links, MCP endpoints, reputation/feedback fields and indexed task history | Uses real configured registry/indexer data; absent ratings remain Unrated |
| Self-service onboarding | Connect a personal wallet, register an owned agent or select an existing token ID, authorize configured executors, check balances and run tasks | A visitor's own agent does not require a project-owner allowlist or per-user environment changes |
| Wallet integration | Shared Dynamic authentication/wallet session and wallet clients across routes; network/account checks; separate setup, task and payment signing | Dynamic is implemented; connecting a wallet is separate from granting task authority |
| Funding guidance | MON gas and configured testnet-token balance checks, required payment amount and funding links | The app checks/guides funding; it does not provide unlimited faucet funds or automatic gas sponsorship |
| Task permissions | Agent-scoped executor grants with an expiry, renewal and revocation controls; current owner and authority checks | Granting authority does not transfer the agent or authorize arbitrary wallet spending; live explicit-revocation acceptance remains to be recorded |
| Observer access requests | Requester supplies reason and duration; its connected wallet, agent, owner, request time and expiry accompany the request | Inbox API and UI deployed; sending a request alone does not grant access |
| Owner review and notifications | Private incoming/sent inbox, unread/read state, filters and pagination; review details; denial with note; approval tied to a checked on-chain delegation, hash and expiry | Complete live two-wallet approval AND denial acceptance is not yet recorded |
| Approval recovery | Exact owner approval signatures for the configured relayer-owner path; wallet transaction path for ordinary owners; saved transaction/intent recovery and current grant status | Uncertain approval state is preserved; recovery does not mean sending another grant |
| Inbox outage recovery | Public availability preflight, cached requests, explicit private Refresh inbox, disabled stale review controls, wallet/account isolation and cleaned error messages | 25 synthetic browser recovery checks and 21 production public checks passed for the latest release |
| Five-task workload | Five deterministic browser checksums, separate signed task authorizations and payment authorizations, per-task progress and request IDs | The browser dispatches prepared tasks together; a shared backend signer still submits transactions in nonce order |
| Task/payment receipts | Browser independently checks task creation/execution and the exact payment authorization/transfer before Verified on Monad; explorer links and saved-status recovery | Two confirmations are required by this UI. Recovery follows existing requests rather than automatically paying again |
| Paid service | Rust daemon implements x402 v2 exact payments with EIP-3009 testnet USDC, facilitator verification/settlement and payer/task binding | Historical paid-task and payment receipts exist; five tasks require five task signatures plus five payment signatures |
| Monad Observer | Real read-only MCP `get_monad_block` tool, advertised agent card, browser paid observation-commitment action and MCP client tooling | Reads mined block metadata. The free MCP read and paid on-chain commitment are distinct |
| Smart contracts | Deployed AgentRegistry, ReputationRegistry, ValidationRegistry and AetherisRouter; task-specific EphemeralShard instances | Four core deployments have receipt/bytecode evidence; accepted explorer source verification remains a separate open item |
| Task isolation | CREATE2 task addresses, unique task salts, fixed task/executor/input context and write-once results | Public persistent chain records. Separate result storage does not prove a throughput multiplier, confidentiality or unlimited concurrency |
| Envio indexing | HyperIndex event handlers and GraphQL drive identities, directory completions, historical shard tiles/ledger and batch matching | Meaningful deployed Envio integration. RPC supplies other reads such as network samples |
| Merkle commitments | Worker discovers finalized task blocks, reconstructs roots, checks chain consistency and publishes batches; indexer compares reconstructed roots with router commitments | Root matched means records agree; it does not certify output quality. A block may contain one or multiple task events |
| Reputation and validation | Completion records, feedback/revocation interfaces and explicit validation requests/responses; project-controlled output-integrity evidence | No independent positive rating or genuine hardware attestation is implied |
| Backend transaction safety | Signed domains/deadlines, owner/executor checks, canonical task deduplication, payment replay reservations, transaction intent journaling, per-signer nonce coordination and interrupted-job reconciliation | Atomic journal records do not make external execution and payment one atomic transaction |
| Storage and deployment | redb journal, existing-file/mount checks, exclusive file ownership, maintenance deployment and default-off temporary testnet exception | Current accepted Render free setup is temporary: replacement can lose inbox/job/payment records. Persistent production storage is not complete |
| Service reliability | Separate local `/live` probe and full `/health`, safe error diagnostics, bounded retry of reads before publication, no automatic retry of ambiguous broadcasts | A live commitment-read failure recovered in about 2.5 seconds after the latest release without restarting the inbox |
| Developer and judge materials | Setup/runbooks, protocol documentation, transaction evidence, manual test guide, readiness audit, bounty answers and recording assets | These are available materials; they do not mean the portal entry or every acceptance test is complete |
| Delivery and verification | Frontend on Vercel, daemon on Render, source pushed to GitHub, four-job CI | Latest release: 195 frontend tests, 65 Rust tests, TypeScript, Clippy, formatting, 73 ABI checks and all four CI jobs passed |

Primary references: [architecture](architecture.md), [daemon API](../daemon/README.md), [manual tests](../frontend/docs/manual-test-guide.md), [access requests](../frontend/docs/access-requests.md), [latest deployment](daemon-durability.md), [submission proof](../SUBMISSION_PROOF.md) and [bounty audit](bounty-submission-answers.md).

## Features that are partial or still need acceptance evidence

- Dynamic passkey registration/profile controls exist. Physical passkey enrollment, subsequent sign-in and reload acceptance have not been verified.
- Mera has an optional passkey-PRF account preview. It is not the complete account layer and has no separate non-account PRF feature.
- Chainlink CRE receiver/validation work and tests exist. A real orchestration workflow with successful official CLI simulation or DON deployment is not demonstrated.
- A custom Graph Tally adapter path exists. Actual Graph Tally settlement is not evidenced.
- Privy integration, autonomous cumulative spending caps, automatic gas sponsorship, real AI inference and confidential/TEE execution are not completed features.
- Owner approval/denial and explicit executor revocation need their complete live acceptance recordings. Pending request screenshots are not proof of a successful decision.
- Render's temporary filesystem is still a limitation. The restart fix does not turn it into persistent storage.
- The latest recorded wallet-domain audit had an unresolved security classification; no clearance is recorded here. Recheck and resolve any blocking wallet warning before filming new signatures. Accepted explorer source verification and independent quality feedback also remain unverified.

For the selected sponsor integrations, Envio and Dynamic have the strongest implementation evidence. The CRE, Privy and two Mera entries should not be described as completed integrations meeting those bounty requirements.

## Technical demo script: target 2 minutes 55 seconds

The screenshot requires the working product, with a maximum of three minutes. Record the actual app and explorer pages. Keep code editors, terminal walkthroughs and presentation slides out of this main demonstration. Read the narration below aloud, or use its shorter phrases as captions for a silent recording.

This main script works with existing real records and does not require another payment. Label them **Existing on-chain task records**. Have Overview, the agent directory, one selected executed shard, its successful explorer transaction and its matched Merkle commitment ready. Use the SAME task/batch across those views. Do not promise a particular lifetime count; read current values from the screen.

| Time | Screen/action | Ready-to-read narration |
| --- | --- | --- |
| 0:00-0:15 | Overview: show Aetheris branding, Monad Testnet and actual agent cards | "This is Aetheris, a working Monad Testnet application for agent identity, task permissions, payments and verifiable results. Each task gets its own contract for recording its result." |
| 0:15-0:40 | Open Set up your agent. Show the real setup controls; open Dynamic's sign-in UI without suggesting that opening it completed login | "The setup takes a user from connecting a wallet to registering an agent they own, authorizing its executor and checking task funds. Existing owners can select their agent. Running your own agent does not require the project owner to configure your address." |
| 0:40-1:00 | Directory: open the actual Checksum agent and its indexed completion history. If genuine saved green lanes are available, show those too | "Our checksum demonstration creates five independent tasks. Each needs a task signature and a separate exact testnet USDC payment signature. The app checks the task and payment receipts before marking a lane verified. These are existing recorded results." |
| 1:00-1:25 | Visualizer: scroll the bounded real task grid, select an executed shard, show agent/task/executor/input/output fields | "Envio brings the on-chain events into this task history. Selecting a lane exposes its agent, task identity, executor and committed input and output hashes. Each task has a separate storage address, so unrelated results are recorded separately." |
| 1:25-1:45 | Open that shard's execution transaction. Show successful status and the matching contract/task context | "This explorer link opens the actual transaction behind that result. Reviewers can inspect the recorded execution independently. In the browser run, verification also checks the exact token payment. The sample workload computes checksums; it does not run an AI model." |
| 1:45-2:05 | Return to the matching Merkle commitment: show Root matched and open its explorer link | "Completed task events are grouped into Merkle commitments. The worker checks finalized chain data, and Envio compares the reconstructed root with the router's commitment. A match establishes that these recorded hashes agree." |
| 2:05-2:30 | Observer workspace: show agent owner, MCP endpoint, Request Observer access and notification UI. Show a real pending request only if available | "The Monad Observer offers a real MCP tool for reading block metadata. Other wallets can request permission to run its paid tasks. The owner receives the requesting address, reason and duration, with controls to approve or deny. A request alone grants no authority." |
| 2:30-2:45 | Show Recover saved status if a genuine saved run exists; otherwise show Refresh inbox or the public availability control | "Recovery is explicit. Saved task status checks existing receipts rather than submitting another payment. After an inbox outage, the app asks for fresh request state before another review decision." |
| 2:45-2:55 | Return to Overview with the app URL visible | "Aetheris connects an owned agent identity to scoped permissions, paid task records and independently inspectable receipts on Monad. The current deployment is a testnet demonstration." |

If no saved task run exists in this browser, use the actual indexed shard/history throughout. Do not manufacture green lanes or restore someone else's authentication. If no request exists, show the request entry point and explain its controls without inventing a pending or approved entry. A signed-out bell should be described as requiring authentication, not as a loaded private inbox.

### Optional stronger footage: a newly recorded paid run

After the wallet prerequisite is cleared and setup is ready, record the full real workflow before editing. Replace 0:15-1:00 above with real clips of Connect -> Register/select -> Authorize -> Check balances -> Run 5 checksum tasks -> Verified on Monad. Show one task signature and one payment signature, followed by the final receipts from that SAME run. Use the app's current payment policy; at the previously recorded policy five payments totaled 0.005 testnet USDC, plus setup gas.

Caption trimmed sections **Additional approvals and confirmation waiting shortened**. There are ten task/payment signatures for five tasks, plus any separate login, registration and executor-grant approvals. Record the actual elapsed time if presenting speed; the 45-second edit is not a completion-time benchmark. Do not splice results from an earlier run into a claim that this new run succeeded. Use the read-only main script if a fresh run cannot be completed safely.

An access-decision clip may replace part of 2:05-2:30 only after a genuine request and successful owner decision. For approval, include the actual confirmed grant and requester state; for denial, include the requester-visible decision. Do not claim this acceptance test has already been recorded.

## Pitch script: approximately 1 minute 45 seconds to 1 minute 55 seconds

The screenshot allows up to two minutes and asks for the team, problem and reason for building. Replace the bracketed introduction with actual names/roles. The text below is about 210 spoken words, leaving room for pauses at an ordinary speaking pace. Use the real app as the visual background after introducing yourself; a face-camera introduction is optional.

**0:00-0:12 - you/team on camera, or your name over the app**

"Hi, I'm [your name], [your actual role] behind Aetheris. [If applicable: I built it with names and roles.] We're building infrastructure that makes agent work easier to authorize, pay for and inspect."

**0:12-0:35 - show the agent directory and real task records**

"As agents take on more tasks, users need clear answers: Who owns this agent? Who is allowed to act for it? What did a task cost, and where is its result recorded? When permissions, payments and results are disconnected, answering those questions becomes difficult."

**0:35-1:02 - show setup, an executed shard and its receipt**

"Aetheris brings those pieces together. Users register an agent they own, grant its executor time-limited permission, and authorize task payments. Each task records its result in a separate contract. Indexed history and transaction receipts let users inspect what happened."

**1:02-1:25 - show the live visualizer and a matched commitment**

"We chose Monad because independent task storage fits its parallel-execution architecture. Our testnet product already demonstrates paid checksum tasks and a real block-observer service, with Dynamic wallet integration and Envio-powered history. These workloads demonstrate the infrastructure without claiming that a receipt proves an AI answer correct."

**1:25-1:48 - return to you/team or Overview**

"Our first users are developers building agents that need auditable work and small payments. We're building Aetheris to make permissions and accountability part of the workflow. Next, we're focusing on durable hosting, broader agent workloads and complete user acceptance testing."

**1:48-1:55 - logo and live app**

"Aetheris: owned agents, scoped authority and verifiable task records on Monad."

Keep the team introduction and motivation truthful. This script makes no claims about customers, revenue, measured speedups or team credentials that have not been supplied.

## Recording and submission notes

1. Produce TWO separate files: technical demo at most 3:00, pitch at most 2:00. Aim for 2:55 and 1:55 to leave a margin.
2. Keep the product text readable, hold each receipt long enough to inspect, and label historical results, simulations and shortened waiting accurately. The illustrated comparison animation is not performance evidence.
3. Capture only the app, public explorer information and your intended team introduction. Keep environment files, private keys, recovery phrases and authentication signatures out of the recording.
4. Upload each finished recording to a video host accepted by the form. Paste two actual HTTPS viewing links and test both while signed out. This task supplies scripts, not hosted videos or a submitted entry.
5. The optional public-display checkbox lets the organizers show the video publicly; the screenshot says judges can see it either way. Choose based on your publication preference.

Two separate silent SPONSOR clips already exist locally: [Envio, 1:36.21](../submission/2026-10-11/bounty-videos/envio-demo.mp4) and [Dynamic, 1:09](../submission/2026-10-11/bounty-videos/dynamic-demo.mp4). Their upload remains outstanding. They are different from the main technical and pitch videos above; the sponsor clips contain implementation views and should not replace the working-product technical demo unchanged.
