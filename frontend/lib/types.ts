export interface Shard {
  address: string; agentId: string; taskId: string; sequenceNonce: string; executor: string;
  inputHash: string; outputHash?: string; proofHash?: string; createdBlock: string;
  transactionHash: string; executionTransactionHash?: string; status: 'created' | 'executed';
}
export interface Snapshot {
  blockNumber: string; chainId: number; sampledAt: string; fromBlock: string;
  tps: number | null; sampleSeconds: number; blockSamples: { block: string; transactions: number }[];
  registeredAgents: string | null; activeAgents: number | null; executions: number | null;
  shards: Shard[]; errors: string[]; routerConfigured: boolean; registryConfigured: boolean; eventsAvailable: boolean;
}
export interface Agent {
  id: string; owner: string; uri: string; name: string; description: string;
  capabilities: string[]; endpoints: { name: string; endpoint: string }[];
  score: string | null; feedbackCount: string | null; metadataError?: string; reputationError?: string;
}
export interface AgentPage { agents: Agent[]; total: string; page: number; pageSize: number; errors: string[]; }
