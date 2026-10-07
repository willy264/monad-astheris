# Connect a wallet and enable passkeys

Aetheris uses one Dynamic session across the overview, agent directory and visualizer. The global sidebar's **Passkey sign-in** button opens sign-in on every page. The connected wallet signs Monad Testnet transactions; signing in does not register an AI agent or grant an executor permission automatically.

**Current blocker, October 7, 2026:** user screenshots show MetaMask classifying the production domain as malicious. Pause wallet connection/signing on that domain; the setup instructions below are not a reason to bypass the warning. The [review record and prepared support request](../../submission/2026-10-07/wallet-security-review.md) distinguish the unresolved classification from a confirmed Dynamic display-name mismatch. Physical enrollment/sign-in remains unverified.

## Public environment configuration

The app defaults to Aetheris's public Dynamic **sandbox** Environment ID:

```dotenv
NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=5ee665e4-6f64-43c1-9537-99d989371a80
```

The default lives in `lib/dynamic-config.ts`. To use a different Dynamic project, set this variable in Vercel's project settings for the relevant deployment environment and rebuild. A nonempty environment variable overrides the default. This UUID is public and is included in the browser bundle; it is not an API token. Never use a private key or an admin API token here.

## Dynamic dashboard setup

1. Select the same sandbox environment in Dynamic.
   Under **Settings → General**, verify that **Display Name** is **Aetheris**. The October 7 public settings check returned `uiriamuzu`, which explains the unexpected sign-in text. Correcting that dashboard value is pending and does not clear MetaMask's website classification. See [Dynamic's general settings](https://docs.dynamic.xyz/developer-dashboard/general).
2. Under **Log in & User Profile**, enable **Passkey** authentication. Keep an initial sign-in method such as email enabled so new users can create an account before registering a passkey.
3. Under **Security**, allow the origin `https://monad-astheris.vercel.app`. For local development, allow `http://localhost:3000` separately. Origins do not include a path. Allow preview origins only if you intend to test authentication there.
4. Open the deployed dashboard and select **Passkey sign-in** in the sidebar. First-time users sign in through the enabled onboarding method and connect an EVM wallet.
5. Select the connected-wallet button, **Try passkey delegation** on the homepage, or **Delegate task authority** in the directory. In **Passkeys & task authority**, choose **Register a passkey** and complete your device's prompt on that domain. Later, use **Sign in with passkey** on the same site.

The app reads Dynamic's public project settings and disables passkey sign-in while that provider is disabled. Wallet passkey security and passkey login are separate settings. SDK network configuration selects Monad Testnet, chain **10143**. A completed device authentication and a wallet-signed delegation transaction still require the user's participation; loading the modal does not verify those steps.

The identity owner grants access by entering the agent ID, executor wallet and expiry in the access dialog. The app checks ownership and router/registry linkage before requesting approval. **Revoke access** sets that executor's expiry to zero. Closing the dialog or moving between pages does not itself revoke on-chain permission; use the revocation action or wait for expiry.

See Dynamic's [passkey authentication guide](https://www.dynamic.xyz/docs/react/authentication-methods/passkey), [security settings](https://www.dynamic.xyz/docs/platform/dashboard/security), and Vercel's [environment variable documentation](https://vercel.com/docs/environment-variables).

## When registering a passkey appears to do nothing

Registration first checks whether Dynamic requires account reauthentication to add a credential. Complete that wallet-signature, OTP or MFA prompt before the browser asks to create the passkey. This is an authentication request; it is separate from the Monad delegation transaction. The app follows Dynamic's [credential-link step-up flow](https://www.dynamic.xyz/docs/react/authentication-methods/step-up-auth/overview).

Dynamic 5.9.2 can report **Reauthentication flow closed** after a successful wallet signature: it closes the sign-in window before its step-up callback finishes. Aetheris handles only that exact lifecycle error by rechecking Dynamic's `credential:link` permission once. Enrollment proceeds only when Dynamic explicitly reports that verification is no longer required and the signed-in account is unchanged. The same check also runs after an ordinary prompt completion. Cancellation, missing permission and check failures stop enrollment; there is no automatic repeat signature. The fix does not clear MetaMask's separate website classification, and a successful wallet signature alone does not establish passkey enrollment.

The access dialog stays visible while the native passkey prompt is pending, with progress and errors next to the button. On Windows, Windows Hello may request your PIN; another supported device or password manager may also be offered. Cancelled, blocked and duplicate-credential requests do not count as successful enrollment. A resolved SDK call without a verification response is shown as unconfirmed.

Use **Open wallet profile**, then **Account & Security**, to inspect and manage registered passkeys through Dynamic's own UI. After registration, sign out through the wallet menu and use **Sign in with passkey** on the same origin to verify actual sign-in. Keep the Agent #1 owner wallet connected when managing that identity: passkey authentication does not make a new embedded wallet its owner. This device ceremony must be performed by the user and cannot be inferred from frontend tests.

## Why the directory can be empty

The directory reads `totalSupply()` from the configured AgentRegistry in RPC mode, or the corresponding indexed count when Envio is configured. A successful response with zero identities means the selected source reports no registrations for that registry; an indexer may still be catching up. Wallet sign-in alone does not mint an identity. Register a real Agent Card with its capabilities and working service endpoint to populate the directory; empty results are not replaced by invented agents.

The deployed registry now contains **Aetheris Monad Observer, agent #1**. Its [registration record](../../contracts/deployments/10143.agent.json) and [MCP service guide](mcp-agent.md) identify the exact registry and endpoint. If a deployment still shows zero, compare its configured registry address with that record and refresh the directory.

Executor authorization also requires an existing agent ID owned by the connected wallet and testnet MON for the transaction. Passkey authentication does not sponsor gas or create execution authority by itself.

## Codex documentation MCP

```powershell
codex mcp add dynamic --url https://www.dynamic.xyz/docs/mcp
```

This connects Codex to Dynamic's documentation. It does not configure Vercel, enable a Dynamic authentication provider, or create application users. Newly configured MCP servers become available to Codex clients when they load the updated configuration.
