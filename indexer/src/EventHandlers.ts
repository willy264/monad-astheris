import { indexer } from "envio";
import type { Address, Hex } from "viem";
import { appendLeaf, batchId, executionLeaf, frontierRoot } from "./merkle.js";

const entityId = (chain: number, address: string) => `${chain}:${address.toLowerCase()}`;
const agentKey = (chain: number, registry: string, agentId: bigint) => `${entityId(chain, registry)}:${agentId}`;
const blockKey = (chain: number, router: string, block: bigint | number) => `${entityId(chain, router)}:${block}`;
const fields = { transaction: ["hash"], block: ["hash", "timestamp"] } as const;

indexer.onEvent({ contract: "AgentRegistry", event: "Registered", fields }, async ({ event, context }) => {
  const id = agentKey(event.chainId, event.srcAddress, event.params.agentId);
  const existing = await context.Agent.get(id);
  context.Agent.set({
    id, chainId: event.chainId, registry: event.srcAddress,
    agentId: event.params.agentId, owner: event.params.owner, agentURI: event.params.agentURI,
    registeredAt: BigInt(event.block.timestamp),
    shardsCreated: existing?.shardsCreated ?? 0n, tasksCompleted: existing?.tasksCompleted ?? 0n,
  });
});

indexer.onEvent({ contract: "AgentRegistry", event: "URIUpdated" }, async ({ event, context }) => {
  const id = agentKey(event.chainId, event.srcAddress, event.params.agentId);
  const agent = await context.Agent.get(id);
  if (context.isPreload) return;
  if (!agent) throw new Error(`Missing registration ${id}; index from deployment block`);
  context.Agent.set({ ...agent, agentURI: event.params.newURI });
});

indexer.onEvent({ contract: "AgentRegistry", event: "Transfer" }, async ({ event, context }) => {
  const id = agentKey(event.chainId, event.srcAddress, event.params.tokenId);
  const agent = await context.Agent.get(id);
  // Mint Transfer precedes Registered; Registered initializes the entity.
  if (agent) context.Agent.set({ ...agent, owner: event.params.to });
});

indexer.onEvent({ contract: "AetherisRouter", event: "ShardCreated", fields }, async ({ event, context }) => {
  const registry = indexer.chains[event.chainId].AgentRegistry.addresses[0];
  if (!registry) throw new Error("AgentRegistry address is required");
  const agentId = agentKey(event.chainId, registry, event.params.agentId);
  const agent = await context.Agent.get(agentId);
  if (context.isPreload) return;
  if (!agent) throw new Error(`Missing agent ${agentId}; use the registry deployment start block`);
  context.EphemeralShard.set({
    id: entityId(event.chainId, event.params.shard), chainId: event.chainId,
    address: event.params.shard, router: event.srcAddress, agent_id: agentId,
    agentId: event.params.agentId, taskId: event.params.taskId,
    sequenceNonce: event.params.sequenceNonce, executor: event.params.executor,
    inputHash: event.params.inputHash, status: "ready",
    createdBlock: BigInt(event.block.number), createdAt: BigInt(event.block.timestamp),
    creationTx: event.transaction.hash, outputHash: undefined, proofHash: undefined,
    completedBlock: undefined, execution_id: undefined,
  });
  context.Agent.set({ ...agent, shardsCreated: agent.shardsCreated + 1n });
});

