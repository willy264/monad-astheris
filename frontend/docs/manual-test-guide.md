# Test Aetheris as a user or judge

**Audit date: October 11, 2026.** Site: <https://monad-astheris.vercel.app/>. Network: **Monad Testnet, chain 10143**.

**Current prerequisite for wallet tests:** MetaMask's live domain scan returns `BLOCK`. Resolve the [website classification](../../submission/2026-10-11/wallet-security-review.md) before connecting or signing. Do not override a wallet warning. The no-wallet checks below can be performed in an isolated browser without a wallet extension, as in the audit. See the [readiness report](../../submission/2026-10-11/final-readiness.md) for remaining work.

## 1. Check the site without a wallet

| Check | What to do | Expected result |
| --- | --- | --- |
| Overview | Open `/`. Inspect **Registered agents** and **Agent stats**, then expand **Data source & freshness**. | Cards represent actual registered identities. At audit time: 2 agents and 22 completed lanes. The 22 verified-root total appears on Visualizer. These totals may increase. |
| Network chart | In **Network activity**, expand **View block samples**. | Every plotted point matches its block transaction count in the table. These are network-wide RPC samples, not agent revenue or performance claims. Unavailable samples show an explanatory empty state. |
| Header navigation and search | Use **Overview / Agent directory / Visualizer**. Enter `Checksum` in the header search and submit. | All three routes open; search opens `/agents?q=Checksum` and filters the first directory page. The header keeps wallet access visible on every route. |
| Agent shortcut | Select **View agent** on an Overview card. | The matching identity card opens in the directory; no registration or payment is submitted. |
| Guided preview | **Set up your agent** → **From sign-in to settlement** → **Guided preview** → **Preview passkey sign-in** → **Preview 5 task lanes**. | Five lanes finish as **Simulated**, without transaction links, signatures or charges. |
| Directory | Open `/agents`. Search `Checksum`, clear the search, then expand **Agent Card & endpoints**. | Agent #2 matches; clearing shows both agents at audit time. Cards show actual identity/capability data. `Unrated` is valid without reviews. |
| Observer | Inspect Agent #1's owner, IPFS card, MCP endpoint and indexed task history. | The Observer has separate ownership and permissions. A new user's wallet is not automatically authorized for it. |
| Access notifications | Open the header bell and the Observer’s **Request Observer access** panel. | The private inbox requires a connected wallet and message signature. It must not display invented requests or claim a delegation before approval. See the [two-wallet access-request test](access-requests.md#two-wallet-acceptance-test). |
| Illustration | Open `/visualizer`; switch **Standard EVM Mode** / **Aetheris Parallel Mode**, then **Pause animation**. | The explanatory animation changes and pauses. Its timing/collision figures are illustrative. |
| Real history | Scroll below the illustration; use **All / Created / Executed**, select a shard and open a transaction. | Real agent, task, shard and hashes appear. All 22 indexed tasks were executed at the final audit, so an empty Created filter is expected. |
| Commitments | Scroll to **Merkle commitments**. | Known batches show **Root matched** with explorer links. The latest-12 table can contain fewer rows than the total. |
| Mobile | Repeat navigation at about 390px wide or on a phone. | Cards/navigation remain usable without page-wide horizontal overflow. Wide ledger content may scroll within its own container. |

**Recent executions = 0** can be correct: it covers a recent block window. **Micropayments settled** counts verified homepage payments in this browser session, not all historical payments. The login overlay focus/semantics defect is repaired in the release source. Consult the [release record](../../submission/2026-10-11/final-readiness-release.json) for actual deployed keyboard checks; physical screen-reader speech remains a human test.

## 2. Prepare your wallet after security clearance

Your existing wallet is `0xce77b053D322ae8380aD2D0458f3605966EBDD22`. At the audit it owned **Agent #2**, with **5.907197238 MON + 20.979 USDC**: enough for another run. Another faucet request is unnecessary for this wallet. Its latest daemon executor permission expired at **2026-10-11 02:20:01 UTC**. Renew only after clearance and explicit approval. Recheck current balances and permission in the app.

For a new wallet, obtain testnet MON from the [Monad faucet](https://faucet.monad.xyz/) and USDC from the [Circle faucet](https://faucet.circle.com/), selecting **USDC → Monad Testnet** and the same connected address. At current policy each task costs **0.001 testnet USDC**, five cost **0.005**, and registration/delegation also need MON gas. Use a personal test wallet, distinct from daemon relayers.

Current payment token: `0x534b2f3a21130d7a60830c2df862319e593943a3`. Recipient: `0x5D8853E81F580A12e3Affaa9a7c76E0A65E02F57`. Review the displayed policy if configuration changes. No seed phrase or private key belongs in the app.

## 3. Run five real tasks

1. Choose **Set up your agent** on Overview, or open [live setup](https://monad-astheris.vercel.app/#interactive-demo) → **Live testnet** → **Connect wallet to begin**. Select Monad Testnet (`10143`), using **Switch network in wallet** if needed. Wallet login is separate from passkey enrollment.
2. Existing wallet: expand **Already own an agent? Use its token ID.**, enter **2**, then **Check ownership**. If setup already restores Agent #2, keep it. A genuinely new wallet uses **Register my agent**, approves the transaction and records its new token ID. No project-owner allowlist or per-user environment change is needed.
3. Choose **Authorize for 1 hour** for each displayed executor needing permission and approve the transaction. This grants task execution until expiry, without transferring the identity or wallet funds. Grants with less than ten minutes remaining require user-approved renewal before setup is ready.
4. Choose **Check balances & status**. Require **Ready to run**. If an earlier setup transaction is unresolved, use **Check saved transaction** and its original hash rather than submitting a duplicate.
5. Select **Run 5 checksum tasks**. Approve **five task authorizations and five payment authorizations**: ten signatures, separate from login/registration/delegation. Each payment must match the displayed token, receiver and amount.
6. Wait for all five lanes to say **Verified on Monad**. Open all receipt links and confirm successful Monad Testnet transactions. Save each public **Request ID** and execution hash. Green means the app checked creation/execution and the exact payment authorization with two confirmations.
7. Open `/agents` and `/visualizer`. Allow the refresh interval and indexer lag for tasks to appear. Five successful tasks add five historical lanes when no other users are running concurrently.
8. Wait for automatic batch publication and **Root matched**. A brief **Awaiting publication** / **Not published** state is expected. Batch count may rise by fewer than five if executions share a block. Persistent pending status needs operator investigation; another paid run is not a settlement fix.

This flow runs browser checksums. It does not invoke an AI model or Observer #1's MCP. Demonstrate the real signed payments, isolated task storage, receipts and indexing that the workload exercises.

## 4. Confirm recovery does not charge again

1. Note the five execution hashes and token balance, then reload in the same browser with the same wallet and agent.
2. Let saved receipts recheck automatically. Use **Recover saved status** if necessary. Yellow **Check saved status** means verification is pending, not that execution failed.
3. Require the same five hashes, no new task/payment signatures and no extra token payment. Recovery must not create five replacement tasks.
4. After an interrupted run, preserve saved records and use recovery. Persistent unknown requests, unavailable receipts or reconciliation-required results need operator investigation. Do not clear storage or create a new run to hide an unresolved payment.

Browser recovery does not establish that Render retains its daemon journal through restart. That remains a separate operator durability test.

## 5. Check permissions and rejection behavior

Perform these after the successful run. Record the selected agent/network, visible message and whether a wallet request appeared.

| Test | Expected result |
| --- | --- |
| A wallet without Agent #1 authority opens Observer #1 | Its paid action stays disabled. The wallet can request expiring access from the owner or continue with its own agent. Sending the request alone does not grant authority. |
| Wrong network | Setup requests switching to 10143; no task is submitted on the other network. |
| Reject registration/delegation | Show rejection or unresolved-transaction recovery instructions; never show confirmed permission without a receipt. |
| Reject task/payment signing before dispatch | Do not dispatch the five-task run. Preserve any uncertain state for reconciliation. |
| Expired executor permission | Require renewed authority before a new paid run; existing receipts remain readable. |
| Unfunded new wallet | Explain missing MON/token balance before a live run. Do not transfer away funds simply to manufacture this test. |

**Explicit revocation:** connect Agent #2's owner. Open the header wallet control / **Passkeys & task authority**, enter **Agent ID = 2** and the actual daemon executor shown in setup. Currently that is `0x5D8853E81F580A12e3Affaa9a7c76E0A65E02F57`; do not enter your own owner address. Choose **Authorization → Revoke access → Revoke executor**, approve, and save **Delegation confirmed → View transaction**. Require on-chain zero expiry and `isAuthorized(2, executor) = false`.

Return to Overview → **Check balances & status**. New runs must require authorization before payment prompts while completed receipts remain readable. If the grant was already expired, renew and confirm it first so the test demonstrates an actual permission transition. Reauthorize for one hour afterward if continuing. Waiting for expiry does not replace this explicit revocation test.

## 6. Test a physical passkey separately

Do this only after website-security resolution and checking Dynamic's project/origin/settings. Use a supported physical device and browser.

1. Connect your Dynamic account; header wallet → **Passkeys & task authority** → **Register a passkey**.
2. Complete Windows Hello, Touch ID, Face ID or the supported device prompt. Require successful registration. No prompt, or **Reauthentication flow closed**, is a failed test to record with browser/device details; a MetaMask signature alone does not pass.
3. **Open wallet profile**, check the credential in account security, and sign out.
4. Choose **Sign in with passkey** where available, complete a fresh device prompt and confirm the same account is restored. The header **Passkey sign-in** control may first open Dynamic's menu; opening that menu does not pass.
5. Save a recording of both ceremonies without exposing secrets. Keep this evidence separate from delegation/task receipts.

Authentication does not grant executor permission. Raw P-256 verification on the router is not claimed. Optional Mera/PRF testing is covered in the [technical demo guide](demo-guide.md#optional-mera-owner-accounts).

## 7. Optional Observer, feedback and validation checks

- **Trigger paid x402 task** requires Observer #1's owner/active delegate, using a signer distinct from daemon relayers. To obtain access, follow the [access-request guide](access-requests.md): send a request, review it from the owner’s inbox, then verify the approved or denied notification from the requester’s wallet. Recheck current authority rather than relying on an earlier wallet status. Judges can also inspect the existing Observer receipt; running their own agent does not depend on this owner approval.
- To test live MCP without any wallet, run `pnpm verify-mcp https://monad-astheris.vercel.app/api/mcp` from `scripts` with dependencies installed. Expect 11 passing checks. This is a free read, not another paid task.
- For reputation, an eligible independent reviewer must assess the actual output and supply a rating. Verify its transaction and directory result. Completion alone must not create a quality score.
- Inspect the existing validation request/response in [SUBMISSION_PROOF.md](../../SUBMISSION_PROOF.md). It is project-controlled byte/RPC integrity validation, not independent AI-quality approval or a TEE result.

## Rehearsal evidence checklist

- [ ] Site URL, date/time, browser/device, chain and reviewed/deployed revision.
- [ ] Public wallet, agent token ID, ownership and registration receipt if new.
- [ ] Active executor grant receipt and expiry.
- [ ] Five public request IDs, execution hashes and payment evidence.
- [ ] Same receipts after reload/recovery, with no extra payment.
- [ ] Indexed tasks and batch commitment receipts / **Root matched**.
- [ ] Revoke receipt, unauthorized state and blocked new use; renewed permission if needed.
- [ ] Physical enrollment/sign-in evidence or explicit pending status.
- [ ] Recording and submission fields checked against the organizer's actual rules.

Keep private keys, recovery phrases, service tokens and active signatures out of recordings and committed files. Preserve original request IDs when reporting errors. See the [operator runbook](../../docs/runbook.md) for service-side investigation.

## Suggested judge recording

The intended Monad Metropolis [project form](https://hackathon.monad.xyz/project) requests a **technical demo up to 3 minutes** and a separate **pitch up to 2 minutes**. Confirm the event and signed-in entry requirements. The portal's displayed submission deadline is **October 14, 2026, 04:59 WAT** (03:59 UTC). See the [requirements audit](../../docs/submission-readiness.md#submission-requirements-for-the-intended-event).

For the technical recording, after security clearance: spend about 20 seconds explaining the purpose and real testnet totals; 40 seconds showing your wallet, owned agent and executor grant; 60 seconds showing the actual task/payment approvals and five successful lanes; then 40 seconds opening a receipt, indexed shard and matching batch. Label edited waits honestly. Show enough of the self-service registration flow to establish that a new user needs no project-owner intervention; do not mint a duplicate agent merely for a repeated run. Use any remaining time for reload/recovery or permission revocation. Show a physical passkey only after it passes the separate test.

For the pitch, explain the team, the problem of coordinating paid agent work, why identity plus isolated storage and inspectable receipts help, and what is actually implemented. Describe browser checksums as the demonstration workload. Do not present illustrative timing or pending integrations as measured or completed capabilities.

## Final remediation acceptance checks

The [authentication guide](authentication-verification.md) records the exact Dynamic environment, provider-admin actions, keyboard checks and physical-device protocol. The [durability guide](../../docs/daemon-durability.md) is a separate operator task; do not redeploy the free Render service before retaining its journal. The owner notification API currently needs that updated daemon deployment.

For keyboard testing at 1440px and 390px, open sign-in with pointer and Enter. Require an accessible **Wallet access** dialog; initial focus must enter it, Tab/Shift+Tab must avoid background controls, and Escape/named close must return to the trigger. Repeat with the application's **Delegate task authority** dialog and a screen reader. Change its agent/executor, close it, then reopen the same selected executor row: the explicit selection must be restored. An active transaction must retain its recovery state.

For explicit revocation, first obtain security clearance and separate approval for each grant/revoke/restoration. Select existing Agent #2, choose **Authorize for 1 hour** for `0x5D8853E81F580A12e3Affaa9a7c76E0A65E02F57`, inspect the exact transaction and confirm. Use **Check balances & status**, save expiry and receipt, and verify readiness. From that executor row choose **Manage / revoke executor**, inspect the prefilled identity/address, select revocation and confirm only the intended zero-expiry transaction. Save its hash and finalized DelegateSet event, read expiry zero/unauthorized, then attempt a new run. Require rejection **before task/payment signing, paid forwarding or settlement**. Compare payment history/balance and receipt records; earlier receipts must remain accessible. Expiry alone does not satisfy this test. Restore only with separate approval.

Record physical passkey enrollment, subsequent sign-in, intended account and reload separately. Never publish credential IDs, WebAuthn payloads, login/task signatures or secrets. All these live acceptance steps remain **NOT VERIFIED** until actually performed; local automated rejection tests are not substitutes.
