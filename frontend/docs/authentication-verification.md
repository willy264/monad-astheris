# Authentication and executor verification — October 11, 2026

The production origin is `https://monad-astheris.vercel.app`. The current MetaMask domain block must be cleared before a human connects a wallet or signs. Opening the unauthenticated login overlay for keyboard inspection is not a passkey or wallet-authentication test.

## Dynamic project configuration

The public environment ID used by the frontend is `5ee665e4-6f64-43c1-9537-99d989371a80`. The live SDK settings endpoint reports `sandbox` and the display name `uiriamuzu`. It enables email and passkey sign-in. The app uses Dynamic 5.9.2, `connect-and-sign`, Ethereum wallet connectors, and an explicit Monad Testnet network override (chain 10143).

The public settings response accepts the production Origin header. This does not prove the complete origin allowlist is restrictive: that list is not present in the unauthenticated response. Dashboard defaults still include Ethereum Mainnet; the app's supported EVM-network override supplies Monad Testnet.

The local integration supplies an explicit Aetheris authentication-only `siweStatement`. This fixes the application-controlled message when deployed. The SDK prioritizes the provider's `general.displayName` over the `appName` prop, so adding `appName: 'Aetheris'` alone does not correct the provider identity. No provider settings or account ownership were changed.

The Dynamic project administrator must:

1. Open the existing project/environment identified above in the Dynamic dashboard. Confirm its ownership and intended use; do not create a replacement project just to change the name.
2. Change its display name to **Aetheris**. Keep Sandbox explicitly visible if this remains the intended testnet environment. A live-environment migration is a separate decision requiring account/credential continuity checks.
3. Verify the production origin is allowed in Security settings and remove unintended origins after reviewing preview/development needs. Verify the intended Monad Testnet network, email, external-wallet, and passkey methods.
4. Reload the deployed app in a fresh browser profile. Recheck the public settings, displayed identity, and sign-in statement. Do not mark branding resolved based solely on a local build.

Public provider settings do not expose a relying-party ID. The app passes no related-origin override to `useSignInWithPasskey`. Dynamic's server supplies WebAuthn registration/authentication options. Inspect the actual browser ceremony on the production origin; never infer successful device authentication from a MetaMask signature or from a dialog opening.

## Login overlay patch

Dynamic 5.9.2 already installs `react-focus-lock` in its portal. Its `whiteList` accepts only nodes inside the modal host, causing focus on a background control to be ignored rather than moved into the modal. The baseline live keyboard audit reproduced this at 1440 and 390 pixels: initial focus remained on **Connect wallet to begin**, and the first Tab reached the footer. The accessibility tree contained no dialog role.

`frontend/patches/@dynamic-labs__sdk-react-core@5.9.2.patch` repairs the existing provider trap, enables focus restoration, gives the container a **Wallet access** accessible name and modal dialog semantics, removes the pointer-only backdrop from keyboard navigation, and labels close/back/help controls. It does not install another focus trap or search/mutate provider DOM. Existing Escape/close behavior and the application's native delegation-dialog suspension remain in place. The patch is pinned to this SDK version; re-evaluate/remove it when upgrading after testing the upstream behavior.

A browser accessibility-tree check can prove the role and accessible name. An actual spoken screen-reader announcement still requires a human screen-reader test.

## Executor authorization and revocation

Guided setup supports **Already own an agent? Use its token ID**. Enter `2` and choose **Check ownership**; this uses chain reads and saves the verified selection without registering a duplicate. The task owner is `0xce77b053D322ae8380aD2D0458f3605966EBDD22`; the configured daemon executor is `0x5D8853E81F580A12e3Affaa9a7c76E0A65E02F57`. Current values must be checked immediately before any approved transaction.

The setup card now lists each executor's full public address, current state, and recorded UTC expiry. Zero expiry is shown as **Not authorized (not granted or revoked)** because the current mapping alone cannot prove a historical revocation. A current near-expiry grant is distinguished from an expired or invalid grant.

