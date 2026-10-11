# Aetheris final readiness remediation — October 11, 2026

**Wallet-based judging remains BLOCKED.** The current MetaMask domain scan returns `BLOCK`; Render still has an ephemeral journal, Dynamic's provider identity needs administrator review, and physical passkey/live revocation acceptance has not been completed. These are separate from the successful local repairs and independently checked historical transactions.

Baseline: clean `main` at `5b4b19d1a544ce7b063c7f099f783c745b2d0277`. Changes preserve all deployed contracts and existing identities/history. The [release record](final-readiness-release.json) records the final tested source revision, push/deployment observations and tree state. Test artifacts identify the baseline plus the remediation working tree; documentation-only follow-ups do not constitute new application testing.

## Findings and status

| Issue | Status | Evidence | Remaining dependency |
| --- | --- | --- | --- |
| MetaMask classification | **BLOCKED** | [Current scan, DNS, redirects, headers and public pages](final-readiness-public.json); [revised unsent support request](wallet-security-review.md) | Owner submits official URL review; provider clearance and independent scan/wallet recheck |
| Dynamic identity/configuration | **BLOCKED** | [Public SDK configuration and local corrections](final-readiness-auth.json): environment `5ee665e4-6f64-43c1-9537-99d989371a80`, Sandbox, display name `uiriamuzu`. Production Origin accepted; full origin allowlist and RP ID not publicly exposed | Provider administrator must review intended environment, rename Aetheris, inspect origins/RP configuration; actual authenticated production flow still required |
| Durable journal/recovery | **BLOCKED in production; local PASS** | [55 unit tests + actual-process restart test](final-readiness-daemon.json); retained jobs/payment reservations/batches, zero verify/settle/broadcast repeats; missing journal fails before RPC | Render free plan has no disk. Safely export retained state, approve hosting cost, mount/migrate, deploy once and perform production recovery rehearsal |
| Agent #2 authorization | **BLOCKED** | [Finalized chain read](final-readiness-protocol.json): intended owner valid, distinct configured executor unauthorized; latest grant expired **2026-10-11 02:20:01 UTC** | Security clearance and explicit user-approved renewal; no renewal performed here |
| Explicit revocation | **NOT VERIFIED live; local PASS** | Exact zero-expiry grant event and prepayment rejection tested; owner UI exposes selected executor management/revocation | Approved revoke receipt, finalized zero-expiry read, blocked new run and no new settlement; expiry is not live revocation proof |
| Physical passkey ceremony | **NOT VERIFIED** | Provider passkey method enabled; UI no longer presents connection as proof of a device ceremony | Human physical enrollment, subsequent sign-in, intended-account association and reload on the production origin |
| Login accessibility | **PASS locally, deployed status in release record** | Existing Dynamic focus lock patched; modal name/role, initial focus, Tab/Shift+Tab, Escape/close restoration tested at 1440/390; [auth evidence](final-readiness-auth.json) | Verify deployed patch; actual spoken screen-reader/device interaction remains NOT VERIFIED |
| Contract source verification | **NOT VERIFIED on explorer; preparation PASS** | All four deployed bytecode hashes and creation inputs match; exact source compilation reproduced. [Prepared inputs and procedure](../../docs/contract-source-verification.md) | Manual Monadscan Standard JSON submission and accepted-source result for each existing address |
| Reputation/validation | **PASS for existing integrity evidence** | Original Observer payment/execution/completion and validation receipts rechecked; `getClients(1)` empty. [Protocol evidence](final-readiness-protocol.json) | Genuine reviewed feedback remains NOT VERIFIED; retain Unrated/0. Project-controlled integrity validation is not independent AI quality |
| Merkle batch publication | **PASS for all 22 indexed batches** | Canonical source logs, reconstructed roots, commitment receipts/calldata/events/storage and hosted GraphQL agree; [all receipts](verified-transactions.md) | Full deployment-to-head RPC historical scan still incomplete; do not equate the indexed set with an independently exhausted chain scan |
| Submission package | **BLOCKED on human/external completion** | [Prepared copy, judge instructions and two recording scripts](submission-package.md); public portal requirements rechecked | Real videos, authenticated deadline/eligibility/bounty checks and final portal submission |
| Owner access requests | **BLOCKED in production** | `/api/access-requests/config` returned 503; deployed daemon lacks the current inbox API | Deploy current daemon only after journal migration; then run the existing approved two-wallet acceptance guide |

