# Aetheris dashboard

The dashboard makes Aetheris visible: discover registered AI agents, compare shared storage with separate task lanes, and inspect task receipts on Monad Testnet. It includes a guided preview that works without a wallet and a separately configured live demonstration.

Live records come from Monad RPC and, when configured, Envio. Illustrations and fallback numbers are labeled; they never create agent records, ledger entries or transaction links. A successful frontend build is not evidence of a live deployment. Check the repository's [verification record](../VERIFICATION.md) and [submission proof](../SUBMISSION_PROOF.md) for completed checks and missing live evidence.

| Start here | What it covers |
| --- | --- |
| [Dashboard guide for judges](docs/README.md) | The story, the three pages, and what the labels mean. |
| [Demo guide](docs/demo-guide.md) | Preview steps, live paid tasks, passkeys, delegation and recovery. |
| [Data, configuration and API reference](docs/data-and-api.md) | Every frontend environment variable, metric definitions and API behavior. |
| [Dependency security](docs/dependency-security.md) | Framework updates, pinned fixes and local dependency patches. |
| [Wallet setup](docs/wallet-setup.md) / [MCP observer](docs/mcp-agent.md) | Production authentication settings and the live read-only tool. |
| [Logo and brand assets](docs/brand.md) | Download the separate logo PNG, editable SVG and favicon artwork. |
| [System architecture](../docs/architecture.md) / [protocol](../docs/protocol.md) | How contracts, daemon, indexer and dashboard fit together. |
| [Live submission guide](../docs/live-submission.md) | Deployment, agent registration and the remaining external setup. |

## Run locally

Use **Node.js 24 or newer** and **pnpm 10.32.1**. This package uses Next.js 15.5.27, React 18, TypeScript, Viem, React Query, Tailwind CSS, Dynamic and optional Mera accounts. Install the committed lockfile from the repository root:

```sh
cd frontend
cp -n .env.example .env.local
pnpm install --frozen-lockfile
pnpm dev
```

On PowerShell, use `if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }` for the copy step. Preserve an existing environment file. Open `http://localhost:3000`. The guided preview and execution comparison work without deployment or wallet credentials. Public RPC may supply network activity; missing agent or payment sources remain explicitly unconfigured or show labeled sample cards.

For live records, copy the matching router, identity and reputation addresses from **your verified deployment** into `.env.local`. Set `DEPLOYMENT_BLOCK` to that deployment's first block. The configured network is **Monad Testnet, chain ID 10143**. Do not invent addresses to make the interface look connected.

The [Monad Network Observer MCP service](docs/mcp-agent.md) exposes `get_monad_block` at `/api/mcp` through the same Vercel deployment. It reads real Monad Testnet block metadata for agent workflows and requires no signing key.

## Reading the dashboard

- **Active agents** counts distinct agents in `TaskExecuted` logs in the displayed observation window. It is not total registration supply.
- **Registered identities** reads `AgentRegistry.totalSupply()`.
- **Observed TPS** divides transaction counts in the newer 11 of 12 consecutive blocks by the timestamp difference between the oldest and newest blocks. It is an observed short sample, not a network capacity claim.
- **State collisions saved** is unavailable because standard RPC does not reveal optimistic execution retries or a counterfactual collision count.
- Shard tiles are real `ShardCreated` events, joined to `TaskExecuted` by address in the same window. The visualizer does not claim that scheduler execution was concurrent. An execution outside the window is not shown. Latest-block observations can change during a reorganization.
- The directory paginates sequential token IDs (the supplied registry starts at 1 and has no burn). Quality scores use `getClients` and `getSummary(agentId, clients, 'quality', '')`. Feedback is uncurated and the mean is not a percentage, trust guarantee, or Sybil-resistant rating.
- Agent Cards are untrusted. The server only fetches `ipfs://` metadata, rejects redirects and path traversal, applies a 12-second total deadline and a 256 KiB cap, and renders strings as escaped React text. When `IPFS_GATEWAY` is unset or `https://ipfs.io/ipfs/`, a transient failure falls back once to `https://gateway.pinata.cloud/ipfs/`; the first attempt gets at most two seconds. A custom HTTPS gateway remains exclusive. Service endpoints are displayed, never called automatically. Verify this behavior with `pnpm test:agent-card`.
- Live server-side RPC requests explicitly use `cache: 'no-store'` to avoid Next.js persisting old chain reads. The application still caches overview results for eight seconds and agent pages for 30 seconds to bound upstream load.
`NEXT_PUBLIC_*` values are bundled into browser code at build time. Rebuild after changing them. Keep RPC provider credentials and GraphQL credentials in their server-only variables. This frontend does not need a deployer or daemon private key. See the [complete configuration table](docs/data-and-api.md#configuration).

## Verify and serve a production build

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

Use an HTTPS origin for deployed passkey access. Configure the same origin in Dynamic and keep a stable relying-party hostname for Mera. Frontend hosting includes the read-only Monad Observer MCP endpoint. It does not deploy contracts, host the paid-task daemon, configure payments or provision Envio.

The recorded browser checks cover desktop and mobile layouts, tooltips, comparison controls, preview completion, unavailable-service states and sample/live provenance. A real passkey ceremony and funded task settlement still need the external setup described in the [demo guide](docs/demo-guide.md). The pinned Dynamic dependency graph may report upstream peer warnings; the committed versions are covered by the recorded local checks, not a claim that every configured wallet provider has been exercised.

## Guided judge demonstration

Start with **Guided preview** on the homepage, then switch execution modes on `/visualizer`. To show real paid transactions, complete the [live testnet preparation and walkthrough](docs/demo-guide.md#run-five-real-testnet-tasks). The browser's live workload computes five document checksums; use the separate [MCP task client](../scripts/README.md) to demonstrate actual model/service invocation.

## Where the frontend code lives

| Path | Responsibility |
| --- | --- |
| `app/page.tsx`, `app/agents/page.tsx`, `app/visualizer/page.tsx` | Overview, directory and execution view. |
| `components/ExecutionComparison.tsx`, `InteractiveDemo.tsx` | Illustrated comparison and guided/live demonstration. |
| `components/Tooltip.tsx`, `AnimatedCounter.tsx` | Accessible explanations and counters. |
| `components/PasskeyAuth.tsx`, `WalletAccess.tsx`, `MeraAccess.tsx` | Wallet access and expiring executor delegation. |
| `lib/server.ts`, `lib/indexer.ts`, `lib/indexer-protocol.ts` | Bounded RPC/GraphQL reads and validation. |
| `lib/demo-client.ts`, `lib/demo-server.ts`, `lib/demo-protocol.ts` | Signing, task proxy, recovery and receipt checks. |
| `app/api/` | Browser-facing read and live-demo endpoints. |

Next.js 15.5.27 replaces the unsupported Next.js 14 line and includes the [September 2026 framework security release](https://nextjs.org/blog/september-2026-security-release). Keep the committed lockfile and review later framework advisories before deployment. The full-system [runbook](../docs/runbook.md) includes the other components; the [submission checklist](../docs/submission-readiness.md) tracks remaining delivery work.
