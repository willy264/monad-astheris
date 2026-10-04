# Aetheris dashboard

The dashboard makes Aetheris visible: discover registered AI agents, compare shared storage with separate task lanes, and inspect task receipts on Monad Testnet. It includes a guided preview that works without a wallet and a separately configured live demonstration.

Live records come from Monad RPC and, when configured, Envio. Illustrations and fallback numbers are labeled; they never create agent records, ledger entries or transaction links. A successful frontend build is not evidence of a live deployment. Check the repository's [verification record](../VERIFICATION.md) and [submission proof](../SUBMISSION_PROOF.md) for completed checks and missing live evidence.

| Start here | What it covers |
| --- | --- |
| [Dashboard guide for judges](docs/README.md) | The story, the three pages, and what the labels mean. |
| [Demo guide](docs/demo-guide.md) | Preview steps, live paid tasks, passkeys, delegation and recovery. |
| [Data, configuration and API reference](docs/data-and-api.md) | Every frontend environment variable, metric definitions and API behavior. |
| [System architecture](../docs/architecture.md) / [protocol](../docs/protocol.md) | How contracts, daemon, indexer and dashboard fit together. |
| [Live submission guide](../docs/live-submission.md) | Deployment, agent registration and the remaining external setup. |

## Run locally

Use **Node.js 24 or newer** and **pnpm 10.32.1**. This package uses Next.js 14.2.35, React 18, TypeScript, Viem, React Query, Tailwind CSS, Dynamic and optional Mera accounts. Install the committed lockfile from the repository root:

```sh
cd frontend
cp .env.example .env.local
pnpm install --frozen-lockfile
pnpm dev
```

On PowerShell, use `Copy-Item .env.example .env.local` for the copy step. Open `http://localhost:3000`. The guided preview and execution comparison work without deployment or wallet credentials. Public RPC may supply network activity; missing agent or payment sources remain explicitly unconfigured or show labeled sample cards.

For live records, copy the matching router, identity and reputation addresses from **your verified deployment** into `.env.local`. Set `DEPLOYMENT_BLOCK` to that deployment's first block. The configured network is **Monad Testnet, chain ID 10143**. Do not invent addresses to make the interface look connected.

`NEXT_PUBLIC_*` values are bundled into browser code at build time. Rebuild after changing them. Keep RPC provider credentials and GraphQL credentials in their server-only variables. This frontend does not need a deployer or daemon private key. See the [complete configuration table](docs/data-and-api.md#configuration).

## Verify and serve a production build

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

Use an HTTPS origin for deployed passkey access. Configure the same origin in Dynamic and keep a stable relying-party hostname for Mera. Frontend hosting alone does not deploy contracts, host the daemon/MCP service, configure payments or provision Envio.

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

Next.js 14 is retained for the requested project architecture. Review framework support and dependency updates before operating a production service. The full-system [runbook](../docs/runbook.md) includes the other components; the [submission checklist](../docs/submission-readiness.md) tracks remaining delivery work.
