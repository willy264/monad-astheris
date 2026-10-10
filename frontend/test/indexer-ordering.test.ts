import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { type TestContext } from 'node:test';
import { encodeAbiParameters } from 'viem';

const router = `0x${'11'.repeat(20)}` as const;
const registry = `0x${'22'.repeat(20)}` as const;
const other = `0x${'33'.repeat(20)}` as const;
const hash = `0x${'44'.repeat(32)}` as const;
const rpcUrl = 'https://ordering-rpc.example/';
const graphqlUrl = 'https://ordering-indexer.example/graphql';

// Next resolves this marker to its empty server entry. Reproduce that mapping
// so these tests execute the real server functions outside the Next bundler.
const serverMarker = registerHooks({
  resolve(specifier, context, next) {
    return next(specifier === 'server-only' ? 'next/dist/compiled/server-only/empty.js' : specifier, context);
  },
});
const settings = {
  MONAD_RPC_URL: rpcUrl,
  ENVIO_GRAPHQL_URL: graphqlUrl,
  NEXT_PUBLIC_ROUTER_ADDRESS: router,
  NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS: registry,
  NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS: '',
  DEPLOYMENT_BLOCK: '900',
  EVENT_LOOKBACK_BLOCKS: '200',
};
const previous = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
Object.assign(process.env, settings);
const server = import('../lib/server');

type Changes = { chainId?: number; indexedOffset?: bigint; progressRouter?: string; linkedRegistry?: `0x${string}`; start?: bigint; shardCreatedBlock?: bigint };
function fixture(context: TestContext, changes: Changes = {}) {
  const calls: string[] = [];
  let head = changes.start ?? 1000n;
  let captured = 0n;
  let overviewVariables: Record<string, any> | undefined;
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body));
    if (url === graphqlUrl) {
      if (body.query.includes('query Progress')) {
        calls.push('indexer:progress');
        head += 3n;
        captured = head + (changes.indexedOffset ?? 0n);
        return Response.json({ data: { progress: [{ id: `10143:${router}:${registry}`, chainId: 10143, router: changes.progressRouter ?? router, registry, blockNumber: captured.toString() }] } });
      }
      if (body.query.includes('query Directory')) {
        calls.push('indexer:directory');
        head += 5n;
        return Response.json({ data: { registered: { aggregate: { count: 0 } }, agents: [] } });
      }
      if (body.query.includes('query Overview')) {
        calls.push('indexer:overview');
        overviewVariables = body.variables;
        head += 5n;
        return Response.json({ data: {
          registered: { aggregate: { count: 1 } }, active: { aggregate: { count: 0 } }, executions: { aggregate: { count: 0 } },
          shards: [{ id: `10143:${other}`, chainId: 10143, router, address: other, agentId: '1', taskId: hash, sequenceNonce: '1', executor: other,
            inputHash: hash, outputHash: hash, proofHash: hash, status: 'completed', createdBlock: (changes.shardCreatedBlock ?? captured - 1n).toString(), completedBlock: head.toString(),
            creationTx: hash, agent: { registry }, execution: { transactionHash: hash, blockNumber: head.toString() } }],
          batches: [], commitments: [],
        } });
      }
      throw new Error('Unexpected GraphQL operation');
    }
    assert.equal(url, rpcUrl, 'The test must never contact a real upstream');
    calls.push(`rpc:${body.method}${body.method === 'eth_getBlockByNumber' ? `:${body.params[0]}` : ''}`);
    let result: unknown;
    switch (body.method) {
      case 'eth_chainId': result = `0x${(changes.chainId ?? 10143).toString(16)}`; break;
      case 'eth_blockNumber': head += 4n; result = `0x${head.toString(16)}`; break;
      case 'eth_call': result = encodeAbiParameters([{ type: 'address' }], [changes.linkedRegistry ?? registry]); break;
      case 'eth_getBlockByNumber': {
        if (body.params[0] === 'latest') head += 4n;
        const number = body.params[0] === 'latest' ? head : BigInt(body.params[0]);
        result = { number: `0x${number.toString(16)}`, timestamp: `0x${number.toString(16)}`, transactions: [], hash, parentHash: hash,
          gasLimit: '0x1000000', gasUsed: '0x0', difficulty: '0x0', size: '0x1', extraData: '0x', miner: other, nonce: '0x0000000000000000',
          logsBloom: `0x${'00'.repeat(256)}`, receiptsRoot: hash, stateRoot: hash, transactionsRoot: hash, sha3Uncles: hash, uncles: [] };
        break;
      }
      default: throw new Error(`Unexpected RPC operation ${body.method}`);
    }
    return Response.json({ jsonrpc: '2.0', id: body.id, result });
  });
  return { calls, variables: () => overviewVariables };
}

