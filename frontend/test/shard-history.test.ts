import assert from 'node:assert/strict';
import test from 'node:test';
import { shardDisplay } from '../lib/shard-history';
import type { Shard, Snapshot } from '../lib/types';

const oldShard: Shard = { address: `0x${'11'.repeat(20)}`, agentId: '2', taskId: `0x${'22'.repeat(32)}`, sequenceNonce: '1',
  executor: `0x${'33'.repeat(20)}`, inputHash: `0x${'44'.repeat(32)}`, createdBlock: '100', transactionHash: `0x${'55'.repeat(32)}`, status: 'executed' };
const snapshot: Snapshot = { blockNumber: '1002', chainId: 10143, sampledAt: '2026-10-10T00:00:00.000Z', fromBlock: '801', tps: 0,
  sampleSeconds: 10, blockSamples: [], registeredAgents: '2', activeAgents: 0, executions: 0, shards: [], errors: [], routerConfigured: true,
  registryConfigured: true, eventsAvailable: true, source: { kind: 'envio', indexedThrough: '1000' }, batches: [], resultsLimited: false,
  shardHistory: { shards: [oldShard], fromBlock: '90', toBlock: '1000', resultsLimited: false } };

test('visualizer and ledger use labeled indexed history without changing live activity counters', () => {
  const display = shardDisplay(snapshot);
  assert.deepEqual(display.shards, [oldShard]);
  assert.equal(display.scopeLabel, 'Indexed task history');
  assert.equal(display.indexedHistory, true);
  assert.equal(display.toBlock, '1000');
  assert.equal(snapshot.shards.length, 0);
  assert.equal(snapshot.executions, 0);
  assert.equal(snapshot.activeAgents, 0);
});
test('RPC fallback and unavailable events never present older cached history as current indexed data', () => {
  const rpc = shardDisplay({ ...snapshot, source: { kind: 'rpc' } });
  assert.deepEqual(rpc.shards, []);
  assert.equal(rpc.scopeLabel, 'Recent block window');
  assert.equal(rpc.indexedHistory, false);
  assert.equal(rpc.toBlock, '1002');
  assert.deepEqual(shardDisplay({ ...snapshot, eventsAvailable: false }).shards, []);
  assert.deepEqual(shardDisplay(undefined).shards, []);
});
test('older API snapshots remain usable and history truncation does not alter recent window labels', () => {
  assert.equal(shardDisplay({ ...snapshot, shardHistory: undefined }).scopeLabel, 'Recent block window');
  assert.equal(shardDisplay({ ...snapshot, shardHistory: { ...snapshot.shardHistory!, resultsLimited: true } }).resultsLimited, true);
  assert.equal(snapshot.resultsLimited, false);
});
