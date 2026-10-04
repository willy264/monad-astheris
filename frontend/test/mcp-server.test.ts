import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { createMonadMcpHandler } from '../lib/mcp-server';

const endpoint = 'https://observer.example/api/mcp';
const rpcUrl = 'https://rpc.example/private-provider-key';
const block = {
  number: '0x20000000000001', // Above Number.MAX_SAFE_INTEGER: preserve the exact height.
  hash: `0x${'ab'.repeat(32)}`,
  timestamp: '0x65123456',
  transactions: [`0x${'11'.repeat(32)}`, `0x${'22'.repeat(32)}`],
};
const expected = {
  chainId: 10143,
  blockNumber: BigInt(block.number).toString(),
  blockHash: block.hash,
  timestamp: BigInt(block.timestamp).toString(),
  transactionCount: block.transactions.length,
};
const call = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_monad_block', arguments: {} } };
const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
type Handler = ReturnType<typeof createMonadMcpHandler>;
type RpcMessage = { jsonrpc: string; id: number; method: string; params: unknown[] };

function rpcFixture(change?: (message: RpcMessage) => unknown) {
  const requests: RpcMessage[] = [];
  const upstream: typeof fetch = async (url, init) => {
    assert.equal(String(url), rpcUrl);
    assert.equal(init?.method, 'POST');
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    const message = JSON.parse(String(init?.body)) as RpcMessage;
    requests.push(message);
    const result = change ? change(message) : message.method === 'eth_chainId' ? '0x279f' : block;
    return Response.json({ jsonrpc: '2.0', id: message.id, result });
  };
  return { requests, handler: createMonadMcpHandler({ rpcUrl, fetch: upstream }) };
}

function post(handler: Handler, payload: unknown = call, extraHeaders: Record<string, string> = {}) {
  return handler(new Request(endpoint, { method: 'POST', headers: { ...headers, ...extraHeaders }, body: JSON.stringify(payload) }));
}

async function toolResult(handler: Handler, payload: unknown = call) {
  const response = await post(handler, payload);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('mcp-session-id'), null);
  const message = await response.json();
  return CallToolResultSchema.parse(message.result);
}

test('official SDK initializes, lists, pings and calls repeatedly without sessions; results match decoded RPC data', async () => {
  const { handler, requests } = rpcFixture();
  const observedMethods: string[] = [];
  const client = new Client({ name: 'observer-integration-test', version: '1.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    fetch: async (input, init) => {
      const request = new Request(input, init);
      observedMethods.push(request.method);
      const response = await handler(request);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('mcp-session-id'), null);
      if (request.method === 'POST' && response.status === 200) assert.match(response.headers.get('content-type')!, /application\/json/);
      return response;
    },
    reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 100, maxReconnectionDelay: 100, reconnectionDelayGrowFactor: 1 },
  });
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion()?.name, 'aetheris-monad-observer');
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 1);
    assert.equal(tools.tools[0].name, 'get_monad_block');
    assert.equal(tools.tools[0].inputSchema.additionalProperties, false);
    assert.deepEqual(tools.tools[0].annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true });
    assert.equal(requests.length, 0, 'metadata requests must not call the RPC');
    const outputs = await Promise.all([
      client.callTool({ name: 'get_monad_block', arguments: {} }),
      client.callTool({ name: 'get_monad_block', arguments: {} }),
    ]);
    for (const raw of outputs) {
      const result = CallToolResultSchema.parse(raw);
      assert.notEqual(result.isError, true);
      assert.deepEqual(result.structuredContent, expected);
      assert.deepEqual(result.content, [{ type: 'text', text: JSON.stringify(expected) }]);
    }
    await client.ping();
    assert.equal(requests.length, 4);
    assert.equal(requests.filter(item => item.method === 'eth_chainId').length, 2);
    for (const item of requests.filter(item => item.method === 'eth_getBlockByNumber')) assert.deepEqual(item.params, ['latest', false]);
    assert.ok(observedMethods.includes('POST'));
  } finally {
    await client.close();
  }
});

