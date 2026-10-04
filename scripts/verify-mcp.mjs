import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { keccak256, toBytes } from 'viem';

// Public verification only: this helper neither loads .env nor uses credentials.
// Run after deployment: node scripts/verify-mcp.mjs <https://host/api/mcp> [public-rpc-url]
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function check(condition, message) { if (!condition) throw new Error(message); }
function publicUrl(value) {
  const url = new URL(value);
  check(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)), 'Only HTTPS or localhost URLs are permitted.');
  check(!url.username && !url.password && !url.search && !url.hash, 'Use public URLs without credentials, query strings or fragments.');
  return url;
}
check(process.argv[2], 'Usage: node scripts/verify-mcp.mjs <https://host/api/mcp> [public-rpc-url]');
const endpoint = publicUrl(process.argv[2]);
const rpcUrl = publicUrl(process.argv[3] || 'https://testnet-rpc.monad.xyz');
const directory = path.join(repository, 'scripts', '.artifacts', 'mcp', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(directory, { recursive: true });
const report = { endpoint: endpoint.href, independentRpc: rpcUrl.href, startedAt: new Date().toISOString(), scope: 'Official MCP initialize/list/get_monad_block, then independent read-only chain and exact-block RPC checks. No environment files, credentials, payment, private keys or blockchain writes.', requests: [], checks: [] };
function record(condition, description, details = {}) { check(condition, description); report.checks.push({ description, ...details }); }
async function limited(response, limit = 256 * 1024) {
  check(response.body, 'Remote response has no body.'); const reader = response.body.getReader(); const chunks = []; let size = 0;
  try { for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.length; check(size <= limit, 'Remote response exceeded verification limit.'); chunks.push(item.value); } }
  finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString('utf8');
}
const allowedMcpMethods = new Set(['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
const transport = new StreamableHTTPClientTransport(endpoint, {
  reconnectionOptions: { maxRetries: 0, maxReconnectionDelay: 1000, initialReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 },
  fetch: async (input, init = {}) => {
    const target = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    check(target.href === endpoint.href, 'SDK attempted another endpoint.');
    const method = (init.method || 'GET').toUpperCase(); check(['POST', 'GET'].includes(method), 'Only MCP initialization and read-only tool transport are allowed.');
    let rpcMethod;
    if (method === 'POST') {
      check(typeof init.body === 'string', 'Expected an explicit JSON MCP request.'); const request = JSON.parse(init.body); rpcMethod = request.method;
      check(!Array.isArray(request) && allowedMcpMethods.has(rpcMethod), 'Unexpected MCP method.');
      if (rpcMethod === 'tools/call') check(request.params?.name === 'get_monad_block' && Object.keys(request.params.arguments || {}).length === 0, 'Only the empty-argument read-only block tool is permitted.');
    }
    const signals = [AbortSignal.timeout(30000), ...(init.signal ? [init.signal] : [])];
    const response = await fetch(target, { ...init, redirect: 'error', signal: AbortSignal.any(signals), credentials: 'omit' });
    report.requests.push({ service: 'mcp', httpMethod: method, rpcMethod, status: response.status });
    if (!response.body) return response;
    let count = 0;
    const body = response.body.pipeThrough(new TransformStream({ transform(chunk, controller) { count += chunk.length; check(count <= 256 * 1024, 'MCP response exceeds verification limit.'); controller.enqueue(chunk); } }));
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  },
});
const client = new Client({ name: 'aetheris-public-mcp-verifier', version: '1.0.0' }, { capabilities: {} });
let rpcSequence = 0;
async function rpc(method, params) {
  check(['eth_chainId', 'eth_getBlockByNumber', 'eth_getBlockByHash'].includes(method), 'Non-read RPC method refused.');
  const id = ++rpcSequence;
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(30000) });
  report.requests.push({ service: 'independent-rpc', method, status: response.status });
  check(response.ok, `Independent RPC HTTP ${response.status}.`); const value = JSON.parse(await limited(response, 4 * 1024 * 1024));
  check(value.jsonrpc === '2.0' && value.id === id && !value.error && value.result !== undefined && value.result !== null, 'Independent RPC did not return the matching requested chain/block.'); return value.result;
}
try {
  await client.connect(transport, { timeout: 30000 });
  record(transport.protocolVersion === '2025-11-25', 'MCP negotiated protocol 2025-11-25', { protocolVersion: transport.protocolVersion, server: client.getServerVersion() });
  record(Boolean(client.getServerCapabilities()?.tools), 'Server declares MCP tools capability');
  const listed = await client.listTools({}, { timeout: 30000 });
  record(!listed.nextCursor && listed.tools.length === 1 && listed.tools[0].name === 'get_monad_block', 'Exactly one intended public tool is listed');
  const tool = listed.tools[0];
  record(tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint === false && tool.annotations?.idempotentHint === true && tool.annotations?.openWorldHint === true, 'Tool advertises read-only, non-destructive, idempotent behavior and external data access');
  record(tool.inputSchema?.type === 'object' && tool.inputSchema.additionalProperties === false && Object.keys(tool.inputSchema.properties || {}).length === 0 && !tool.inputSchema.required?.length, 'Tool accepts no configurable RPC or write arguments');
  const result = await client.callTool({ name: 'get_monad_block', arguments: {} }, CallToolResultSchema, { timeout: 30000 });
  record(result.isError !== true && Boolean(result.structuredContent), 'Real get_monad_block call returned structured output');
  const output = result.structuredContent;
  record(Object.keys(output).sort().join(',') === 'blockHash,blockNumber,chainId,timestamp,transactionCount'
    && output.chainId === 10143 && typeof output.blockNumber === 'string' && /^(0|[1-9][0-9]*)$/.test(output.blockNumber)
    && typeof output.timestamp === 'string' && /^(0|[1-9][0-9]*)$/.test(output.timestamp)
    && typeof output.blockHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(output.blockHash)
    && Number.isSafeInteger(output.transactionCount) && output.transactionCount >= 0, 'Output fields and chain conform to the published schema');
  const text = result.content.filter(item => item.type === 'text');
  record(text.length === 1 && JSON.stringify(JSON.parse(text[0].text)) === JSON.stringify(output), 'Text output and structured output describe the same block');
  const [chainId, blockByNumber, blockByHash] = await Promise.all([
    rpc('eth_chainId', []), rpc('eth_getBlockByNumber', [`0x${BigInt(output.blockNumber).toString(16)}`, false]), rpc('eth_getBlockByHash', [output.blockHash, false]),
  ]);
  record(BigInt(chainId) === 10143n, 'Independent RPC confirms Monad Testnet chain 10143');
  for (const [lookup, block] of [['number', blockByNumber], ['hash', blockByHash]]) record(
    BigInt(block.number) === BigInt(output.blockNumber) && block.hash.toLowerCase() === output.blockHash.toLowerCase()
      && BigInt(block.timestamp) === BigInt(output.timestamp) && Array.isArray(block.transactions) && block.transactions.length === output.transactionCount,
    `Independent lookup by ${lookup} matches number, hash, timestamp and transaction count`);
  report.output = output;
  report.outputJsonKeccak256 = keccak256(toBytes(JSON.stringify(output)));
  report.passed = true;
  console.log(JSON.stringify({ passed: true, checks: report.checks.length, protocolVersion: transport.protocolVersion, output, report: path.join(directory, 'report.json') }, null, 2));
} catch (error) {
  report.passed = false; report.error = error instanceof Error ? error.message.slice(0, 1000) : 'Verification failed.'; process.exitCode = 1;
  console.error(JSON.stringify({ passed: false, error: report.error, report: path.join(directory, 'report.json') }));
} finally {
  await client.close().catch(() => {}); report.finishedAt = new Date().toISOString();
  await writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
