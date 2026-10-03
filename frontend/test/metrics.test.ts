import assert from 'node:assert/strict';
import test from 'node:test';
import { metricReading } from '../lib/metrics';

test('real zero activity stays zero rather than turning into an example', () => {
  assert.deepEqual(metricReading(0, 128, false), { value: 0, kind: 'live', badge: 'Live data' });
});

test('disconnect preserves cached values with an explicit stale label', () => {
  assert.deepEqual(metricReading(7, 128, false, true), { value: 7, kind: 'cached', badge: 'Last observed' });
  assert.equal(metricReading(undefined, 128, false, true).kind, 'sample');
});

test('missing, loading and invalid values cannot appear as live measurements', () => {
  assert.deepEqual(metricReading(null, 24, true), { value: null, kind: 'loading', badge: 'Connecting' });
  for (const missing of [null, undefined, NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(metricReading(missing, 24, false), { value: 24, kind: 'sample', badge: 'Sample data' });
  }
});
