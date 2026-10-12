# Request access to the Monad Observer

This feature lets another wallet ask Agent #1’s current owner for expiring task authority. Requests and decisions are stored by the daemon and appear in the header’s **Access notifications** inbox. Connecting a wallet or sending a request does not grant authority.

## October 12 backend deployment

Backend release `06fa439ab84f2f38414654124c04a7f62dee677d` is deployed at [the Render service](https://monad-astheris-daemon.onrender.com/health). It became active at `2026-10-12T18:41:46Z`. At `18:43:26Z`, `/health`, `/v1/config`, `/v1/access-requests/config`, the frontend access proxy, and the Agent #2 demo configuration all returned HTTP 200. Task submission was enabled and the batch worker was running. The missing inbox API is now deployed. A brief empty 503 was observed immediately after activation before these successful checks; these observations do not establish uninterrupted availability.

The operator explicitly selected the free Render plan with temporary testnet storage. The journal was newly created; old local task receipts were not migrated. Requests, decisions and inbox history can disappear when the instance restarts or is replaced. On-chain delegations and payments remain on-chain. See [the temporary deployment policy](../../docs/daemon-durability.md). Public readiness checks do not replace the two-wallet request/approval/denial acceptance test below.

The follow-up production browser run passed **21/21** read-only checks at `18:44:22–18:44:41Z`, at 1440 and 390 pixels. The access panel and notification dialog offered wallet connection, both configuration endpoints matched the deployed chain/router/registry, and there were no stale outage messages, horizontal overflow, browser exceptions or access mutation attempts. No wallet connection, signature, request or decision was submitted. Backend validation passed 59 tests, formatting, Clippy and all 73 shared ABI checks; all four CI jobs passed for the release.

## Earlier October 12 deployment check

The screenshot's unavailable inbox is a deployment mismatch, not a wallet permission failure. At `2026-10-12T12:23:50Z`, Render still served commit `59b115336da2c9e5dedb79d7c17eb72d5f761a1c` with automatic deployment disabled. Its `/health` returned 200, but `/v1/access-requests/config` returned 404. Vercel's `/api/access-requests/config` consequently returned 503. A running task worker does not imply the newer access-request API is deployed.

The frontend checks service availability before offering inbox authentication. **Check availability** retries only the public configuration GET; it does not connect a wallet, sign a message, send a request or approve access. It pauses existing private inbox polling and seen updates until an explicit inbox refresh. Once the current backend is safely deployed and configured, this check exposes the normal connect/unlock flow again. Existing inbox history and approval recovery hints remain intact during outages.

For a future durable deployment, follow the [retained-journal deployment procedure](../../docs/daemon-durability.md), then verify both configuration endpoints return 200 with the matching chain/router/registry and complete the two-wallet acceptance test below. The free Render instance has no durable disk; its explicitly accepted temporary-storage deployment above does not satisfy durable retention.

Local verification on October 12 passed the production build, TypeScript, 15 targeted access tests, and 10 read-only browser checks at 1440 and 390 pixels. Browser checks covered the unavailable panel and notification inbox before authentication, public GET retries, absence of wallet prompts and access mutations, and horizontal layout. They did not sign in, send requests or grant access. The backend route remains unavailable, so this is outage-handling evidence rather than an end-to-end access acceptance test.

## Requester

1. Open **Agent directory → Observer workspace → Request Observer access**. Connect the wallet that will sign tasks and pay for them.
2. Choose **Unlock access requests** and review the `AetherisAccess` message in your wallet. It opens your private inbox for 15 minutes on Monad Testnet (`10143`), without a transaction or token payment. After expiry, unlock the inbox again; it does not repeatedly prompt in the background.
3. Choose **1 hour, 6 hours, 24 hours or 7 days**, add a reason of up to 500 characters, then **Send access request**. The connected address is included automatically. The owner receives the wallet address, agent ID, reason, duration and request time. Do not include secrets in the reason.
4. Open the header bell to follow the decision. **Awaiting review** means no authority has been granted. **Confirming approval** means a delegation is still being verified. **Approved** includes its transaction and access expiry. A denial can include the owner’s note.
5. After approval, choose **Check access again** by the Observer’s paid action. The task still needs your own testnet USDC and the task/payment signatures. Access to Agent #1 does not transfer its identity or give either party control of the other’s wallet funds.

The grant can expire, be revoked, or become invalid when the agent changes owner. The inbox keeps the decision history and reports whether authority is still active. The separate self-service flow for registering and running your own agent remains available without waiting for Agent #1’s owner.

## Owner

1. Connect Agent #1’s current owner wallet and open **Access notifications**, or select **Review requests** in the Observer workspace. Unlock the inbox with its wallet message.
2. Filter **Incoming**. Review the full requester address, reason, duration and agent ID. **Approve access** uses those request details; you do not need to copy an address into the manual delegation form.
3. Review the approval prompt. An ordinary owner confirms `setDelegate(agentId, requester, expiresAt)` in their wallet on Monad Testnet. The current Agent #1 owner is also a daemon relayer, so **Sign approval** asks for a narrowly scoped `AccessApproval` signature covering the exact request, recipient, expiry, ownership epoch and deadline. The daemon then submits that delegation through its coordinated transaction queue. This avoids competing nonce submissions from the browser and daemon.
4. Wait for a successful transaction and the backend’s receipt/authority checks. Only then is the request **Approved**. The requester’s inbox receives the outcome and explorer link. A signature alone is not a confirmed delegation.
5. To refuse, select **Deny request**, optionally write a note, then **Confirm denial**. Denial does not send a blockchain transaction; the requester receives the decision in their inbox.

Notifications are in-app. The app does not send email or push notifications when closed. The unlocked inbox refreshes about every 15 seconds while the app is active. Incoming requests remain available after their unread badge clears. Large inboxes have **Previous page / Next page** controls; filters and unread counts apply to the displayed page, as labelled.

## Recover an interrupted approval

For an ordinary owner wallet, the app saves an approval intent before asking the wallet to send, then saves the transaction hash if returned. Preserve this browser storage when a wallet response or connection is interrupted.

- When a saved hash is available, **Recover approval transaction → Verify saved transaction** checks the existing receipt. It does not grant access twice.
- If the wallet submitted but the browser did not save its hash, copy the public hash from wallet activity into **Recover approval transaction**. Verification checks the exact delegate and expiry against the request.
- Only if you cancelled the wallet request and no transaction was submitted, tick that explicit confirmation and choose **Return request to review**. If unsure, inspect wallet activity first. Do not clear an uncertain approval and send another transaction.
- A relayed approval is followed by the daemon. If it remains unresolved, preserve its request/transaction identifiers for the operator rather than attempting another grant.

Refreshing saved status never proves a failed transaction succeeded. A pending request whose review window expired or whose owner changed needs fresh review. An earlier confirmed approval remains in the history even after its grant expires; it is shown with ended current authority.

## Operator deployment

Deploy the updated frontend and daemon together. The frontend uses its server-only `DAEMON_URL` to proxy the access configuration and authenticated inbox actions to the daemon’s `/v1/access-requests` endpoints. The daemon and frontend must agree on chain `10143`, router and identity registry. Access requests do not require a new contract, per-user environment allowlists, or a separate hosted inbox service.

Keep `DAEMON_URL`, server RPC credentials and signing keys server-side. Only public contract/network settings belong in `NEXT_PUBLIC_*` variables. A daemon without these new endpoints produces an explicit access-service-unavailable state; the frontend must not claim a request was sent.

Configure `DATABASE_PATH` on a persistent mounted disk and retain that disk across redeploys. The existing redb database stores access requests and notification state alongside the execution journal. An ephemeral Render filesystem loses this state on replacement and does not satisfy cross-restart persistence. Back up the database using a consistent operator procedure and avoid opening one writable database from multiple daemon instances.

## Two-wallet acceptance test

Use test wallets on Monad Testnet and follow the existing [manual test guide](manual-test-guide.md), including any unresolved site-security prerequisite. Test against the new deployment; these steps are a test procedure, not a claim that a live request has already been sent.

| Test | Expected result |
| --- | --- |
| Requester unlocks and sends a reason + 1-hour request | No delegation transaction or payment is sent; the request is pending and includes that wallet automatically. |
| Owner opens the inbox on another device | The pending request and full approval details appear from shared backend storage. |
| Duplicate request while one is pending | The existing request is preserved; the owner does not get duplicate pending entries. |
| Owner denies with a note | Requester sees **Denied** and the note after refresh; task authority stays absent. |
| Requester sends again; owner approves | The owner reviews the exact recipient and duration. Only a verified on-chain delegation becomes **Approved**, with a matching explorer link and expiry. |
| Wallet rejects an approval prompt | No success is shown. Safe cancellation/recovery instructions preserve uncertain submissions. |
| Unrelated wallet opens its inbox | It cannot read or decide the other wallets’ private requests. |
| Switch account with the inbox open | Previous-account requests disappear; the new wallet must unlock its own inbox. |
| Permission is revoked or expires | The decision history remains, while current authority is shown as ended. The paid task preflight rejects new work. |
| Daemon restarts using the same persistent database | Requests, decisions and unread state remain; no duplicate approval is submitted. |
| Browser reload during ordinary-wallet approval | Existing intent/hash is recovered, and no replacement grant is sent without resolving that intent. |

Record public request IDs, approval hashes, the displayed expiry and both wallets’ expected statuses. Exclude active authentication/approval signatures, private keys and recovery phrases from evidence.
