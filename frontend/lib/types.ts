export interface Shard {
  address: string; agentId: string; taskId: string; sequenceNonce: string; executor: string;
  inputHash: string; outputHash?: string; proofHash?: string; createdBlock: string;
  transactionHash: string; executionTransactionHash?: string; status: 'created' | 'executed';
}
export interface ShardHistory {
  shards: Shard[]; fromBlock: string; toBlock: string; resultsLimited: boolean;
}
export interface Snapshot {
  blockNumber: string; chainId: number; sampledAt: string; fromBlock: string;
  tps: number | null; sampleSeconds: number; blockSamples: { block: string; transactions: number }[];
  registeredAgents: string | null; activeAgents: number | null; executions: number | null;
  shards: Shard[]; errors: string[]; routerConfigured: boolean; registryConfigured: boolean; eventsAvailable: boolean;
  source: DataSource; batches: MerkleBatch[]; resultsLimited: boolean;
  /** Latest indexed shards, independent of the recent activity window. Absent for bounded RPC fallback. */
  shardHistory?: ShardHistory;
}
export interface DataSource { kind: 'envio' | 'rpc'; indexedThrough?: string; lagBlocks?: string }
export interface MerkleBatch { batchId: string; root: string; blockNumber: string; leafCount: string; verified: boolean; status: 'observed' | 'complete' | 'committed' | 'mismatch'; commitmentTx?: string }
export interface Agent {
  id: string; owner: string; uri: string; name: string; description: string;
  capabilities: string[]; endpoints: { name: string; endpoint: string }[];
  score: string | null; feedbackCount: string | null; metadataError?: string; reputationError?: string;
  tasksCompleted?: string;
}
export interface AgentPage { agents: Agent[]; total: string; page: number; pageSize: number; errors: string[]; source: DataSource; }