test('indexed reads pin their checkpoint before sampling a fresh RPC head', async context => {
  try {
    const { getSnapshot, getAgentPage } = await server;
    await context.test('a genuinely ahead indexer still fails the strict RPC head guard', async child => {
      const state = fixture(child, { indexedOffset: 20n });
      await assert.rejects(getSnapshot(), /ahead of the configured RPC/);
      assert.ok(!state.calls.includes('indexer:overview'));
    });
    await context.test('a checkpoint before deployment is still rejected', async child => {
      fixture(child, { start: 800n });
      await assert.rejects(getSnapshot(), /catching up to the configured deployment/);
    });
    await context.test('checkpoint scope and RPC chain checks still reject mismatches', async child => {
      const state = fixture(child, { progressRouter: other });
      await assert.rejects(getSnapshot(), /different contract deployment/);
      assert.ok(!state.calls.some(call => call.startsWith('rpc:')));
      child.mock.restoreAll();
      fixture(child, { chainId: 1 });
      await assert.rejects(getSnapshot(), /not Monad Testnet/);
    });
    await context.test('router identity linkage must still match for both views', async child => {
      fixture(child, { linkedRegistry: other });
      await assert.rejects(getSnapshot(), /router and identity registry must match/);
      await assert.rejects(getAgentPage(2), /Router and indexed identity registry do not match/);
    });
    await context.test('overview succeeds while the chain advances and queries remain bounded to the captured checkpoint', async child => {
      const state = fixture(child);
      const snapshot = await getSnapshot();
      assert.equal(snapshot.blockNumber, '1007');
      assert.equal(snapshot.source.indexedThrough, '1003');
      assert.equal(snapshot.source.lagBlocks, '4');
      assert.equal(snapshot.shards[0].status, 'created', 'Completion after the checkpoint must not leak into this reading');
      assert.equal(snapshot.shards[0].executionTransactionHash, undefined);
      assert.equal(state.calls.filter(call => call === 'indexer:progress').length, 1);
      assert.ok(state.calls.indexOf('indexer:progress') < state.calls.indexOf('rpc:eth_getBlockByNumber:latest'));
      const variables = state.variables()!;
      assert.deepEqual(variables.shards.createdBlock, { _gte: '900', _lte: '1003' });
      assert.deepEqual(variables.executions.blockNumber, variables.shards.createdBlock);
      assert.deepEqual(variables.batches.blockNumber, { _lte: '1003' });
      assert.deepEqual(variables.commitments.toBlock, { _lte: '1003' });
    });
    await context.test('directory samples after indexed data and bypasses Viem head caching for consecutive pages', async child => {
      const state = fixture(child);
      const first = await getAgentPage(0);
      const second = await getAgentPage(1);
      assert.equal(first.source.indexedThrough, '1003');
      assert.equal(second.source.indexedThrough, '1015');
      assert.equal(first.source.lagBlocks, '9');
      assert.equal(second.source.lagBlocks, '9');
      assert.equal(state.calls.filter(call => call === 'rpc:eth_blockNumber').length, 2, 'Each indexed response needs a newly sampled head');
      const directory = state.calls.indexOf('indexer:directory');
      assert.ok(directory >= 0 && directory < state.calls.indexOf('rpc:eth_blockNumber'));
    });
    await context.test('history query keeps earlier shards while execution aggregates remain in the recent window', async child => {
      const { getIndexedCheckpoint, getIndexedSnapshot } = await import('../lib/indexer');
      const state = fixture(child, { start: 2000n, shardCreatedBlock: 901n });
      const checkpoint = await getIndexedCheckpoint();
      const snapshot = await getIndexedSnapshot(2007n, 200n, 900n, checkpoint);
      assert.equal(snapshot.shards.length, 0);
      assert.equal(snapshot.shardHistory.shards.length, 1);
      assert.equal(snapshot.shardHistory.shards[0].createdBlock, '901');
      assert.equal(snapshot.executions, 0);
      assert.equal(snapshot.activeAgents, 0);
      assert.equal(snapshot.fromBlock, '1804');
      const variables = state.variables()!;
      assert.deepEqual(variables.shards, { chainId: { _eq: 10143 }, router: { _eq: router }, createdBlock: { _gte: '900', _lte: '2003' }, agent: { registry: { _eq: registry } } });
      assert.deepEqual(variables.executions.blockNumber, { _gte: '1804', _lte: '2003' });
      assert.equal(state.calls.filter(call => call === 'indexer:overview').length, 1);
      assert.ok(!state.calls.some(call => call.startsWith('rpc:')), 'Reading history must not scan historical RPC logs');
    });
    await context.test('directory still rejects progress ahead of its fresh RPC head', async child => {
      fixture(child, { indexedOffset: 20n });
      await assert.rejects(getAgentPage(3), /outside the configured deployment range/);
    });
  } finally {
    serverMarker.deregister();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