test('same-origin browsers and clients without Origin are accepted; foreign and null origins are rejected', async () => {
  const { handler, requests } = rpcFixture();
  const ping = { jsonrpc: '2.0', id: 3, method: 'ping' };
  for (const origin of [undefined, 'https://observer.example']) {
    const response = await post(handler, ping, origin ? { Origin: origin } : {});
    assert.equal(response.status, 200);
  }
  for (const origin of ['https://attacker.example', 'null', 'https://observer.example.evil.test', 'https://observer.example/path']) {
    const response = await post(handler, call, { Origin: origin });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(requests.length, 0);
});

test('GET, DELETE and other methods return 405 instead of opening SSE or retaining sessions', async () => {
  const { handler, requests } = rpcFixture();
  for (const method of ['GET', 'DELETE', 'OPTIONS', 'PUT', 'PATCH', 'HEAD']) {
    const response = await handler(new Request(endpoint, { method }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(requests.length, 0);
});

test('SDK rejects malformed JSON and malformed protocol envelopes before any RPC request', async () => {
  const { handler, requests } = rpcFixture();
  for (const body of ['{bad-json', JSON.stringify({ method: 'tools/call' })]) {
    const response = await handler(new Request(endpoint, { method: 'POST', headers, body }));
    assert.equal(response.status, 400);
    assert.ok((await response.json()).error);
  }
  assert.equal(requests.length, 0);
});

test('request limits reject declared oversized bodies and streamed UTF-8 byte overflow', async () => {
  const { handler, requests } = rpcFixture();
  const declared = await post(handler, call, { 'Content-Length': String(16 * 1024 + 1) });
  assert.equal(declared.status, 413);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"padding":"'));
      controller.enqueue(new TextEncoder().encode('é'.repeat(9_000)));
      controller.enqueue(new TextEncoder().encode('"}'));
      controller.close();
    },
  });
  const request = new Request(endpoint, { method: 'POST', headers, body: stream, duplex: 'half' } as RequestInit);
  assert.equal(request.headers.get('content-length'), null);
  const streamed = await handler(request);
  assert.equal(streamed.status, 413);
  assert.equal(requests.length, 0);
});

test('HTTP content negotiation and unsupported protocol versions fail before tool dispatch', async () => {
  const { handler, requests } = rpcFixture();
  assert.equal((await post(handler, call, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post(handler, call, { Accept: 'text/plain' })).status, 406);
  assert.equal((await post(handler, call, { 'MCP-Protocol-Version': 'not-a-protocol' })).status, 400);
  assert.equal(requests.length, 0);
});

test('a small JSON-RPC batch cannot amplify one HTTP request into many upstream calls', async () => {
  const { handler, requests } = rpcFixture();
  const batch = Array.from({ length: 100 }, (_, id) => ({ ...call, id }));
  assert.ok(Buffer.byteLength(JSON.stringify(batch)) < 16 * 1024);
  const response = await post(handler, batch, { 'MCP-Protocol-Version': '2025-11-25' });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, -32600);
  for (const contentType of ['application/json+foo', 'text/plain; a=application/json']) {
    assert.equal((await post(handler, batch, { 'Content-Type': contentType })).status, 415);
  }
  for (const contentType of ['application/json; charset=utf-8', 'APPLICATION/JSON']) {
    assert.equal((await post(handler, batch, { 'Content-Type': contentType })).status, 400);
  }
  assert.equal(requests.length, 0);
});

test('strict empty tool arguments reject upstream URL overrides and unknown tools without network access', async () => {
  const { handler, requests } = rpcFixture();
  for (const params of [
    { name: 'get_monad_block', arguments: { rpcUrl: 'http://127.0.0.1/private' } },
    { name: 'get_monad_block', arguments: { blockNumber: 'latest' } },
    { name: 'send_transaction', arguments: {} },
  ]) {
    const result = await toolResult(handler, { ...call, params });
    assert.equal(result.isError, true);
  }
  assert.equal(requests.length, 0);
});

test('wrong-chain RPC fails closed before requesting a block', async () => {
  const { handler, requests } = rpcFixture(() => '0x8f'); // Monad mainnet 143 is not testnet.
  const result = await toolResult(handler);
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), /not Monad Testnet/);
  assert.deepEqual(requests.map(item => item.method), ['eth_chainId']);
});

test('HTTP, JSON-RPC and network failures never expose provider URLs, bodies or credentials', async () => {
  const secret = 'private-provider-key';
  const failures: (typeof fetch)[] = [
    async () => new Response(`upstream said ${secret}`, { status: 503 }),
    async () => Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: `${rpcUrl}?token=${secret}` } }),
    async () => { throw new Error(`Cannot fetch ${rpcUrl}?token=${secret}`); },
  ];
  for (const upstream of failures) {
    const result = await toolResult(createMonadMcpHandler({ rpcUrl, fetch: upstream }));
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent, undefined);
    assert.doesNotMatch(JSON.stringify(result), /private-provider-key|rpc\.example/);
  }
});

test('upstream HTTP failures cancel the unread response body', async () => {
  let cancelled = false;
  const upstream: typeof fetch = async () => new Response(new ReadableStream({
    cancel() { cancelled = true; },
  }), { status: 503 });
  const result = await toolResult(createMonadMcpHandler({ rpcUrl, fetch: upstream }));
  assert.equal(result.isError, true);
  assert.equal(cancelled, true);
});

test('null or malformed block fields produce errors rather than fabricated observations', async () => {
  for (const invalidBlock of [null, { ...block, hash: null }, { ...block, number: '0xno' }, { ...block, timestamp: '-1' }, { ...block, transactions: [{}] }]) {
    const { handler } = rpcFixture(message => message.method === 'eth_chainId' ? '0x279f' : invalidBlock);
    const result = await toolResult(handler);
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent, undefined);
  }
});

test('mismatched JSON-RPC response IDs are rejected', async () => {
  const result = await toolResult(createMonadMcpHandler({ rpcUrl, fetch: async () => Response.json({ jsonrpc: '2.0', id: 999, result: '0x279f' }) }));
  assert.equal(result.isError, true);
});

test('RPC timeout aborts the fetch and does not retry', async () => {
  let requests = 0;
  let aborted = false;
  const upstream: typeof fetch = async (_url, init) => {
    requests++;
    return new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => { aborted = true; reject(new Error('provider timeout: private-provider-key')); }, { once: true });
    });
  };
  const result = await toolResult(createMonadMcpHandler({ rpcUrl, fetch: upstream, timeoutMs: 20 }));
  assert.equal(result.isError, true);
  assert.equal(aborted, true);
  assert.equal(requests, 1);
  assert.doesNotMatch(JSON.stringify(result), /private-provider-key/);
});

test('oversized upstream bodies are bounded and not returned to the caller', async () => {
  const upstream: typeof fetch = async () => new Response('x'.repeat(2 * 1024 * 1024 + 1));
  const result = await toolResult(createMonadMcpHandler({ rpcUrl, fetch: upstream }));
  assert.equal(result.isError, true);
  assert.ok(JSON.stringify(result).length < 500);
});
