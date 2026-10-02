import 'server-only';
import { createPublicClient, formatUnits, http } from 'viem';
import { contracts, identityAbi, monadTestnet, reputationAbi, routerAbi } from './contracts';
import type { Agent, AgentPage, Shard, Snapshot } from './types';

const rpc = createPublicClient({ chain: monadTestnet, transport: http(process.env.MONAD_RPC_URL || monadTestnet.rpcUrls.default.http[0], { timeout: 12000, retryCount: 1 }) });
const configuredLookback = Number(process.env.EVENT_LOOKBACK_BLOCKS || 200);
const lookback = BigInt(Number.isInteger(configuredLookback) ? Math.min(1000, Math.max(12, configuredLookback)) : 200);
const deployment = /^\d+$/.test(process.env.DEPLOYMENT_BLOCK || '') ? BigInt(process.env.DEPLOYMENT_BLOCK!) : 0n;
let snapshotCache: { expires: number; promise: Promise<Snapshot> } | undefined;
const agentCache = new Map<number, { expires: number; promise: Promise<AgentPage> }>();

export function getSnapshot(): Promise<Snapshot> {
  if (snapshotCache && snapshotCache.expires > Date.now()) return snapshotCache.promise;
  const promise = loadSnapshot();
  snapshotCache = { expires: Number.POSITIVE_INFINITY, promise };
  promise.then(() => { if (snapshotCache?.promise === promise) snapshotCache.expires = Date.now() + 8000; },
    () => { if (snapshotCache?.promise === promise) snapshotCache = undefined; });
  return promise;
}

async function loadSnapshot(): Promise<Snapshot> {
  const [chainId, latest] = await Promise.all([rpc.getChainId(), rpc.getBlock({ blockTag: 'latest' })]);
  if (chainId !== monadTestnet.id) throw new Error('The configured RPC is not Monad Testnet. Expected chain 10143.');
  if (latest.number === null) throw new Error('Latest block is not mined.');
  const head = latest.number;
  const windowStart = head >= lookback - 1n ? head - lookback + 1n : 0n;
  const fromBlock = deployment > head ? head : deployment > windowStart ? deployment : windowStart;
  const errors: string[] = [];
  if (deployment > head) errors.push('The configured deployment block is ahead of the network head. Check DEPLOYMENT_BLOCK.');
  let routerAddress = contracts.router;
  if (routerAddress && contracts.identity) {
    try {
      const routerIdentity = await rpc.readContract({ address: routerAddress, abi: routerAbi, functionName: 'identityRegistry', blockNumber: head });
      if (routerIdentity.toLowerCase() !== contracts.identity.toLowerCase()) throw new Error('Identity registry mismatch');
    } catch {
      errors.push('The router could not be verified against the configured identity registry. Check that the addresses belong to the same deployment.');
      routerAddress = undefined;
    }
  }
  const [sampleResult, supplyResult, shardResult, executionResult] = await Promise.allSettled([
    Promise.all(Array.from({ length: Math.min(12, Number(head + 1n)) }, (_, index) => index === 0 ? Promise.resolve(latest) : rpc.getBlock({ blockNumber: head - BigInt(index) }))),
    contracts.identity ? rpc.readContract({ address: contracts.identity, abi: identityAbi, functionName: 'totalSupply', blockNumber: head }) : Promise.resolve(null),
    routerAddress && fromBlock <= head ? rpc.getContractEvents({ address: routerAddress, abi: routerAbi, eventName: 'ShardCreated', fromBlock, toBlock: head, strict: true }) : Promise.resolve([]),
    routerAddress && fromBlock <= head ? rpc.getContractEvents({ address: routerAddress, abi: routerAbi, eventName: 'TaskExecuted', fromBlock, toBlock: head, strict: true }) : Promise.resolve([]),
  ]);
  const sample = sampleResult.status === 'fulfilled' ? sampleResult.value.reverse() : [];
  if (sampleResult.status === 'rejected') errors.push('Recent block samples are unavailable.');
  if (supplyResult.status === 'rejected') errors.push('The identity registry could not be read. Check its deployment address.');
  if (shardResult.status === 'rejected' || executionResult.status === 'rejected') errors.push('Router events could not be read. Check the RPC log range and deployment address.');
  const seconds = sample.length > 1 ? Number(sample[sample.length - 1].timestamp - sample[0].timestamp) : 0;
  const executions = executionResult.status === 'fulfilled' ? executionResult.value : [];
  const executionByShard = new Map(executions.map((event) => [event.args.shard.toLowerCase(), event]));
  const shards: Shard[] = shardResult.status === 'fulfilled' ? shardResult.value.map((event): Shard => {
    const execution = executionByShard.get(event.args.shard.toLowerCase());
    return {
      address: event.args.shard, agentId: event.args.agentId.toString(), taskId: event.args.taskId,
      sequenceNonce: event.args.sequenceNonce.toString(), executor: event.args.executor, inputHash: event.args.inputHash,
      outputHash: execution?.args.outputHash, proofHash: execution?.args.proofHash, createdBlock: event.blockNumber.toString(),
      transactionHash: event.transactionHash, executionTransactionHash: execution?.transactionHash,
      status: execution ? 'executed' : 'created',
    };
  }).reverse() : [];
  return {
    blockNumber: head.toString(), chainId, sampledAt: new Date().toISOString(), fromBlock: fromBlock.toString(),
    tps: seconds > 0 ? sample.slice(1).reduce((count, block) => count + block.transactions.length, 0) / seconds : null,
    sampleSeconds: seconds, blockSamples: sample.map((block) => ({ block: block.number!.toString(), transactions: block.transactions.length })),
    registeredAgents: supplyResult.status === 'fulfilled' && supplyResult.value !== null ? supplyResult.value.toString() : null,
    activeAgents: routerAddress && executionResult.status === 'fulfilled' ? new Set(executions.map((event) => event.args.agentId.toString())).size : null,
    executions: routerAddress && executionResult.status === 'fulfilled' ? executions.length : null,
    shards, errors, routerConfigured: Boolean(routerAddress), registryConfigured: Boolean(contracts.identity),
    eventsAvailable: Boolean(routerAddress) && shardResult.status === 'fulfilled' && executionResult.status === 'fulfilled',
  };
}

