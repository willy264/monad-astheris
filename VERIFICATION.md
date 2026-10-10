# Verification record

Updated **2026-10-10**. A new user wallet registered Agent #2 and completed five paid browser checksum tasks through the self-service flow. Canonical task, registration, delegation and payment receipts were independently checked. All five corresponding Merkle batches have now been published, finalized and matched to verified hosted Envio commitments. The registered observer previously completed an authorized paid MCP task, reputation completion, finalized Merkle publication and project-controlled output-integrity validation on October 7. [SUBMISSION_PROOF.md](SUBMISSION_PROOF.md) links the exact receipts. Tests, hosted builds, device ceremonies and on-chain results are separate verification categories.

**Wallet finding:** earlier user screenshots show a malicious-site classification for the production domain. The [review record](submission/2026-10-07/wallet-security-review.md) documents the unresolved warning and separately confirmed Dynamic display-name mismatch. Automated source checks and later successful user transactions do not clear this classification. Provider review and the physical passkey demonstration remain outstanding.

**October 10 operational checks:** Render was resumed after equal latest/pending owner nonces and a disabled batch worker were verified. Its public health and configuration endpoints return 200. After the operator's Vercel redeploy, the demo configuration also returns **200 / enabled:true**, with the expected contracts and payment policy; this supersedes the earlier 503. Agent #1's owner is also a daemon relayer and cannot be the browser task signer. The prior separate Agent #1 task delegation was inactive at this check, and the recorded MetaMask scan still returned `BLOCK`. [Recovery evidence](submission/2026-10-10/demo-availability.json), [enabled configuration](submission/2026-10-10/demo-config-enabled.json) and [setup guide](frontend/docs/live-demo-setup.md). Those initial read-only checks submitted no transaction or payment; the later user-submitted Agent #2 execution is recorded below.

## Live self-service checks, October 10

