# Aetheris dashboard

Next.js 14 App Router, TypeScript, React Query, Viem, Tailwind CSS, and Dynamic wallet authentication. The dashboard reads actual Monad Testnet state. It contains no seed agents, generated performance numbers, or simulated execution events.

For the complete system setup and current submission gaps, see the [runbook](../docs/runbook.md) and [submission checklist](../docs/submission-readiness.md).

## Run

```sh
cp .env.example .env.local
pnpm install
pnpm dev
pnpm typecheck
pnpm build
```

Set the three `NEXT_PUBLIC_*_ADDRESS` values to the matching contracts from your deployment. Set `DEPLOYMENT_BLOCK` to its block. The configured network is **Monad Testnet, chain 10143**; RPC reads reject a mismatched network. Client variables are compiled at build time. Only `MONAD_RPC_URL` may contain a private provider key. Never put a signing key or a Dynamic API secret into a public variable.

The server API uses short-lived in-memory request coalescing, RPC timeouts, bounded event windows, capped directory pages, and four-agent fetch batches. React Query polls the overview every 12 seconds and cancels HTTP requests when abandoned. Load-balancer rate limiting is recommended for a public service; caches are local to a server process.

## Reading the dashboard

- **Active agents** counts distinct agents in `TaskExecuted` logs in the displayed observation window. It is not total registration supply.
- **Registered identities** reads `AgentRegistry.totalSupply()`.
- **Observed TPS** divides transaction counts in the newer 11 of 12 consecutive blocks by the timestamp difference between the oldest and newest blocks. It is an observed short sample, not a network capacity claim.
- **State collisions saved** is unavailable because standard RPC does not reveal optimistic execution retries or a counterfactual collision count.
- Shard tiles are real `ShardCreated` events, joined to `TaskExecuted` by address in the same window. The visualizer does not claim that scheduler execution was concurrent. An execution outside the window is not shown. Latest-block observations can change during a reorganization.
- The directory paginates sequential token IDs (the supplied registry starts at 1 and has no burn). Quality scores use `getClients` and `getSummary(agentId, clients, 'quality', '')`. Feedback is uncurated and the mean is not a percentage, trust guarantee, or Sybil-resistant rating.
- Agent Cards are untrusted. The server only fetches `ipfs://` metadata through `IPFS_GATEWAY`, rejects redirects and path traversal, applies a 6-second timeout and a 256 KiB cap, and renders strings as escaped React text. Service endpoints are displayed, never called automatically.

## Dynamic passkeys and executor delegation

Create a Dynamic project, enable EVM wallets and Monad Testnet, allow your deployment origin, configure embedded-wallet/passkey authentication and recovery in the Dynamic dashboard, then set `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID`. Use HTTPS in deployed environments (WebAuthn requires a secure context; localhost is allowed). The optional wallet module is loaded only when configured.

`PasskeyAuth.tsx` exposes Dynamic's authentication UI, with explicit `useSignInWithPasskey` and `useRegisterPasskey` actions from SDK 5.9.2. Dynamic performs WebAuthn challenge/origin validation, credential handling, and wallet access; this application does not extract a P-256 private key, derive an EVM private key from a passkey, or claim to verify raw P-256 signatures onchain. Credential algorithms are selected by the Dynamic WebAuthn service. Supported sign-in choices depend on your Dynamic environment and wallet. A Dynamic account session alone does not authorize an agent.

After sign-in, the identity owner can submit `AetherisRouter.setDelegate(agentId, executor, expiresAt)`. The module checks ownership, switches to Monad Testnet, simulates the exact call, asks the wallet to sign, and waits for a successful receipt. Select **Revoke access** to set expiry to zero. Delegation permits the specified executor to route tasks for that agent; it is scoped to the router/agent and expiry, not a token allowance or an arbitrary wallet delegation. The contract remains authoritative for all permissions.

Dynamic sign-in requires a real environment. Actual wallet signing, passkey registration, and funded testnet transactions require user credentials and are not possible with an unconfigured checkout.

The pinned Dynamic 5.9.2 dependency graph reports upstream peer-version warnings for its forward-MPC client and Base account connector; an older transitive WebSocket package also reports an optional UTF-8 validator peer mismatch. TypeScript, the production build, and dashboard browser checks pass with the committed lockfile. Configured wallet/passkey flows still require validation against your Dynamic environment; no dependency overrides conceal these warnings.

## References

- [Monad Testnet network information](https://docs.monad.xyz/developer-essentials/testnet)
- [Dynamic context provider](https://docs.dynamic.xyz/react-sdk/providers/dynamiccontextprovider)
- [Dynamic EVM wallet client](https://docs.dynamic.xyz/wallets/using-wallets/evm/evm-wallets)
- [Dynamic embedded wallet authentication](https://docs.dynamic.xyz/wallets/embedded-wallets/create-embedded-wallets)
- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004)

Next 14.2.35 is pinned as the latest published 14.x patch available during generation. Next 14 is an older major retained to satisfy this workspace's requested architecture; review framework support and security updates before exposing a production deployment.
