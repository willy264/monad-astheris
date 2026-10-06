import assert from 'node:assert/strict';
import test from 'node:test';
import { networkStatus } from '../lib/network-status';
import type { Snapshot } from '../lib/types';
test('network badge requires a fresh successful Monad sample, even with cached data', () => {
  const now = Date.now();
  const sample = { chainId: 10143, blockNumber: '68000000', sampledAt: new Date(now).toISOString() } as Snapshot;
  assert.equal(networkStatus(undefined, false, now).state, 'loading');
  assert.equal(networkStatus(sample, false, now).state, 'active');
  assert.equal(networkStatus(sample, true, now).state, 'offline');
  assert.equal(networkStatus(sample, false, now + 61000).state, 'stale');
  assert.equal(networkStatus({ ...sample, chainId: 1 }, false, now).state, 'offline');
  assert.equal(networkStatus({ ...sample, sampledAt: 'invalid' }, false, now).state, 'stale');
  assert.equal(networkStatus({ ...sample, blockNumber: '0' }, false, now).state, 'offline');
});