indexer.onEvent({ contract: "AetherisRouter", event: "TaskExecuted", fields }, async ({ event, context }) => {
  const shardId = entityId(event.chainId, event.params.shard);
  const id = `${event.chainId}:${event.transaction.hash}:${event.logIndex}`;
  const batchKey = blockKey(event.chainId, event.srcAddress, event.block.number);
  const [shard, previous, duplicate] = await Promise.all([
    context.EphemeralShard.get(shardId), context.MerkleBatch.get(batchKey), context.TaskExecution.get(id),
  ]);
  const agent = shard ? await context.Agent.get(shard.agent_id) : undefined;
  if (context.isPreload || duplicate) return;
  if (!shard || !agent) throw new Error(`Missing shard ${shardId}; index from deployment block`);
  const leaf = executionLeaf({
    chainId: BigInt(event.chainId), router: event.srcAddress as Address,
    shard: event.params.shard as Address, agentId: event.params.agentId,
    taskId: event.params.taskId as Hex, inputHash: event.params.inputHash as Hex,
    outputHash: event.params.outputHash as Hex, proofHash: event.params.proofHash as Hex,
  });
  const frontier = appendLeaf(previous?.frontier ?? [], previous?.leafCount ?? 0n, leaf);
  context.MerkleBatch.set({
    id: batchKey, chainId: event.chainId, router: event.srcAddress,
    batchId: batchId(BigInt(event.chainId), event.srcAddress as Address, BigInt(event.block.number), event.block.hash as Hex),
    blockNumber: BigInt(event.block.number), blockHash: event.block.hash,
    root: frontierRoot(frontier), leafCount: (previous?.leafCount ?? 0n) + 1n, frontier,
    status: "observed", committedRoot: undefined, committedLeafCount: undefined,
    commitmentTx: undefined, commitmentBlock: undefined,
  });
  context.TaskExecution.set({
    id, chainId: event.chainId, router: event.srcAddress, shard_id: shardId,
    agent_id: shard.agent_id, agentId: event.params.agentId, taskId: event.params.taskId,
    inputHash: event.params.inputHash, outputHash: event.params.outputHash, proofHash: event.params.proofHash,
    leaf, blockNumber: BigInt(event.block.number), blockHash: event.block.hash,
    timestamp: BigInt(event.block.timestamp), transactionHash: event.transaction.hash,
    logIndex: event.logIndex, batch_id: batchKey,
  });
  context.EphemeralShard.set({
    ...shard, outputHash: event.params.outputHash, proofHash: event.params.proofHash,
    status: "completed", completedBlock: BigInt(event.block.number), execution_id: id,
  });
  context.Agent.set({ ...agent, tasksCompleted: agent.tasksCompleted + 1n });
});

// Close the previous block, irrespective of the ordering of this block's own events.
indexer.onBlock({ name: "CompleteExecutionBlocks" }, async ({ block, context }) => {
  if (block.number === 0) return;
  const registry = indexer.chains[context.chain.id].AgentRegistry.addresses[0];
  if (!registry) throw new Error("AgentRegistry address is required");
  for (const router of indexer.chains[context.chain.id].AetherisRouter.addresses) {
    const batch = await context.MerkleBatch.get(blockKey(context.chain.id, router, block.number - 1));
    if (batch?.status === "observed") context.MerkleBatch.set({ ...batch, status: "complete" });
    context.SyncStatus.set({
      id: `${entityId(context.chain.id, router)}:${registry.toLowerCase()}`,
      chainId: context.chain.id, router, registry, blockNumber: BigInt(block.number - 1),
    });
  }
});

indexer.onEvent({ contract: "AetherisRouter", event: "MerkleBatchCommitted", fields }, async ({ event, context }) => {
  const p = event.params;
  const batch = await context.MerkleBatch.get(blockKey(event.chainId, event.srcAddress, p.fromBlock));
  if (context.isPreload) return;
  const verified = Boolean(batch && p.fromBlock === p.toBlock && batch.batchId === p.batchId &&
    batch.root === p.root && batch.leafCount === p.leafCount);
  context.BatchCommitment.set({
    id: `${entityId(event.chainId, event.srcAddress)}:${p.batchId}`,
    chainId: event.chainId, router: event.srcAddress, batchId: p.batchId,
    root: p.root, leafCount: p.leafCount, fromBlock: p.fromBlock, toBlock: p.toBlock,
    verified, transactionHash: event.transaction.hash,
  });
  if (batch && p.fromBlock === p.toBlock) context.MerkleBatch.set({
    ...batch, status: verified ? "committed" : "mismatch",
    committedRoot: p.root, committedLeafCount: p.leafCount,
    commitmentTx: event.transaction.hash, commitmentBlock: BigInt(event.block.number),
  });
});