// Agent Cards are untrusted. Fetch only immutable IPFS paths through an operator-selected gateway;
// never make server requests to arbitrary URLs supplied by an NFT owner.
async function agentCard(uri: string): Promise<{ name?: string; description?: string; services?: { name?: string; endpoint?: string; skills?: string[] }[]; capabilities?: string[] }> {
  const match = /^ipfs:\/\/(?:ipfs\/)?([a-zA-Z0-9]+)(\/[a-zA-Z0-9_.\/-]*)?$/.exec(uri);
  if (!match || (match[2] || '').split('/').some((segment) => segment === '..' || segment === '.')) throw new Error('Agent Card requires an ipfs:// URI.');
  const gateway = process.env.IPFS_GATEWAY || 'https://ipfs.io/ipfs/';
  const url = new URL(`${gateway.replace(/\/$/, '')}/${match[1]}${match[2] || ''}`);
  if (url.protocol !== 'https:') throw new Error('IPFS gateway must use HTTPS.');
  const response = await fetch(url, { signal: AbortSignal.timeout(6000), redirect: 'error', cache: 'no-store' });
  if (!response.ok) throw new Error(`IPFS gateway returned ${response.status}.`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Agent Card is empty.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > 256 * 1024) throw new Error('Agent Card exceeds 256 KiB.');
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel(); }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  const value: unknown = JSON.parse(new TextDecoder().decode(body));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Agent Card is not an object.');
  return value;
}

export function getAgentPage(page: number): Promise<AgentPage> {
  const cached = agentCache.get(page);
  if (cached && cached.expires > Date.now()) return cached.promise;
  if (agentCache.size > 64) agentCache.clear();
  const promise = loadAgentPage(page);
  agentCache.set(page, { expires: Number.POSITIVE_INFINITY, promise });
  promise.then(() => { const current = agentCache.get(page); if (current?.promise === promise) current.expires = Date.now() + 30000; },
    () => { if (agentCache.get(page)?.promise === promise) agentCache.delete(page); });
  return promise;
}

