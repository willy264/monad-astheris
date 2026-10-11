import assert from 'node:assert/strict';
import test from 'node:test';
import { activityMetrics } from '../lib/activity-metrics';
import type { Snapshot } from '../lib/types';

const snapshot: Snapshot = {
  blockNumber: '1002', chainId: 10143, sampledAt: '2026-10-11T00:00:00Z', fromBlock: '801', tps: 0,
  sampleSeconds: 10, blockSamples: [], registeredAgents: '2', activeAgents: 0, executions: 0, shards: [], errors: [],
  routerConfigured: true, registryConfigured: true, eventsAvailable: true, source: { kind: 'envio', indexedThrough: '1000' },
  batches: [], resultsLimited: false, shardHistory: { shards: [], fromBlock: '90', toBlock: '1000', resultsLimited: true },
  indexedTotals: { completedTaskLanes: 416, verifiedBatchRoots: 31, fromBlock: '90', toBlock: '1000' },
};
test('totals come from aggregates even when older records leave capped lists and recent activity is zero', () => {
  const metrics = activityMetrics(snapshot);
  assert.equal(metrics.taskLanes, 416);
  assert.equal(metrics.verifiedBatchRoots, 31);
  assert.equal(metrics.indexedTotal, true);
  assert.equal(metrics.taskLanesLimited, false);
  assert.equal(metrics.indexedThrough, '1000');
  assert.equal(snapshot.executions, 0);
});
test('RPC readings retain recent-window semantics and old API readings never infer totals from arrays', () => {
  const rpc = activityMetrics({ ...snapshot, source: { kind: 'rpc' } });
  assert.equal(rpc.taskLanes, 0);
  assert.equal(rpc.verifiedBatchRoots, null);
  assert.equal(rpc.indexedTotal, false);
  const oldApi = activityMetrics({ ...snapshot, indexedTotals: undefined });
  assert.equal(oldApi.taskLanes, null);
  assert.equal(oldApi.verifiedBatchRoots, null);
  assert.equal(oldApi.indexedTotal, false);
  assert.equal(oldApi.indexedTotalsUnavailable, true);
  assert.equal(activityMetrics({ ...snapshot, source: { kind: 'rpc' }, resultsLimited: true }).taskLanesLimited, true);
});
test('a real zero total is preserved while unavailable readings never claim zero activity', () => {
  const zero = activityMetrics({ ...snapshot, indexedTotals: { ...snapshot.indexedTotals!, completedTaskLanes: 0, verifiedBatchRoots: 0 } });
  assert.equal(zero.taskLanes, 0);
  assert.equal(zero.verifiedBatchRoots, 0);
  for (const reading of [undefined, { ...snapshot, eventsAvailable: false }]) {
    assert.equal(activityMetrics(reading).taskLanes, null);
    assert.equal(activityMetrics(reading).verifiedBatchRoots, null);
  }
});
