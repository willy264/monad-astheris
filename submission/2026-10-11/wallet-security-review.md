# MetaMask URL review request — prepared, not sent

Prepared October 11, 2026. Supersedes the [October 7 draft](../2026-10-07/wallet-security-review.md) for current evidence. Submit manually through [official MetaMask support](https://support.metamask.io/configure/wallet/security-alerts/), choosing the support path that does not require connecting the flagged wallet. Do not bypass the alert to collect evidence.

**Subject:** Manual URL classification review for Aetheris Monad Testnet application

Hello MetaMask Support,

Please review `https://monad-astheris.vercel.app/`, our Aetheris testnet application. Your public domain scan returned HTTP 200 with `recommendedAction: BLOCK` at **2026-10-11T13:22:20.565Z**. Users also reported the malicious-site warning. We have not established the reason and are not asking users to override it. Please provide the reason/category and any remediation required before wallet access can resume safely.

Public repository: https://github.com/willy264/monad-astheris. Baseline audited revision: `5b4b19d1a544ce7b063c7f099f783c745b2d0277`. Remediation commit `537fdef4f757cb4d45f9eb2807e2f44426637496` automatically deployed through Vercel at 15:15:47 UTC and passed 13 live no-wallet walkthrough checks plus 21 keyboard/dialog checks. The current recheck still returns BLOCK, as recorded in the release evidence. The remediation release and deployment observations are recorded in [final readiness](final-readiness.md) and its linked release record. Do not assume local changes were deployed before reading that record.

The application uses Dynamic authentication and Viem on Monad Testnet (10143), with scoped task delegation and exact x402/EIP-3009 testnet USDC payments. Current source does not request recovery phrases or private keys. A connected wallet does not automatically authorize another agent. Signed task/payment authorizations, login and on-chain grants are distinct operations. These design statements do not establish that the domain is safe or cleared.

Our bounded review covered HTTP redirects, public DNS, deployed headers, initial scripts, links, wallet call sites, public provider configuration, package advisories and protocol receipts. The three primary pages returned 200 with HSTS, frame denial, nosniff and strict-origin referrer policy; HTTP redirected to HTTPS. Initial server-rendered script tags were same-origin. We found no unexpected source-level injected-script/redirect or secret-collection pattern in the reviewed app directories. This is not an independent security audit or a forensic assessment of hosting-account compromise. Dynamic's public environment still identifies itself as Sandbox and advertises `uiriamuzu`; the provider administrator must reconcile that identity separately.

Application-side dependency remediation upgraded sharp and postcss-selector-parser, and added prototype-safe JSON assembly to an existing local stream-json patch. Existing bigint-buffer/braces/filter mitigations remain. The version-based frontend audit still reports five advisories (two high, three moderate); their precise mitigation/applicability limits are [documented](../../frontend/docs/dependency-security.md). No causal connection between those findings and your BLOCK decision is established. Frontend, daemon, contract, interface and read-only MCP checks are recorded in the final report. Passing tests and historical payments are not evidence of clearance.

Evidence: [timestamped public scan/headers/DNS](final-readiness-public.json), [authentication configuration](final-readiness-auth.json), [verified transactions](verified-transactions.md), and [test/deployment status](final-readiness.md). Original user screenshots may be attached manually after reviewing them for account identifiers the user does not want public.

Please reassess the current deployment and advise what remains. We will recheck the public classification and actual wallet warning before inviting wallet-connected testing.

**Submission status: NOT SENT. Provider response: NOT VERIFIED. Domain clearance: BLOCKED.**
