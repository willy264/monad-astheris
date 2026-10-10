# Connect the live testnet demo

The homepage's **Live demo is not available yet** panel means `/api/demo/config` could not return a validated deployment and payment configuration. Passkey sign-in does not enable this service.

## October 10 recovery

Render was still suspended from the coordinated owner-wallet verification session. It was resumed after checking that the owner's latest and pending nonces both equaled `11` and the batch worker was disabled. Public `/health` and `/v1/config` now return **200** with chain `10143` and the expected router/payment policy. [Recorded service checks](../../submission/2026-10-10/demo-availability.json).

After the operator updated Vercel and redeployed, `/api/demo/config` returned **200 / enabled:true** at **11:36 UTC on October 10**, with the intended agent, contracts, relayer and payment policy. [Public endpoint response](../../submission/2026-10-10/demo-config-enabled.json). This supersedes the earlier 503 availability failure. Vercel's private environment settings were not inspected; the public response confirms the effective configuration.

The browser task wallet `0x44Cd39dCe9b074E27eFf4D914Ff9a3e182963605` is no longer authorized for Agent #1. Its previous grant expired October 7. MetaMask's domain scan still returned **BLOCK** on October 10. Resolve the [website classification](../../submission/2026-10-07/wallet-security-review.md) before attempting wallet signatures. No new task, payment or delegation was submitted during this recovery.

## Vercel Production settings

In the `monad-astheris` Vercel project, open **Settings → Environment Variables** and select **Production**. These values were checked against the resumed daemon's public configuration. All `DEMO_*` values and `DAEMON_URL` are server settings: keep their names exactly as shown, without a `NEXT_PUBLIC_` prefix.

```dotenv
# Keep disabled while website security review and signer setup are pending.
DEMO_ENABLED=false
DAEMON_URL=https://monad-astheris-daemon.onrender.com
DEMO_AGENT_ID=1
DEMO_TASK_RESOURCE=https://monad-astheris-daemon.onrender.com/v1/tasks
DEMO_PAYMENT_ASSET=0x534b2f3a21130d7a60830c2df862319e593943a3
DEMO_PAYMENT_RECEIVER=0x5d8853e81f580a12e3affaa9a7c76e0a65e02f57
DEMO_PAYMENT_MAX_AMOUNT=1000
DEMO_PAYMENT_ASSET_NAME=USDC
DEMO_PAYMENT_ASSET_VERSION=2
```

The existing public contract configuration must match this deployment:

```dotenv
NEXT_PUBLIC_ROUTER_ADDRESS=0xac4a33521b32122c9f014eac8800144dd9aa5ebe
NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS=0x754d7f2fd55a9841dbff248f9cb91d497116f231
NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS=0x8f1fe9beef6df891189355129bf48f073d9ab322
NEXT_PUBLIC_MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
DEPLOYMENT_BLOCK=67972561
```

Saving values in local `.env` files does not update Vercel. Redeploy Production after changing its environment variables. Never add the daemon relayer key or a task-wallet private key to frontend configuration.

## Enable and verify when the remaining blockers are resolved

1. Resolve the MetaMask website classification and verify the intended Dynamic project configuration.
2. Use a browser signing wallet separate from every daemon relayer. The owner wallet `0x5D8853E81F580A12e3Affaa9a7c76E0A65E02F57` is currently a relayer, so the browser task client deliberately rejects it as the payer/signer. The separate browser wallet needs an unexpired Agent #1 delegation and testnet USDC. Coordinate owner transactions with the running daemon, since they share the owner signer.
3. With the observed price, the homepage run needs **5,000 base units = 0.005 testnet USDC** for five tasks. The directory's single-task flow costs **1,000 base units = 0.001 testnet USDC**. Each task and payment still needs explicit signatures; no payment was made by configuring these values.
4. Set `DEMO_ENABLED=true` in Vercel Production and redeploy. A successful `/api/demo/config` response must contain `enabled:true`, chain `10143`, and the intended router, agent, relayer and payment policy. Setting only the flag is insufficient if the other fields are absent or mismatched.
5. Select **Check connection again** or reload after the deployment completes. If the endpoint still returns 503, inspect Vercel's configuration and function logs, compare the exact policy with daemon `/v1/config`, and verify that Vercel can reach Render. A free Render instance may need time to wake up; `/health` must recover before retrying the frontend.

Configuration success only establishes availability. A completed paid browser run requires verified task and payment receipts; historical CLI receipts are not evidence that this browser flow has run.

The daemon's current CORS origin still contains a placeholder. The browser demo uses same-origin Vercel API routes, whose server requests do not depend on browser-to-Render CORS. If direct browser access to Render is needed, separately configure Render's `CORS_ORIGIN=https://monad-astheris.vercel.app` and coordinate a restart while retaining the journal. The frontend configuration endpoint now succeeds through the existing proxy.
