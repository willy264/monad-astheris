# Aetheris dashboard

Next.js 14 App Router, TypeScript, React Query, Viem, Tailwind CSS, Dynamic wallet authentication and optional Category Labs Mera passkey accounts. The dashboard reads actual Monad Testnet state through Envio when configured, with an explicitly labeled RPC fallback otherwise. It contains no seed agents, generated performance numbers or simulated execution events. Use **Node 24 or newer** for the Mera dependency.

For the complete system setup and current submission gaps, see the [runbook](../docs/runbook.md) and [submission checklist](../docs/submission-readiness.md).

## Run

```sh
cp .env.example .env.local
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
```

Set the three `NEXT_PUBLIC_*_ADDRESS` values to the matching contracts from your deployment. Set `DEPLOYMENT_BLOCK` to its block. The configured network is **Monad Testnet, chain 10143**; RPC reads reject a mismatched network. Client variables are compiled at build time. Only `MONAD_RPC_URL` may contain a private provider key. Never put a signing key or a Dynamic API secret into a public variable.

The server API uses short-lived in-memory request coalescing, RPC timeouts, bounded event windows, capped directory pages, and four-agent fetch batches. React Query polls the overview every 12 seconds and cancels HTTP requests when abandoned. Load-balancer rate limiting is recommended for a public service; caches are local to a server process.

## Envio GraphQL

Set **server-only** `ENVIO_GRAPHQL_URL` to the deployed indexer's `/v1/graphql` endpoint. Optional `ENVIO_GRAPHQL_ADMIN_SECRET` and `ENVIO_GRAPHQL_TOKEN` configure server-side access; neither may use a `NEXT_PUBLIC_` prefix. HTTPS is required outside localhost, redirects are rejected, requests time out after 8 seconds and response bodies are capped at 1 MiB. Upstream diagnostics/credentials are not forwarded to browser error messages.

The indexer must use this repository's current schema, including `SyncStatus`, and provide read and aggregate access for `Agent` and `TaskExecution`. Every query filters by the configured chain/router/identity scope; returned entity identifiers, addresses, hashes, counts and block ranges are validated. The API rejects data from a different deployment and verifies the router's identity registry through RPC.

Overview/visualizer activity comes from indexed shards and execution aggregates; the directory reads indexed identities, then enriches their IPFS metadata and reputation through the existing bounded fetch path. Counts use aggregates rather than truncated result lists. At most 200 recent shards and 12 Merkle batches are returned; truncation is labeled. `SyncStatus` gives the previous fully processed block. The dashboard shows indexed progress and lag relative to RPC; that observation is not a consensus-finality claim.

Roots are labeled **Root matched** only when the canonical block batch ID, calculated root, leaf count and block range agree with the separate indexed `BatchCommitment` marked verified. This is an indexer's log-consistency check, not proof of task correctness or an independent trustless verification of the indexer. RPC still supplies network throughput, deployment checks and reputation.

With no Envio endpoint, the dashboard explicitly displays **RPC fallback** and cannot establish independently indexed Merkle verification. If an endpoint is configured but inaccessible, unauthorized or incompatible with the schema, the API returns a visible 503 error; it does not silently replace indexed results with RPC data. No live GraphQL service is bundled or deployed automatically.

## Reading the dashboard

- **Active agents** counts distinct agents in `TaskExecuted` logs in the displayed observation window. It is not total registration supply.
- **Registered identities** reads `AgentRegistry.totalSupply()`.
- **Observed TPS** divides transaction counts in the newer 11 of 12 consecutive blocks by the timestamp difference between the oldest and newest blocks. It is an observed short sample, not a network capacity claim.
- **State collisions saved** is unavailable because standard RPC does not reveal optimistic execution retries or a counterfactual collision count.
- Shard tiles come from actual indexed entities or, in RPC fallback, `ShardCreated` events joined to `TaskExecuted` in the same window. The visualizer does not claim that scheduler execution was concurrent. An execution outside the fallback window is not shown. Observations can change during a reorganization.
- The directory paginates indexed identities when configured, or sequential token IDs in RPC fallback (the supplied registry starts at 1 and has no burn). Quality scores use `getClients` and `getSummary(agentId, clients, 'quality', '')`. Feedback is uncurated and the mean is not a percentage, trust guarantee, or Sybil-resistant rating.
- Agent Cards are untrusted. The server only fetches `ipfs://` metadata through `IPFS_GATEWAY`, rejects redirects and path traversal, applies a 6-second timeout and a 256 KiB cap, and renders strings as escaped React text. Service endpoints are displayed, never called automatically.

## Dynamic passkeys and executor delegation

