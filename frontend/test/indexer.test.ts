import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { encodePacked, keccak256 } from 'viem';
import { count, graphqlRequest, parseAgent, parseBatches, parseProgress, parseShard } from '../lib/indexer-protocol';

const scope = { chainId: 10143, router: `0x${'11'.repeat(20)}`, registry: `0x${'22'.repeat(20)}` };
const hash = `0x${'33'.repeat(32)}` as const;
const address = `0x${'44'.repeat(20)}`;
const progress = { id: `${scope.chainId}:${scope.router}:${scope.registry}`, ...scope, blockNumber: '42' };
test('progress cannot come from another deployment or silently represent no indexing', () => {
  assert.equal(parseProgress([progress], scope), '42');
  assert.throws(() => parseProgress([], scope), /not indexed/);
  assert.throws(() => parseProgress([{ ...progress, router: address }], scope), /different contract/);
  assert.throws(() => parseProgress([{ ...progress, chainId: 1 }], scope), /different chain/);
});
test('directory and shard parsing reject mismatched identities and malformed output commitments', () => {
  const agent = { id: `10143:${scope.registry}:1`, chainId: 10143, registry: scope.registry, agentId: '1', owner: address, agentURI: 'ipfs://example', tasksCompleted: '2' };
  assert.equal(parseAgent(agent, scope).tasksCompleted, '2');
  assert.throws(() => parseAgent({ ...agent, registry: address }, scope), /different contract/);
  const shard = { id: `10143:${address}`, chainId: 10143, router: scope.router, address, agentId: '1', taskId: hash, sequenceNonce: '0', executor: address, inputHash: hash, outputHash: hash, proofHash: hash, status: 'completed', createdBlock: '41', completedBlock: '42', creationTx: hash, agent: { registry: scope.registry }, execution: { transactionHash: hash, blockNumber: '42' } };
  assert.equal(parseShard(shard, scope, 40n, 42n).status, 'executed');
  assert.throws(() => parseShard({ ...shard, outputHash: '0x1234' }, scope, 40n, 42n), /invalid address or hash/);
  assert.throws(() => parseShard(shard, scope, 42n, 50n), /outside/);
  assert.equal(parseShard({ ...shard, completedBlock: '43' }, scope, 40n, 42n).status, 'created');
});
test('Merkle verified status requires matching canonical batch identity, root, range and count', () => {
  const batchId = keccak256(encodePacked(['uint256', 'address', 'uint256', 'bytes32'], [10143n, scope.router as `0x${string}`, 42n, hash]));
  const batch = { chainId: 10143, router: scope.router, batchId, blockNumber: '42', blockHash: hash, root: hash, leafCount: '2', status: 'committed', committedRoot: hash, committedLeafCount: '2', commitmentTx: hash };
  const commitment = { chainId: 10143, router: scope.router, batchId, root: hash, leafCount: '2', fromBlock: '42', toBlock: '42', verified: true };
  assert.equal(parseBatches([batch], [commitment], scope, 42n)[0].verified, true);
  assert.equal(parseBatches([batch], [{ ...commitment, leafCount: '1' }], scope, 42n)[0].verified, false);
  assert.equal(parseBatches([batch], [], scope, 42n)[0].verified, false);
  assert.throws(() => parseBatches([{ ...batch, batchId: hash }], [commitment], scope, 42n), /different block/);
});
test('GraphQL request bounds transport and never forwards provider errors or credentials to callers', async () => {
  const fetcher: typeof fetch = async (_url, options) => {
    assert.equal(options?.redirect, 'error'); assert.equal(options?.cache, 'no-store'); assert.ok(options?.signal);
    assert.equal((options?.headers as Record<string, string>)['x-hasura-admin-secret'], 'test-only-value');
    return Response.json({ data: { safe: true } });
  };
  assert.deepEqual(await graphqlRequest('https://indexer.example/v1/graphql', { 'x-hasura-admin-secret': 'test-only-value' }, 'query { safe }', {}, fetcher), { safe: true });
  await assert.rejects(graphqlRequest('https://indexer.example/v1/graphql', {}, '', {}, async () => Response.json({ errors: [{ message: 'secret provider diagnostic' }] })), error => error instanceof Error && /rejected the query/.test(error.message) && !error.message.includes('secret provider'));
  await assert.rejects(graphqlRequest('http://untrusted.example/v1/graphql', {}, '', {}, fetcher), /HTTPS/);
  await assert.rejects(graphqlRequest('https://user:password@indexer.example/', {}, '', {}, fetcher), /HTTPS/);
});
test('GraphQL response caps and count guards reject oversized or lossy data', async () => {
  await assert.rejects(graphqlRequest('http://localhost:8081/v1/graphql', {}, '', {}, async () => new Response('x'.repeat(1024 * 1024 + 1))), /exceeds 1 MiB/);
  assert.throws(() => count({ aggregate: { count: 9007199254740992 } }));
  assert.throws(() => count({ aggregate: { count: '-1' } }));
  assert.equal(count({ aggregate: { count: 0 } }), 0);
});
