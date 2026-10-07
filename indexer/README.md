# Aetheris indexer

Envio HyperIndex 3.12.1 indexes the identity registry and router on Monad Testnet. Envio calls this a HyperIndex project; it is not a Graph Protocol AssemblyScript subgraph.

For the complete system setup and current submission gaps, see the [runbook](../docs/runbook.md) and [submission checklist](../docs/submission-readiness.md).

```sh
pnpm install --frozen-lockfile
cp .env.example .env
# The verified Monad Testnet contracts/start block are defaults; configure provider settings as needed.
pnpm codegen
pnpm typecheck
pnpm test
pnpm dev
```

Use Node 22+ on Linux/macOS, or WSL2 on Windows, and Docker for local PostgreSQL/Hasura. Envio 3.12.1 does not publish a native Windows addon. Keep local Hasura's port separate from the daemon's port 8080 (see local storage setup below). Configure Envio Cloud with this directory as the project root, the same `ENVIO_*` environment variables, and its managed storage. Deployment is not performed by generation.

For local storage, the template sets `HASURA_EXTERNAL_PORT=8081` and `HASURA_GRAPHQL_ENDPOINT=http://localhost:8081/v1/metadata`; `pnpm dev` uses these when launching its Docker services. Query GraphQL at `http://localhost:8081/v1/graphql`. The included Hasura secret is only for local development. Envio Cloud manages its own database and GraphQL service; do not apply the localhost Hasura variables there.

The public defaults in `config.yaml` match the receipt-verified [Monad Testnet deployment manifest](../contracts/deployments/10143.json): identity registry `0x754d7f2fd55a9841dbff248f9cb91d497116f231`, router `0xac4a33521b32122c9f014eac8800144dd9aa5ebe`, and earliest deployment block `67972561` on chain `10143`. `ENVIO_*` values override these defaults. Index from the earliest registry deployment block; starting after agent registration loses required relationships and is rejected rather than creating invented agents.

For the Envio Cloud project `willy264/monad-astheris`, use repository branch `main` and project root `indexer`. Contract addresses and the start block work without environment overrides, including through `pnpm dev` and `pnpm start`. Their configuration check reads the same defaults from `config.yaml` and rejects malformed, empty or zero-address overrides. If you configure these values explicitly, use:

```dotenv
ENVIO_MONAD_RPC_URL=https://testnet-rpc.monad.xyz
ENVIO_AGENT_REGISTRY_ADDRESS=0x754d7f2fd55a9841dbff248f9cb91d497116f231
ENVIO_ROUTER_ADDRESS=0xac4a33521b32122c9f014eac8800144dd9aa5ebe
ENVIO_START_BLOCK=67972561
ENVIO_HASURA_PUBLIC_AGGREGATE=["Agent","TaskExecution"]
```

A Cloud project showing **0 deployments** has no running indexer or GraphQL endpoint yet. After its first successful deployment, open that deployment's GraphQL endpoint and copy the actual URL into the server-only `ENVIO_GRAPHQL_URL` setting in Vercel and `scripts/.env`. Redeploy the frontend after changing its environment. A project page URL is not a GraphQL endpoint. Keep credentials server-only, and verify `Agent` and `TaskExecution` query results before claiming that hosted indexing works.

`Agent`, `EphemeralShard`, `TaskExecution`, and `MerkleBatch` entities provide a GraphQL query layer. Set the frontend server's `ENVIO_GRAPHQL_URL` to connect the dashboard to this service. `SyncStatus` records the previous fully processed block and is keyed by chain, router and identity registry, so the dashboard can show progress and reject unrelated deployments. Every task execution stores its canonical double-hashed leaf. Each block's binary frontier is persisted as an entity: appending costs O(log n), no process-global mutable tree exists, and Envio can roll back entity writes on chain reorganizations. The next block marks the preceding block complete. Actual commitments are recorded separately as `BatchCommitment`, and equality of batch ID, root, range and leaf count is checked.

The dashboard uses `Agent_aggregate` and `TaskExecution_aggregate` for accurate counts without downloading unbounded event lists. Set `ENVIO_HASURA_PUBLIC_AGGREGATE=["Agent","TaskExecution"]` as in `.env.example` for public read access, or use a server-only credential with appropriate aggregate/read permissions. Never expose the Hasura admin secret in a browser environment variable. After adding `SyncStatus`, regenerate types and apply the updated storage schema before connecting the dashboard.

`.github/workflows/indexer-check.yml` runs pinned installation, codegen, full TypeScript checking and Merkle tests on Ubuntu/Node 24. It uploads `.envio/types.d.ts` as evidence. This checks generated API compatibility without deploying contracts, starting hosted services or using credentials; it does not establish live indexing. Windows does not run a substitute handwritten generated-types file.

The latest supported-host check **passed on 2026-10-03** at commit `916ee37`: [GitHub Actions run 37158285726](https://github.com/willy264/monad-astheris/actions/runs/37158285726). Fresh code generation, full generated-type checking and both Merkle tests passed on Ubuntu/Node 24; the generated-types artifact is available from that run. The earlier run at `b3b9174` also passed. Native Windows remains unsupported. Live deployment and GraphQL responses still require an actual configured indexer.

Only single-block commitments that match the indexed history become `verified: true`. A commitment mismatch stays visible; it never overwrites the independently calculated root. Tree conventions are in [protocol.md](../docs/protocol.md).

Example GraphQL query (the entity names are case-sensitive):

```graphql
query RecentExecutions {
  TaskExecution(limit: 30, order_by: [{blockNumber: desc}, {logIndex: desc}]) {
    taskId agentId inputHash outputHash proofHash leaf transactionHash blockNumber
  }
  MerkleBatch(limit: 10, order_by: {blockNumber: desc}) {
    batchId root leafCount blockNumber status committedRoot
  }
}
```

External HTTP requests and transaction submissions are deliberately outside handlers. Envio handlers may run during preload as well as actual execution. Settlement is performed by the Rust daemon from confirmed RPC logs, not as a side effect of indexer replay.