## Repairs completed

- **Dependency security:** compatible sharp and selector-parser upgrades; `stream-json` assembles `__proto__` as an own data member, including reviver/nested cases. Existing native-bigint, brace-depth and streamed-filter patches remain. Four targeted security regressions pass. The frontend version audit still reports five advisories; [mitigation and applicability boundaries](../../frontend/docs/dependency-security.md) are explicit.
- **Authentication/accessibility:** explicit supported Aetheris sign-in statement; qualified passkey copy; fix the SDK's existing focus lock rather than adding a competing trap. Both module builds receive dialog semantics, accessible controls and focus restoration. The provider's own display name remains an external setting.
- **Permission UX:** show actual executor expiry and management action from guided setup, prefill selected identity/executor, reapply that selection on every opening, and expose revocation. Confirmation must match the exact router `DelegateSet` event and owner/executor/expiry after two confirmations. Client/server reject revoked or expired permissions before signing/paid forwarding; saved receipts remain independent.
- **Durability:** retain atomic redb journal and exclusive file ownership, require the existing journal on a real mounted Render disk, record settlement intent before external work, probe committed storage health and report sanitized recovery counts. Maintenance mode also blocks access-grant broadcasts. [Migration/backup/capacity/cost procedure](../../docs/daemon-durability.md) preserves replay state and ambiguous outcomes.
- **Claims:** real action says **Run 5 checksum tasks**; preview says **Preview 5 task lanes** with neutral lane names. Infrastructure supports agent workloads; this demonstration does not establish autonomous AI research, scheduler speedup or hardware proof.
- **Evidence/submission:** exact contract inputs/constructor arguments, full verified transaction ledger, refreshed security request, manual test updates, portal copy and recording scripts. The logo already matches the yellow/charcoal design in the baseline and remains part of the release.

## Fresh tests and their limits

[Command records](final-readiness-checks.json) include exact cwd, command, UTC start/end, exit status and baseline revision. [Daemon records](final-readiness-daemon.json) separately capture Rust commands and production hosting observations. Raw local logs remain outside the public repository.

| Check | Actual result | Scope |
| --- | --- | --- |
| Frontend `pnpm test` | **192 passed**, no failed/skipped tests | Application and dependency regressions; later selection fix covered by 78 scoped auth tests |
| Frontend types and production build | **PASS** | Final build/source identity recorded in command/release records |
| Frontend frozen install | **PASS** | Committed lockfile and patches install together |
| Rust fmt/check/strict Clippy/tests | **PASS**, 55 unit + 1 integration | Actual binary processes recovered 4 jobs, 4 payment reservations and 1 batch across forced restart using isolated RPC/facilitator fixtures; no live paid restart |
| Foundry formatting/tests | **PASS**, 38 tests; 2 fuzz tests × 256 cases | Existing Solidity regressions; no contract source changed |
| Shared ABI check | **PASS**, 72 declarations | Compiled artifacts vs frontend/daemon/indexer/scripts |
| Script TypeScript/tests | **PASS**, 17 tests | Typed signatures, payment/receipt binding, journal ambiguity/idempotency and reviewed-feedback gates |
| Indexer TypeScript/tests | **PASS**, 2 tests | Current generated interface plus handlers/roots |
| Windows `pnpm codegen` | **FAIL**, exit 1: `Cannot read properties of null (reading 'runCli')` | Existing Envio CLI platform limitation; prior Linux generation is historical, not a fresh pass. No indexer source/schema changed |
| Live MCP verification | **PASS**, 11 checks | Public JSON-RPC initialization/list/call and independent block checks; no wallet or paid task |
| Exact source reproduction | **PASS**, 4 contracts | Fresh solc 0.8.24 compilation exactly matches creation/runtime templates; immutable deployed bindings checked on-chain separately |
| Dependency audits | Frontend **5 advisories** (2 high, 3 moderate), exit 1; scripts/indexer **0**, exit 0 | Version scanner still flags locally patched packages; no advisories suppressed |
| Frontend lint | **NOT VERIFIED** | No configured standalone ESLint/lint script; TypeScript/build are not claimed as a linter |
| Browser tests | See [browser evidence](final-readiness-browser.json), [auth evidence](final-readiness-auth.json) and [release record](final-readiness-release.json) | Isolated Edge at 1440/390, no wallet extension; screenshots/AX checks do not prove physical WebAuthn or spoken screen-reader behavior |

