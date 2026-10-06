# Connect a wallet and enable passkeys

Aetheris uses one Dynamic session across the overview, agent directory and visualizer. The global header's **Connect / Sign in with Passkey** button opens sign-in on every page. The connected wallet signs Monad Testnet transactions; signing in does not register an AI agent or grant an executor permission automatically.

## Public environment configuration

The app defaults to Aetheris's public Dynamic **sandbox** Environment ID:

```dotenv
NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=5ee665e4-6f64-43c1-9537-99d989371a80
```

The default lives in `lib/dynamic-config.ts`. To use a different Dynamic project, set this variable in Vercel's project settings for the relevant deployment environment and rebuild. A nonempty environment variable overrides the default. This UUID is public and is included in the browser bundle; it is not an API token. Never use a private key or an admin API token here.

## Dynamic dashboard setup

1. Select the same sandbox environment in Dynamic.
2. Under **Log in & User Profile**, enable **Passkey** authentication. Keep an initial sign-in method such as email enabled so new users can create an account before registering a passkey.
3. Under **Security**, allow the origin `https://monad-astheris.vercel.app`. For local development, allow `http://localhost:3000` separately. Origins do not include a path. Allow preview origins only if you intend to test authentication there.
4. Open the deployed dashboard and select **Connect / Sign in with Passkey** in the header. First-time users sign in through the enabled onboarding method and connect an EVM wallet.
5. Select the connected-wallet button, **Try passkey delegation** on the homepage, or **Delegate task authority** in the directory. In **Passkeys & task authority**, choose **Register a passkey** and complete your device's prompt on that domain. Later, use **Sign in with passkey** on the same site.

The app reads Dynamic's public project settings and disables passkey sign-in while that provider is disabled. Wallet passkey security and passkey login are separate settings. SDK network configuration selects Monad Testnet, chain **10143**. A completed device authentication and a wallet-signed delegation transaction still require the user's participation; loading the modal does not verify those steps.

The identity owner grants access by entering the agent ID, executor wallet and expiry in the access dialog. The app checks ownership and router/registry linkage before requesting approval. **Revoke access** sets that executor's expiry to zero. Closing the dialog or moving between pages does not itself revoke on-chain permission; use the revocation action or wait for expiry.

See Dynamic's [passkey authentication guide](https://www.dynamic.xyz/docs/react/authentication-methods/passkey), [security settings](https://www.dynamic.xyz/docs/platform/dashboard/security), and Vercel's [environment variable documentation](https://vercel.com/docs/environment-variables).

## Why the directory can be empty

The directory reads `totalSupply()` from the configured AgentRegistry in RPC mode, or the corresponding indexed count when Envio is configured. A successful response with zero identities means the selected source reports no registrations for that registry; an indexer may still be catching up. Wallet sign-in alone does not mint an identity. Register a real Agent Card with its capabilities and working service endpoint to populate the directory; empty results are not replaced by invented agents.

The deployed registry now contains **Aetheris Monad Observer, agent #1**. Its [registration record](../../contracts/deployments/10143.agent.json) and [MCP service guide](mcp-agent.md) identify the exact registry and endpoint. If a deployment still shows zero, compare its configured registry address with that record and refresh the directory.

Executor authorization also requires an existing agent ID owned by the connected wallet and testnet MON for the transaction. Passkey authentication does not sponsor gas or create execution authority by itself.

## Codex documentation MCP

```powershell
codex mcp add dynamic --url https://www.dynamic.xyz/docs/mcp
```

This connects Codex to Dynamic's documentation. It does not configure Vercel, enable a Dynamic authentication provider, or create application users. Newly configured MCP servers become available to Codex clients when they load the updated configuration.