[Agent #2 evidence](submission/2026-10-10/self-service-agent2.json) was collected read-only at **15:35–15:40 UTC** from the canonical Monad Testnet RPC and hosted Envio. The user supplied the production browser success screenshot. No signing, broadcasting or paid rerun was performed by the verifier.

| Evidence | Verified result | Boundary |
| --- | --- | --- |
| Owned identity | Wallet `0xce77b053D322ae8380aD2D0458f3605966EBDD22` submitted Agent #2 registration; exact `Registered`/mint events and current owner/inline metadata match. | The card describes browser checksums, without an external AI model or MCP service. |
| Expiring executor authority | The same owner granted the configured daemon executor authority until **16:11:09 UTC**; all five executions preceded expiry. | A successful wallet grant does not establish passkey enrollment/sign-in or explicit revocation. |
| Five completed tasks | All screenshot hashes match canonical successful `ShardCreated`/`TaskExecuted` receipts, exact indexed fields, predicted CREATE2 addresses and reconstructed salt mappings. | Five different execution blocks, not a single-slot or throughput benchmark. Original browser workload bytes were not provided for recomputation. |
| Testnet payments | Five canonical USDC transfers of 1,000 base units from this payer to the configured recipient each contain `AuthorizationUsed`; total **0.005 testnet USDC**. | Original browser request IDs, task signatures and nonce journal were unavailable; independent per-task payment linkage is not claimed. |
| Indexing and initial batch status | Envio returns **5 shards / 5 completed tasks**; recomputed leaves match its five one-leaf roots. | On-chain batch storage was zero at this **15:35–15:40 UTC** check. The later publication below supersedes that dated state. |

At the recorded block, the new wallet held **5.927053884 MON** and **20.995 testnet USDC**. Balances and grant validity are timestamped observations, not guaranteed future state. Full transaction hashes, blocks, logs, nonces and query output are preserved in the evidence artifact.

## Agent #2 batch publication, October 10

[Independent settlement verification](submission/2026-10-10/agent2-batch-settlement.json) passed at **17:06 UTC**. The daemon CLI published the five existing source blocks `69858093`, `69858120`, `69858148`, `69858175` and `69858203` sequentially. No task or x402 payment was repeated.

| Check | Verified result |
| --- | --- |
| Canonical source data | Re-read every source block and exact `TaskExecuted` log; rebuilt domain-separated double-hashed leaves and block-hash-bound batch IDs. Each block has one leaf. |
| Commitment transactions | Five successful canonical finalized receipts, exact `commitMerkleBatch` calldata and `MerkleBatchCommitted` events match the reconstructed roots, counts and source blocks. [Explorer links](SUBMISSION_PROOF.md#agent-2-merkle-settlement-october-10). |
| Finalized router storage | All five commitments match at finalized block **69880508**. Owner transaction nonces are **21–25**. |
| Hosted Envio | All five `MerkleBatch` rows report `committed`; all five `BatchCommitment` rows report `verified: true` and match the corresponding on-chain transaction. The exact GraphQL query and response are saved in the artifact. |
| Signer handoff | Render suspension, a new SIGTERM/draining log and the shutdown interval were observed before local signing. The existing local journal was retained. Latest/pending owner nonces were both **21** before and **26** after publication. Render resumed healthy at **17:05:28 UTC**. |

This is a five-block publication, not a throughput measurement or a full historical worker scan. The CLI did not advance the worker cursor. Render remains on free ephemeral storage with `batchWorker: disabled`; durable automatic publication and journal retention are still open operational work.

## Current source checks

| Component / revision | Checks and observed outcome | Scope |
| --- | --- | --- |
| Saved receipt recovery, indexed history and owner-aware delegation, `8d52c93` | **168 frontend tests**, typecheck and local production build passed. **69 browser checks**: 34 recovery, 26 ownership and 9 indexed-history checks across desktop/mobile. [Public check record](submission/2026-10-10/frontend-recovery-checks.json). | Automatic recovery never signs or resubmits. Exact task/payment receipts remain required even when the daemon lost its job. History remains separate from recent metrics. Recovery/ownership browser tests use controlled wallet adapters; history rendering uses real Envio/RPC data. No original-user journal or device ceremony was available for this verification. |
| Observer access and wallet feedback, `00c8226` | **143 frontend tests**, `pnpm typecheck` and local production `pnpm build` passed. **22 controlled browser checks** at 1440px and 390px passed with no runtime/console errors. | Checks cover current Observer permissions before MCP/signing, scoped legacy recovery, self-delegation rejection, wallet rejection/timeout redaction and retained receipt verification. Browser fixtures use real components with controlled wallet/permission adapters; they do not submit transactions or establish a passkey ceremony. |
| Self-service agent setup, `f646da5` | **134 frontend tests**, `pnpm typecheck` and local production `pnpm build` passed. **68 shared ABI declarations** match compiled Solidity artifacts. | A visitor registers an owned identity, grants one-hour executor authority, checks funding and runs tasks with its selected agent. Tests cover real receipt/event decoding, partial grants, ambiguous recovery, current server permissions and wallet/agent journal isolation. Automated checks do not establish a live visitor registration, paid browser run or physical passkey ceremony. |
| Compact Overview/cards, demo signer notice and indexed read ordering, `659d3b9` | **94 frontend tests**, `pnpm typecheck` and local production `pnpm build` passed. Eight new regression tests exercise advancing RPC/Envio providers and retained rejection guards. | Layout uses existing live hooks. Indexer progress is captured before a fresh RPC head; genuinely ahead progress, wrong chains and mismatched deployments remain rejected. The demo prevents starting a new run with a relayer wallet; recovery stays available. |
| Passkey reauthentication-close recovery, PR #42 / `63d493c` | **86 frontend tests**, including **29 passkey tests**, `pnpm typecheck` and local `pnpm build` passed. | Recovers only Dynamic 5.9.2's exact close error after a fresh credential-link permission check for the same account. Cancellation, failed checks and undefined registration results cannot become success. Physical WebAuthn enrollment and MetaMask domain clearance remain unverified. |
| Contracts, PR #39 / merged `7569afb` | **38 Foundry tests** passed, including two 256-case fuzz tests. | Storage isolation, permissions, registries and CRE receiver behavior; no live CRE delivery or scheduler benchmark implied. |
| Daemon publisher, `153b603`, merged in [PR #39](https://github.com/willy264/monad-astheris/pull/39) | `cargo fmt --check`, `cargo check --locked --offline --jobs 1`, `cargo test --locked --offline --jobs 1`, and `cargo clippy --locked --offline --all-targets --jobs 1 -- -D warnings` passed; **27 tests**. Component CI passed. | Includes one-block argument validation, canonical/finalized block and receipt checks, exact stored commitments, private-error redaction, cursor preservation and worker recovery of existing commitments. |
| Shared interfaces, PR #39 | `node scripts/check-interfaces.mjs`: **63 declarations** match compiled Solidity ABIs. | Includes committer and Merkle state views used by the publisher. |
| Operation/task scripts, PR #39 | Typechecking and **17 tests** passed in component CI. | MCP, task/payment binding, durable signer recovery, receipt checks, explicit feedback and deployment recovery. |
| Envio, [PR #38](https://github.com/willy264/monad-astheris/pull/38), source `627c212` | Frozen install, fresh `pnpm codegen`, full generated-type `pnpm typecheck`, **2 Merkle tests** and **8 config guard checks** passed in isolated Ubuntu WSL, Node 22.23.3 / pnpm 10.32.1. [Indexer CI](https://github.com/willy264/monad-astheris/actions/runs/37681112689) also passed. | A Linux generation result; native Windows still lacks Envio's required addon. Hosted evidence is separate below. |
| Passkey fix, [PR #40](https://github.com/willy264/monad-astheris/pull/40), source `6e7abe5`, merged `4d8222d` | **61 frontend tests**, typecheck and local production build passed. All four component CI jobs and the Vercel build passed. Production deployment `8zRxvaFKqvv46G1Eia5nhuV9DfQ9` succeeded at 21:00:54 UTC. | Automated assertions and deployment cannot prove physical enrollment/sign-in. |

Rust **1.94**, Foundry **1.8.4** and Solidity **0.8.24** are the recorded native toolchain versions. Whole-stack setup recommends Node **24+** and pnpm **10.32.1**. A standalone daemon was built with `cargo build --locked --offline --jobs 1 --profile test`; `--help` succeeded without environment/network initialization. The later controlled publication command submitted the Merkle transaction.

The passkey recovery change reran the frontend checks above; engine builds and live transactions were not repeated for that change. Other results belong to the named revisions and execution records.

## Live checks, October 7

| Evidence | Verified outcome | Boundary |
| --- | --- | --- |
| [Deployment](contracts/deployments/10143.json) and [agent manifest](contracts/deployments/10143.agent.json) | Existing receipts/code/linkages and Agent #1 registration rechecked. | Reused the deployed contracts and identity; no replacement deployment needed. |
| [MCP report](submission/2026-10-07/mcp.json) | **11 checks** against the public observer and independent Monad RPC. | Free read-only transport/data verification, separate from the paid request. |
| [Delegation grant](submission/2026-10-07/delegation-grant.json) | Owner-signed task authority confirmed before execution. | Wallet delegation succeeded; physical passkey enrollment did not. Explicit revocation is pending. |
| [Task proof](submission/2026-10-07/task-proof.json) | Real `get_monad_block` output, input/output commitments, exact CREATE2 shard and successful execution at block **69066769**; **0.001 testnet USDC** settled through x402. | One CLI task, not five browser tasks or a load test. Public proof omits reusable credentials. |
| [Completion record in task proof](submission/2026-10-07/task-proof.json) | Reputation completion transaction confirmed. | No independent feedback/rating was submitted. |
| [Owner handoff](submission/2026-10-07/owner-handoff.json) | Completed remote job and known receipts reconciled; owner latest/pending nonce both **9** at handoff. | A session-specific observation, not proof of durable remote storage. |
| [Merkle publication](submission/2026-10-07/merkle-publication.json) | Finalized execution block reconstructed and committed; **1 leaf**, `receiptVerified: true`. Exact event, canonical source/receipt blocks and finalized storage checked. | The command preserves the worker cursor and does not claim historical catch-up. |
| [Current Envio evidence](submission/2026-10-07/envio-settlement.json) | Endpoint `635fbf6/v1/graphql` from `7569afb` indexed through **69070913** at the recorded check. Exact frontend queries/parsers, recomputed leaf/batch ID, task proof and verified commitment match. Agent #1 shows one completion. | Hosted query compatibility is established; production Vercel environment configuration is still missing. |
| [Output validation](submission/2026-10-07/output-validation.json) | Real output-bound request and authenticated response; exact events and stored status. Output matches finalized RPC block data and committed bytes. | Project-controlled validator; `100` / `output-integrity` is not independent quality review, TEE proof or CRE delivery. |

The successful task supersedes the initial October 7 funding/authorization blockers in [preflight](submission/2026-10-07/preflight.json) and [funding follow-up](submission/2026-10-07/funding-followup.json). The [initial Envio report](submission/2026-10-07/envio-initial.json) records missing public aggregate fields; the current deployment enables `Agent&TaskExecution`, and actual frontend queries/parsers pass. Envio auto-deploy is disabled to preserve the verified development endpoint and deployment quota. Neither its earlier schema error nor the original blocked task attempt describes the current result.

## Browser and integration history

These checks apply to their exact revisions and do not replace verification of a later deployment.

The self-service setup at `f646da5` passed **37 controlled browser checks** at 1440px and 390px, with 12 screenshots and no runtime or console errors. The actual components and CSS were rendered with explicitly synthetic wallet/setup adapters in an isolated local fixture. It covered disconnected, unfunded, registered, authorized, ready, recovery, account-switch, wrong-network and failed-read states. No real wallet authentication, signature, payment or chain write occurred. The fixture is UI evidence, separate from contract/RPC verification.

The [October 10 UI verification](submission/2026-10-10/overview-ui-verification.json) records **55 layout checks** at 1440px, 768px and 390px, using exact captured production API responses, plus **12 separate unmocked checks** against the rebuilt local production server at `659d3b9`. The latter confirmed healthy Overview/directory APIs, real RPC/Envio readings, current registry data and compact card rendering after the read-order fix. Both runs recorded zero browser exceptions or console errors. No wallet authentication, passkey ceremony, task signatures or payments were performed; the relayer-wallet notice was reviewed in code, not exercised with a connected account.

The [October 7 production passkey smoke record](submission/2026-10-07/passkey-production-smoke.json) confirms the `4d8222d` asset contains the new credential-link step-up and unconfirmed-result checks. All three routes rendered at 1440px and 390px, and four access dialogs opened correctly; the initial run had no runtime exception but recorded one provider fetch error. A fresh-session follow-up received three HTTP 429 responses from Dynamic's public settings endpoint and could not initialize the SDK. Retries stopped. The complete smoke run is **not a pass**, and no account authentication or physical ceremony was performed.

| Date / revision | Recorded verification |
| --- | --- |
| October 4 observer registration | Official MCP SDK negotiated protocol `2025-11-25`; **11 live MCP checks** passed. Agent #1 registered at block `68105690`. [MCP report](contracts/deployments/10143.mcp.json), [registration receipt](contracts/deployments/10143.agent-receipt.json). |
| October 5, PR #33 / `80570af` | **38 contract tests, 20 Rust tests, 17 script tests, 52 frontend tests and 61 ABI declarations** passed. [Component CI](https://github.com/willy264/monad-astheris/actions/runs/37378492032), [fresh Linux indexer CI](https://github.com/willy264/monad-astheris/actions/runs/37378492057), and **101 production browser checks** passed. |
| October 7 sidebar release, PR #36 / `10c2550` | [Component CI](https://github.com/willy264/monad-astheris/actions/runs/37546224081) and Vercel production build passed; frontend had **57 tests**. Production browser verification passed **592 checks with 81 screenshots**, zero runtime exceptions, console errors or provider HTTP errors. |

The 592-check run covered all three routes at 1440px, 768px, 390px and 320px, the 701px sidebar breakpoint and 768x390 landscape. It exercised navigation, keyboard sidebar operation, actual wallet-dialog access, fonts, directory/search, comparison modes and guided preview. The ignored local report is `.tools/sidebar-ui-verification/2026-10-06T23-25-58-336Z/report.json`; `artifactRevision` records the application source. It made no physical passkey ceremony, paid browser task or blockchain write. Populated task/batch UI and the later passkey fix need their own deployed-browser verification.

Earlier feature logs remain available in Git history. Dependency mitigations are documented in the [frontend security notes](frontend/docs/dependency-security.md); these checks are not an independent security audit.

## Open verification work

- Complete supported-device passkey enrollment/sign-in on the deployed fix after Dynamic's observed settings rate limit clears. The user's last report was that registration opened no prompt.
- Verify explicit delegation revocation and rejected new use afterward. Scheduled expiry alone is not the requested revoke transaction.
- Retain the original five-task browser journal/request IDs for independent per-task EIP-712/payment linkage; the user-submitted Agent #2 tasks, five matching payments and five finalized Merkle commitments now have canonical receipt evidence.
- Move Render's journal to persistent storage; test backup, restart and ambiguous-outcome reconciliation. The service has resumed, but free ephemeral hosting is not production-durable.
- Demonstrate any advertised independent feedback, CRE delivery, hardware TEE verification, Mera ceremony or Privy integration separately.

The [readiness checklist](docs/submission-readiness.md) separates these remaining tasks from the paid workflow already evidenced on chain.
