import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { keccak256, toBytes, type Address } from 'viem';
import { contracts, identityAbi, routerAbi, walletPublicClient } from './contracts';
import { boundedJson, ensure, hash, object, same, uint, type DemoConfig } from './demo-protocol';

export interface ObserverAccess { allowed: boolean; message: string }

/** Read-only preflight: an unrelated wallet must never reach MCP or a signing prompt. */
export async function checkObserverAccess(config: DemoConfig, signer: Address, signal: AbortSignal, rpc = walletPublicClient): Promise<ObserverAccess> {
  signal.throwIfAborted();
  ensure(config.agentId === '1', 'This observer belongs to Agent #1. Use your own agent from the overview.');
  ensure(contracts.router && contracts.identity && same(config.router, contracts.router) && same(config.identity, contracts.identity), 'The observer and dashboard contract settings do not match.');
  if (config.relayers.some(executor => same(executor, signer))) return { allowed: false, message: 'Use a separate owner or delegated wallet for this observer. The daemon executor cannot also sign its payments.' };
  ensure(await rpc.getChainId() === 10143, 'The observer RPC is not connected to Monad Testnet.');
  signal.throwIfAborted();
  const blockNumber = await rpc.getBlockNumber({ cacheTime: 0 });
  signal.throwIfAborted();
  const [identity, owner, authorized, ...executors] = await Promise.all([
    rpc.readContract({ address: config.router, abi: routerAbi, functionName: 'identityRegistry', blockNumber }),
    rpc.readContract({ address: config.identity, abi: identityAbi, functionName: 'ownerOf', args: [1n], blockNumber }),
    rpc.readContract({ address: config.router, abi: routerAbi, functionName: 'isAuthorized', args: [1n, signer], blockNumber }),
    ...config.relayers.map(executor => rpc.readContract({ address: config.router, abi: routerAbi, functionName: 'isAuthorized', args: [1n, executor], blockNumber })),
  ]);
  signal.throwIfAborted();
  ensure(same(identity, config.identity) && owner, 'The observer registry could not be verified.');
  if (!authorized) return { allowed: false, message: 'This wallet does not have task authority for Observer #1. Run your own agent from the overview, or ask this observer\u2019s owner for a delegation.' };
  if (!config.relayers.length || !executors.every(Boolean)) return { allowed: false, message: 'Observer #1 needs an active executor delegation from its owner. Your own agent setup is available on the overview.' };
  return { allowed: true, message: 'This wallet is authorized for Observer #1.' };
}

export interface BlockObservation { chainId: 10143; blockNumber: string; blockHash: string; timestamp: string; transactionCount: number }
const tool = { name: 'get_monad_block', arguments: {} };

export function observerWorkload(raw: unknown) {
  const result = CallToolResultSchema.parse(raw);
  ensure(result.isError !== true, 'The observer could not read Monad Testnet. No task or payment was submitted.');
  const output = object(result.structuredContent);
  ensure(output.chainId === 10143, 'The observer returned a different blockchain. No task or payment was submitted.');
  ensure(Number.isSafeInteger(output.transactionCount) && Number(output.transactionCount) >= 0, 'Invalid observer transaction count.');
  ensure(Object.keys(output).every(key => ['chainId', 'blockNumber', 'blockHash', 'timestamp', 'transactionCount'].includes(key)), 'Unexpected observer output.');
  const observation: BlockObservation = { chainId: 10143, blockNumber: uint(output.blockNumber).toString(), blockHash: hash(output.blockHash), timestamp: uint(output.timestamp).toString(), transactionCount: Number(output.transactionCount) };
  const inputBytes = JSON.stringify(tool); const outputBytes = JSON.stringify(observation);
  return { inputHash: keccak256(toBytes(inputBytes)), outputHash: keccak256(toBytes(outputBytes)), observation };
}

/** Calls only the project's stateless, read-only observer. Agent metadata never chooses the request URL. */
export async function observeAgentTask(origin: string, signal: AbortSignal, request: typeof fetch = fetch) {
  const endpoint = new URL('/api/mcp', origin);
  ensure(endpoint.protocol === 'https:' || (endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)), 'MCP access requires HTTPS.');
  ensure(!endpoint.username && !endpoint.password, 'Unsafe observer origin.');
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(20000)]);
  const client = new Client({ name: 'aetheris-directory', version: '1.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(endpoint, {
    fetch: async (input, init) => {
      ensure(String(input) === endpoint.href, 'Unexpected observer service URL.');
      const response = await request(input, { ...init, credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: AbortSignal.any([deadline, ...(init?.signal ? [init.signal] : [])]) });
      // The SDK may probe GET for SSE; this stateless server correctly responds 405.
      if (response.status === 202 || response.status === 204) { await response.body?.cancel().catch(() => {}); return new Response(null, { status: response.status }); }
      if (!response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel().catch(() => {}); throw new Error('The observer returned an unsupported response.'); }
      const value = await boundedJson(response);
      return Response.json(value, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
    },
    reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 100, maxReconnectionDelay: 100, reconnectionDelayGrowFactor: 1 },
  });
  try {
    await client.connect(transport);
    ensure(client.getServerVersion()?.name === 'aetheris-monad-observer', 'The MCP service is not the Aetheris Monad Observer.');
    const result = await client.callTool(tool, CallToolResultSchema, { signal: deadline, timeout: 15000 });
    return observerWorkload(result);
  } finally { await client.close().catch(() => {}); }
}
