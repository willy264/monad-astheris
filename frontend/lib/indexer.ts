import 'server-only';
import { contracts, monadTestnet } from './contracts';
import { count, graphqlRequest, IndexerError, object, parseAgent, parseBatches, parseProgress, parseShardHistory, rows, shardHistoryWhere, type IndexerScope } from './indexer-protocol';

export const indexerConfigured = Boolean(process.env.ENVIO_GRAPHQL_URL);
function scope(): IndexerScope {
  if (!contracts.router || !contracts.identity) throw new IndexerError('Envio requires the matching router and identity registry addresses.');
  return { chainId: monadTestnet.id, router: contracts.router.toLowerCase(), registry: contracts.identity.toLowerCase() };
}
function request(query: string, variables: Record<string, unknown>) {
  const headers: Record<string, string> = {};
  if (process.env.ENVIO_GRAPHQL_ADMIN_SECRET) headers['x-hasura-admin-secret'] = process.env.ENVIO_GRAPHQL_ADMIN_SECRET;
  if (process.env.ENVIO_GRAPHQL_TOKEN) headers.Authorization = `Bearer ${process.env.ENVIO_GRAPHQL_TOKEN}`;
  return graphqlRequest(process.env.ENVIO_GRAPHQL_URL!, headers, query, variables);
}
async function progress(current: IndexerScope) {
  const id = `${current.chainId}:${current.router}:${current.registry}`;
  const data = await request('query Progress($id: String!) { progress: SyncStatus(where: {id: {_eq: $id}}, limit: 1) { id chainId router registry blockNumber } }', { id });
  return BigInt(parseProgress(data.progress, current));
}
const agentWhere = (current: IndexerScope) => ({ chainId: { _eq: current.chainId }, registry: { _eq: current.registry } });
const routerWhere = (current: IndexerScope) => ({ chainId: { _eq: current.chainId }, router: { _eq: current.router } });
export async function getIndexedCheckpoint() {
  const current = scope();
  return { current, indexed: await progress(current) };
}
export async function getIndexedSnapshot(networkHead: bigint, lookback: bigint, deployment: bigint, checkpoint: Awaited<ReturnType<typeof getIndexedCheckpoint>>) {
  const { current, indexed } = checkpoint;
  if (indexed > networkHead) throw new IndexerError('Envio progress is ahead of the configured RPC. Check the chain and deployment.');
  if (indexed < deployment) throw new IndexerError('Envio is still catching up to the configured deployment block.');
  const windowStart = indexed >= lookback - 1n ? indexed - lookback + 1n : 0n;
  const from = deployment > windowStart ? deployment : windowStart;
  const range = { _gte: from.toString(), _lte: indexed.toString() };
  const data = await request(`query Overview($agents: Agent_bool_exp!, $shards: EphemeralShard_bool_exp!, $executions: TaskExecution_bool_exp!, $batches: MerkleBatch_bool_exp!, $commitments: BatchCommitment_bool_exp!) {
    registered: Agent_aggregate(where: $agents) { aggregate { count } }
    active: TaskExecution_aggregate(where: $executions) { aggregate { count(columns: agentId, distinct: true) } }
    executions: TaskExecution_aggregate(where: $executions) { aggregate { count } }
    shards: EphemeralShard(where: $shards, limit: 201, order_by: [{createdBlock: desc}, {id: asc}]) {
      id chainId router address agentId taskId sequenceNonce executor inputHash outputHash proofHash status createdBlock completedBlock creationTx agent { registry } execution { transactionHash blockNumber }
    }
    batches: MerkleBatch(where: $batches, limit: 12, order_by: {blockNumber: desc}) { chainId router batchId blockNumber blockHash root leafCount status committedRoot committedLeafCount commitmentTx }
    commitments: BatchCommitment(where: $commitments, limit: 24, order_by: {fromBlock: desc}) { chainId router batchId root leafCount fromBlock toBlock verified transactionHash }
  }`, {
    agents: agentWhere(current), shards: shardHistoryWhere(current, deployment, indexed),
    executions: { ...routerWhere(current), blockNumber: range, agent: { registry: { _eq: current.registry } } },
    batches: { ...routerWhere(current), blockNumber: { _lte: indexed.toString() } }, commitments: { ...routerWhere(current), toBlock: { _lte: indexed.toString() } },
  });
  const shardData = parseShardHistory(data.shards, current, deployment, indexed, from);
  return { fromBlock: from.toString(), registeredAgents: String(count(data.registered)), activeAgents: count(data.active), executions: count(data.executions),
    ...shardData, batches: parseBatches(data.batches, data.commitments, current, indexed),
    source: { kind: 'envio' as const, indexedThrough: indexed.toString(), lagBlocks: (networkHead - indexed).toString() } };
}
export async function getIndexedAgents(page: number) {
  const current = scope(), indexed = await progress(current);
  const data = await request(`query Directory($where: Agent_bool_exp!, $offset: Int!) {
    registered: Agent_aggregate(where: $where) { aggregate { count } }
    agents: Agent(where: $where, limit: 12, offset: $offset, order_by: {agentId: asc}) { id chainId registry agentId owner agentURI tasksCompleted }
  }`, { where: agentWhere(current), offset: page * 12 });
  return { agents: rows(data.agents, 12).map(row => parseAgent(object(row), current)), total: BigInt(count(data.registered)), source: { kind: 'envio' as const, indexedThrough: indexed.toString() } };
}
