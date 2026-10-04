import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';

const CHAIN_ID = 10143;
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_RPC_BYTES = 2 * 1024 * 1024;
const RPC_TIMEOUT_MS = 8_000;
const DEFAULT_RPC_URL = 'https://testnet-rpc.monad.xyz';
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const quantity = z.string().regex(/^0x[0-9a-fA-F]{1,64}$/);
const decimal = z.string().regex(/^(0|[1-9][0-9]*)$/);
const blockSchema = z.object({
  number: quantity,
  hash,
  timestamp: quantity,
  transactions: z.array(hash),
});
const observationSchema = z.object({
  chainId: z.literal(CHAIN_ID),
  blockNumber: decimal.describe('Block height, as an exact decimal string.'),
  blockHash: hash,
  timestamp: decimal.describe('Block timestamp in Unix seconds, as an exact decimal string.'),
  transactionCount: z.number().int().nonnegative(),
}).strict();

interface ObserverOptions {
  /** Server configuration only. Tool arguments never select an upstream URL. */
  rpcUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

class WrongChainError extends Error {}
class BodyTooLargeError extends Error {}

async function boundedJson(body: ReadableStream<Uint8Array>, maximum: number): Promise<unknown> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) throw new BodyTooLargeError();
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

async function boundedRpcJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new Error('RPC response unavailable');
  }
  const declaredSize = response.headers.get('content-length');
  if (declaredSize && Number(declaredSize) > MAX_RPC_BYTES) {
    await response.body.cancel();
    throw new BodyTooLargeError();
  }
  return boundedJson(response.body, MAX_RPC_BYTES);
}

async function observeBlock(options: ObserverOptions, requestSignal: AbortSignal, toolSignal: AbortSignal) {
  const rpcUrl = new URL(options.rpcUrl ?? process.env.MONAD_RPC_URL ?? DEFAULT_RPC_URL);
  if (!['http:', 'https:'].includes(rpcUrl.protocol)) throw new Error('Invalid RPC configuration');
  const controller = new AbortController();
  // One total deadline for both RPC calls. There are no automatic upstream retries.
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? RPC_TIMEOUT_MS);
  const signal = AbortSignal.any([controller.signal, requestSignal, toolSignal]);
  const rpcFetch = options.fetch ?? fetch;
  async function rpc(method: string, params: unknown[]) {
    signal.throwIfAborted();
    const response = await rpcFetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      cache: 'no-store',
      redirect: 'error',
      signal,
    });
    const envelope = z.object({ jsonrpc: z.literal('2.0'), id: z.literal(1), result: z.unknown(), error: z.unknown().optional() })
      .parse(await boundedRpcJson(response));
    if (envelope.error !== undefined || envelope.result === undefined) throw new Error('RPC request failed');
    return envelope.result;
  }
  try {
    const chainId = BigInt(quantity.parse(await rpc('eth_chainId', [])));
    if (chainId !== BigInt(CHAIN_ID)) throw new WrongChainError();
    const block = blockSchema.parse(await rpc('eth_getBlockByNumber', ['latest', false]));
    return observationSchema.parse({
      chainId: CHAIN_ID,
      blockNumber: BigInt(block.number).toString(),
      blockHash: block.hash,
      timestamp: BigInt(block.timestamp).toString(),
      transactionCount: block.transactions.length,
    });
  } finally {
    clearTimeout(timer);
  }
}

function failure(status: number, message: string, code = -32000): Response {
  return Response.json({ jsonrpc: '2.0', id: null, error: { code, message } }, {
    status,
    headers: { 'Cache-Control': 'no-store', ...(status === 405 ? { Allow: 'POST' } : {}) },
  });
}

/** One server and transport per HTTP request: no sessions, SSE, credentials, or global mutable state. */
export function createMonadMcpHandler(options: ObserverOptions = {}) {
  return async function handleMonadMcp(request: Request): Promise<Response> {
    const origin = request.headers.get('origin');
    if (origin !== null && origin !== new URL(request.url).origin) {
      return failure(403, 'Cross-origin browser requests are not allowed.');
    }
    if (request.method !== 'POST') return failure(405, 'Use POST for this stateless MCP endpoint; SSE is not supported.');

    const server = new McpServer({ name: 'aetheris-monad-observer', version: '1.0.0' }, { maxToolInputElements: 1 });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: MAX_REQUEST_BYTES,
    });
    server.registerTool('get_monad_block', {
      title: 'Observe the latest Monad Testnet block',
      description: 'Reads the latest mined block from Monad Testnet (chain 10143). Returns block height, hash, Unix timestamp and transaction count. The block is not claimed finalized. Does not sign, send transactions, take payment, or perform AI inference.',
      inputSchema: z.object({}).strict(),
      outputSchema: observationSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async (_args, extra) => {
      try {
        const observation = await observeBlock(options, request.signal, extra.signal);
        return { structuredContent: observation, content: [{ type: 'text', text: JSON.stringify(observation) }] };
      } catch (error) {
        // Provider exceptions can contain the private RPC URL, API key, or response body.
        // Never return or log those values through this public endpoint.
        const text = error instanceof WrongChainError
          ? 'The configured RPC is not Monad Testnet (chain 10143).'
          : 'Monad Testnet block data is unavailable. The RPC request failed, timed out, or returned invalid data.';
        return { isError: true, content: [{ type: 'text', text }] };
      }
    });
    try {
      await server.connect(transport);
      // Reject unsupported media types up front. Every accepted POST must pass
      // our bounded single-message parser, regardless of SDK compatibility behavior.
      const accept = request.headers.get('accept');
      const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      if (!accept?.includes('application/json') || !accept.includes('text/event-stream')) {
        return failure(406, 'Accept must include application/json and text/event-stream.');
      }
      if (contentType !== 'application/json') return failure(415, 'Content-Type must be application/json.');
      if (Number(request.headers.get('content-length')) > MAX_REQUEST_BYTES) {
        await request.body?.cancel().catch(() => {});
        return failure(413, 'MCP request body exceeds 16384 bytes.');
      }
      let parsedBody: unknown;
      try {
        if (!request.body) return failure(400, 'Invalid JSON.', -32700);
        parsedBody = await boundedJson(request.body, MAX_REQUEST_BYTES);
      } catch (error) {
        return error instanceof BodyTooLargeError
          ? failure(413, 'MCP request body exceeds 16384 bytes.')
          : failure(400, 'Invalid JSON.', -32700);
      }
      // The SDK supports legacy JSON-RPC batches. This public endpoint accepts
      // one message per HTTP request, preventing a small body from amplifying RPC work.
      if (Array.isArray(parsedBody)) return failure(400, 'Send one JSON-RPC message per request; batches are not supported.', -32600);
      const response = await transport.handleRequest(request, { parsedBody });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } catch {
      return failure(500, 'The MCP request could not be processed.');
    } finally {
      // JSON mode completes tool execution before handleRequest resolves.
      await server.close().catch(() => {});
    }
  };
}