async function loadAgentPage(page: number): Promise<AgentPage> {
  const registry = contracts.identity;
  if (!registry) throw new Error('Connect your deployment by setting NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS.');
  if (await rpc.getChainId() !== monadTestnet.id) throw new Error('The configured RPC is not Monad Testnet.');
  const blockNumber = await rpc.getBlockNumber();
  const errors: string[] = [];
  let reputationAddress = contracts.reputation;
  if (reputationAddress) {
    try {
      const reputationIdentity = await rpc.readContract({ address: reputationAddress, abi: reputationAbi, functionName: 'getIdentityRegistry', blockNumber });
      if (reputationIdentity.toLowerCase() !== registry.toLowerCase()) throw new Error('Identity registry mismatch');
    } catch {
      errors.push('The reputation registry could not be verified against the identity registry. Scores are unavailable until deployment configuration is corrected.');
      reputationAddress = undefined;
    }
  }
  const total = await rpc.readContract({ address: registry, abi: identityAbi, functionName: 'totalSupply', blockNumber });
  const pageSize = 12;
  const start = BigInt(page * pageSize) + 1n;
  const remaining = total >= start ? total - start + 1n : 0n;
  const count = Number(remaining > BigInt(pageSize) ? BigInt(pageSize) : remaining);
  const results: PromiseSettledResult<Agent>[] = [];
  // Four identities at a time bounds upstream RPC and IPFS load.
  for (let offset = 0; offset < count; offset += 4) {
    results.push(...await Promise.allSettled(Array.from({ length: Math.min(4, count - offset) }, async (_, index): Promise<Agent> => {
      const id = start + BigInt(offset + index);
      const [owner, uri] = await Promise.all([
        rpc.readContract({ address: registry, abi: identityAbi, functionName: 'ownerOf', args: [id], blockNumber }),
        rpc.readContract({ address: registry, abi: identityAbi, functionName: 'tokenURI', args: [id], blockNumber }),
      ]);
      const agent: Agent = { id: id.toString(), owner, uri, name: `Agent #${id}`, description: '', capabilities: [], endpoints: [], score: null, feedbackCount: null };
      const [card, reputation] = await Promise.allSettled([
        agentCard(uri),
        reputationAddress ? (async () => {
          const clients = await rpc.readContract({ address: reputationAddress!, abi: reputationAbi, functionName: 'getClients', args: [id], blockNumber });
          // Quality feedback is comparable within its own tag. Arbitrary task-specific metrics are not averaged together.
          if (!clients.length) return [0n, 0n, 0] as const;
          return rpc.readContract({ address: reputationAddress!, abi: reputationAbi, functionName: 'getSummary', args: [id, clients, 'quality', ''], blockNumber });
        })() : Promise.resolve(null),
      ]);
      if (card.status === 'fulfilled') {
        const data = card.value;
        agent.name = typeof data.name === 'string' ? data.name.slice(0, 100) : agent.name;
        agent.description = typeof data.description === 'string' ? data.description.slice(0, 500) : '';
        const services = Array.isArray(data.services) ? data.services.filter((service) => service && typeof service === 'object') : [];
        agent.endpoints = services.filter((service) => typeof service.endpoint === 'string').map((service) => ({ name: typeof service.name === 'string' ? service.name.slice(0, 32) : 'Service', endpoint: service.endpoint!.slice(0, 500) })).slice(0, 8);
        agent.capabilities = [...new Set([...services.flatMap((service) => Array.isArray(service.skills) ? service.skills : []), ...(Array.isArray(data.capabilities) ? data.capabilities : [])].filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 48)))].slice(0, 6);
      } else { agent.metadataError = 'Agent Card unavailable'; }
      if (reputation.status === 'fulfilled' && reputation.value) {
        const [feedbackCount, value, decimals] = reputation.value;
        agent.feedbackCount = feedbackCount.toString();
        agent.score = feedbackCount > 0n ? formatUnits(value, decimals) : null;
      } else if (reputation.status === 'rejected' || (contracts.reputation && !reputationAddress)) { agent.reputationError = 'Reputation unavailable'; }
      return agent;
    })));
  }
  if (results.some((result) => result.status === 'rejected')) errors.push('Some identities could not be loaded. Refresh to retry.');
  return { agents: results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []), total: total.toString(), page, pageSize, errors };
}