A development-only auth browser attempt exhausted Node's heap before tests; its result is not counted as a pass. An older walkthrough selector also timed out and recorded a transient live configuration 503; the final browser report uses current route controls. These are preserved as limitations/failures rather than replaced with invented successful runs.

## Current public chain evidence

Read-only protocol audit used finalized block **70,123,402**, hash `0x1c3e9692027210340f22d2bd226111bb0523b7427a42c0aa56b4c0b27ccd12c8`. It completed 74 canonical successful receipt checks. Every independently checked hash and explorer link is in the [transaction ledger](verified-transactions.md); exact GraphQL query/variables/response and recomputation fields are in [protocol JSON](final-readiness-protocol.json).

There are **22 indexed completed lanes and 22 verified committed batches**: Observer #1 has 2, Checksum Agent #2 has 20. Agent #2's wallet `0xce77b053D322ae8380aD2D0458f3605966EBDD22` held **5.907197238 MON and 20.979 USDC**, sufficient for the currently priced five-task payment of 0.005 testnet USDC. The executor `0x5d8853e81f580a12e3affaa9a7c76e0a65e02f57` remains a different address, with expired permission. Observer #1 retains token ID 1 and URI `ipfs://bafkreibo5gtw45fi27ykfsbubt7uo6vze3s4x44ytqf735ojnnhhylpuea`.

The worker was healthy/running with recent-through block 70,120,167 but historical-through 67,997,560 at the captured service check. Automatic known-batch settlement is evidenced; full historical catch-up is not complete. Recent execution windows can correctly show zero while historical lanes remain visible.

Original Observer validation confirms project-controlled byte/RPC output integrity and canonical task evidence. It does not prove model correctness, independent assessment, CRE delivery, genuine TEE attestation or router verification of arbitrary P-256 signatures. No rating was manufactured. New task/payment tests, live grants/revocations and device ceremonies were not performed in this remediation.

## Unsafe or incomplete for wallet-based judging

1. **MetaMask BLOCK remains:** do not connect/sign or ask reviewers to continue through it. Application repairs, source matches and historical receipts are not provider clearance.
2. **Provider identity is unresolved:** administrator must review the existing Sandbox project/origins and rename it without silently changing account ownership or credentials.
3. **Production journal is ephemeral:** do not redeploy the current free Render instance before safely retaining its replay/payment state. Fresh daemon startup intentionally refuses unsafe storage. Access requests depend on that deployment too.
4. **Permission/device acceptance is gated:** Agent #2 needs an explicitly approved renewal; live revocation/payment rejection and actual device sign-in remain unverified. Reuse token 2 instead of registering a duplicate.

No support message, portal change, video publication, wallet signature, new transaction, contract deployment or permission change was performed by this task. Git push is authorized; actual frontend auto-deployment evidence is recorded separately. Render was not redeployed.

## Next three actions

1. **Project owner/provider administrators:** submit the prepared MetaMask review and correct/review the existing Dynamic environment. Recheck the deployed classification and actual wallet UI; proceed with wallet tests only after clearance.
2. **Hosting operator/project owner:** follow the retained-journal migration procedure, authorize paid persistent hosting if chosen, export the old state before replacement, deploy the updated daemon and verify restart/recovery/access API health. Manually submit the prepared source files to Monadscan and record each accepted result.
3. **Human tester/submission owner:** after the gates clear, approve Agent #2 renewal and explicit revoke/blocked-payment test, complete physical passkey enrollment/sign-in/reload, record both videos, verify signed-in eligibility/deadline and submit the entry. Save actual receipts, device observations and portal confirmation.
