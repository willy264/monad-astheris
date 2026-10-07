# Verification record

Updated **2026-10-07**. The registered observer has completed an authorized paid MCP task, actual x402 settlement, a reputation completion record, a finalized Merkle publication and project-controlled output-integrity validation. Hosted Envio returns the matching task and verified commitment. [SUBMISSION_PROOF.md](SUBMISSION_PROOF.md) links the exact receipts. Tests, hosted builds, device ceremonies and on-chain results are separate verification categories.

## Current source checks

| Component / revision | Checks and observed outcome | Scope |
| --- | --- | --- |
| Contracts, PR #39 / merged `7569afb` | **38 Foundry tests** passed, including two 256-case fuzz tests. | Storage isolation, permissions, registries and CRE receiver behavior; no live CRE delivery or scheduler benchmark implied. |
| Daemon publisher, `153b603`, merged in [PR #39](https://github.com/willy264/monad-astheris/pull/39) | `cargo fmt --check`, `cargo check --locked --offline --jobs 1`, `cargo test --locked --offline --jobs 1`, and `cargo clippy --locked --offline --all-targets --jobs 1 -- -D warnings` passed; **27 tests**. Component CI passed. | Includes one-block argument validation, canonical/finalized block and receipt checks, exact stored commitments, private-error redaction, cursor preservation and worker recovery of existing commitments. |
| Shared interfaces, PR #39 | `node scripts/check-interfaces.mjs`: **63 declarations** match compiled Solidity ABIs. | Includes committer and Merkle state views used by the publisher. |
| Operation/task scripts, PR #39 | Typechecking and **17 tests** passed in component CI. | MCP, task/payment binding, durable signer recovery, receipt checks, explicit feedback and deployment recovery. |
| Envio, [PR #38](https://github.com/willy264/monad-astheris/pull/38), source `627c212` | Frozen install, fresh `pnpm codegen`, full generated-type `pnpm typecheck`, **2 Merkle tests** and **8 config guard checks** passed in isolated Ubuntu WSL, Node 22.23.3 / pnpm 10.32.1. [Indexer CI](https://github.com/willy264/monad-astheris/actions/runs/37681112689) also passed. | A Linux generation result; native Windows still lacks Envio's required addon. Hosted evidence is separate below. |
| Passkey fix, [PR #40](https://github.com/willy264/monad-astheris/pull/40), source `6e7abe5`, merged `4d8222d` | **61 frontend tests**, typecheck and local production build passed. All four component CI jobs and the Vercel build passed. Production deployment `8zRxvaFKqvv46G1Eia5nhuV9DfQ9` succeeded at 21:00:54 UTC. | Automated assertions and deployment cannot prove physical enrollment/sign-in. |

Rust **1.94**, Foundry **1.8.4** and Solidity **0.8.24** are the recorded native toolchain versions. Whole-stack setup recommends Node **24+** and pnpm **10.32.1**. A standalone daemon was built with `cargo build --locked --offline --jobs 1 --profile test`; `--help` succeeded without environment/network initialization. The later controlled publication command submitted the Merkle transaction.

This documentation update did not rerun engine builds or live transactions. Results belong to the named revisions and execution records.

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
- Configure production Vercel with the verified Envio URL and paid-service policy, then capture real task/batch rendering and the chosen browser paid flow.
- Resume coordinated service availability and move Render's journal to persistent storage; test backup, restart and ambiguous-outcome reconciliation. Free ephemeral hosting is not production-durable.
- Demonstrate any advertised independent feedback, CRE delivery, hardware TEE verification, Mera ceremony or Privy integration separately.

The [readiness checklist](docs/submission-readiness.md) separates these remaining tasks from the paid workflow already evidenced on chain.
