# Aetheris indexer

Envio HyperIndex 3.12.1 indexes the identity registry and router on Monad Testnet. Envio calls this a HyperIndex project; it is not a Graph Protocol AssemblyScript subgraph.

For the complete system setup and current submission gaps, see the [runbook](../docs/runbook.md) and [submission checklist](../docs/submission-readiness.md).

```sh
pnpm install --frozen-lockfile
cp .env.example .env
# Set both contract addresses, earliest deployment block and provider settings.
pnpm codegen
pnpm typecheck
pnpm test
pnpm dev
```

Use Node 22+ on Linux/macOS, or WSL2 on Windows, and Docker for local PostgreSQL/Hasura. Envio 3.12.1 does not publish a native Windows addon. Keep local Hasura's port separate from the daemon's port 8080 (see local storage setup below). Configure Envio Cloud with this directory as the project root, the same `ENVIO_*` environment variables, and its managed storage. Deployment is not performed by generation.

For local storage, the template sets `HASURA_EXTERNAL_PORT=8081` and `HASURA_GRAPHQL_ENDPOINT=http://localhost:8081/v1/metadata`; `pnpm dev` uses these when launching its Docker services. Query GraphQL at `http://localhost:8081/v1/graphql`. The included Hasura secret is only for local development. Envio Cloud manages its own database and GraphQL service; do not apply the localhost Hasura variables there.

The zero-address defaults in `config.yaml` allow offline code generation. `dev` and `start` reject missing or zero deployment addresses. Index from the earliest registry deployment block; starting after agent registration loses required relationships and is rejected rather than creating invented agents.

`Agent`, `EphemeralShard`, `TaskExecution`, and `MerkleBatch` entities provide a GraphQL query layer. The current dashboard reads Monad RPC directly; connecting it to this GraphQL service remains a separate integration task. Every task execution stores its canonical double-hashed leaf. Each block's binary frontier is persisted as an entity: appending costs O(log n), no process-global mutable tree exists, and Envio can roll back entity writes on chain reorganizations. The next block marks the preceding block complete. Actual commitments are recorded separately as `BatchCommitment`, and equality of batch ID, root, range and leaf count is checked.

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