After security clearance and explicit human approval:

1. Connect the Agent #2 owner on Monad Testnet. Select Agent #2 and choose **Check balances & status**.
2. If renewing, choose **Authorize for 1 hour**. Compare the actual wallet transaction's router, agent ID, executor, and expiry with the displayed values before approval.
3. To revoke, choose **Manage / revoke executor** beside the daemon address. The permission dialog receives Agent #2 and the executor automatically. Choose **Choose executor revocation** or **Authorization → Revoke access**, then **Revoke executor**.
4. Inspect and approve the transaction only when authorized. The app waits for two confirmations and checks the exact `DelegateSet(agentId, delegate, expiresAt, owner)` event. Revocation requires expiry zero; a generic successful router transaction cannot be accepted instead.
5. Save the public transaction hash, check the expiry/`isAuthorized` state, and refresh setup. Attempting a new run must be blocked before task or payment signing. The server independently checks authority before forwarding to the paid daemon endpoint.
6. Record that no new settlement occurred. Recover an existing saved run and verify its original receipts are still accessible. Restore permission only if separately approved.

Local tests exercise owner checks, authorization expiry, explicit zero-expiry receipt matching, revoked signer/executor blocking before any prompt or paid forwarding, restoration, existing-agent selection, and preservation of historical records. These tests do not replace a real revoke receipt or live blocked-run evidence.

## Physical passkey acceptance

Use a supported current browser on the exact HTTPS production origin and a physical authenticator such as Windows Hello, Touch ID, Face ID, or a supported password manager. After wallet security clearance:

1. Record device/browser versions and UTC time without capturing account secrets, tokens, recovery phrases, or personal signatures.
2. Sign in to the intended Dynamic account. Record only an approved public account/wallet identifier so the account can be compared after reauthentication.
3. Open **Passkeys & task authority → Register a passkey**. Complete any separate account-verification prompt, then the actual device's WebAuthn enrollment prompt. If the provider does not return a confirmed account response, the UI must show a failure and must not report success.
4. Check **Open wallet profile → Account & Security** for the enrolled credential. Do not publish credential IDs or authenticator challenge/response payloads.
5. Sign out through the wallet menu, then choose **Sign in with passkey**. Complete the physical device prompt again.
6. Confirm the resulting account is the intended account, reload the page, and confirm the authenticated account is restored. Switch accounts or cancel a prompt to verify the UI does not attribute completion to the previous account.
7. Record authentication separately from any approved on-chain delegation. Sign-in does not grant executor permission and a wallet sign-in signature is not a WebAuthn ceremony.

Physical ceremony, authenticated reload, real account association, and spoken screen-reader behavior remain **NOT VERIFIED** until these human observations are recorded.

## Recorded local verification

The final production build passed **21/21** read-only browser assertions on October 11, 2026 at 1440 and 390 pixels. The checks cover pointer and keyboard opening, initial focus on the named close button, Tab and Shift+Tab cycling in the provider dialog, its accessibility-tree role/name, Escape and pointer close with focus restoration, and the native delegation dialog's focus/close behavior. Editing Agent ID and reopening the same delegation action resets the intended target. Native dialogs can transfer keyboard focus to browser chrome at a cycle boundary; background application controls remained excluded.

The local directory used a captured public production `/api/agents` response because the local runtime lacked live daemon configuration. Actual frontend/provider components and public Dynamic settings were used; wallet, authentication and physical passkey responses were not simulated. No connection, authentication, signatures or transactions were performed. The final scoped test rerun passed 78 tests; TypeScript also passed. Exact timestamps, commands, assertions and screenshots are recorded in `submission/2026-10-11/final-readiness-auth.json` and `final-auth-screenshots/`.

These local results do not establish the deployed release's behavior. Recheck the deployed revision after publication and keep the provider display-name, MetaMask clearance and physical passkey dependencies separate.