Create a Dynamic project, enable EVM wallets and Monad Testnet, allow your deployment origin, configure embedded-wallet/passkey authentication and recovery in the Dynamic dashboard, then set `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID`. Use HTTPS in deployed environments (WebAuthn requires a secure context; localhost is allowed). The optional wallet module is loaded only when configured.

`PasskeyAuth.tsx` exposes Dynamic's authentication UI, with explicit `useSignInWithPasskey` and `useRegisterPasskey` actions from SDK 5.9.2. Dynamic performs WebAuthn challenge/origin validation, credential handling, and wallet access; this application does not extract a P-256 private key, derive an EVM private key from a passkey, or claim to verify raw P-256 signatures onchain. Credential algorithms are selected by the Dynamic WebAuthn service. Supported sign-in choices depend on your Dynamic environment and wallet. A Dynamic account session alone does not authorize an agent.

After sign-in, the identity owner can submit `AetherisRouter.setDelegate(agentId, executor, expiresAt)`. The module checks ownership, switches to Monad Testnet, simulates the exact call, asks the wallet to sign, and waits for a successful receipt. Select **Revoke access** to set expiry to zero. Delegation permits the specified executor to route tasks for that agent; it is scoped to the router/agent and expiry, not a token allowance or an arbitrary wallet delegation. The contract remains authoritative for all permissions.

Dynamic sign-in requires a real environment. Actual wallet signing, passkey registration, and funded testnet transactions require user credentials and are not possible with an unconfigured checkout.

The pinned Dynamic 5.9.2 dependency graph reports upstream peer-version warnings for its forward-MPC client and Base account connector; an older transitive WebSocket package also reports an optional UTF-8 validator peer mismatch. TypeScript, the production build, and dashboard browser checks pass with the committed lockfile. Configured wallet/passkey flows still require validation against your Dynamic environment; no dependency overrides conceal these warnings.

## Optional Mera accounts

Set `NEXT_PUBLIC_MERA_ENABLED=true` and rebuild to expose a separate Mera module below Dynamic. `@category-labs/mera` **0.2.0** creates/signs in with a discoverable passkey using the WebAuthn PRF extension. The default relying-party ID is the current hostname; `NEXT_PUBLIC_MERA_RP_ID` can select a valid parent domain. Use a stable HTTPS origin and a PRF-capable authenticator. Localhost is allowed for development. An account created on one RP cannot be recovered by simply changing the RP setting on another site.

The implementation follows Category Labs' documented account mapping: PRF entropy -> BIP-39 seed -> BIP-32 path `m/44'/60'/0'/0/0` -> `createSecp256k1SigningSession` -> `toViemAccount`. This produces an ordinary EVM EOA, not a raw P-256 onchain signature. It is distinct from Dynamic; neither account automatically owns an existing agent.

After creation/sign-in, only the public address/credential identifier remain in React memory. Each delegation/revocation validates chain, router identity and NFT ownership, simulates the call, requests a fresh passkey ceremony, derives the same account and signs the displayed router permission. The Mera account needs testnet MON and must own the agent identity. The signing session ends immediately after submission, on errors and on unmount/page exit. PRF/seed/key byte buffers are cleared; no secret, mnemonic or session is placed in browser storage. JavaScript strings and intermediate library allocations cannot be guaranteed to be zeroized, and this does not protect against hostile code running on the origin.

No account recovery service or private-key export UI is included. Keep access to the passkey provider and origin. Mera is a preview SDK. Local SDK tests check deterministic derivation, Ethereum signature recovery and session disposal; they are not evidence of a live browser PRF ceremony or a funded onchain delegation. Those require a compatible authenticator and configured deployment.

## References

- [Monad Testnet network information](https://docs.monad.xyz/developer-essentials/testnet)
- [Dynamic context provider](https://docs.dynamic.xyz/react-sdk/providers/dynamiccontextprovider)
- [Dynamic EVM wallet client](https://docs.dynamic.xyz/wallets/using-wallets/evm/evm-wallets)
- [Dynamic embedded wallet authentication](https://docs.dynamic.xyz/wallets/embedded-wallets/create-embedded-wallets)
- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004)
- [Mera official repository](https://github.com/category-labs/mera)
- [Mera account derivation and setup](https://github.com/category-labs/mera/blob/main/docs/src/content/docs/getting-started.mdx)
- [Mera Viem transaction recipe](https://github.com/category-labs/mera/blob/main/docs/src/content/docs/recipes/send-a-transaction-with-viem.md)

Next 14.2.35 is pinned as the latest published 14.x patch available during generation. Next 14 is an older major retained to satisfy this workspace's requested architecture; review framework support and security updates before exposing a production deployment.
