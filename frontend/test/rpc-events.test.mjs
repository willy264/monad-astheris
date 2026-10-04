import assert from 'node:assert/strict';
import test from 'node:test';
import { readEventWindow } from '../lib/rpc-events.mjs';

test('reads the default 200-block window within the RPC cap without gaps or duplicates', async () => {
  const start = 68_076_759n;
  const end = start + 199n;
  const requested = [];
  const events = await readEventWindow(start, end, async ({ fromBlock, toBlock }) => {
    assert.ok(toBlock - fromBlock + 1n <= 100n, 'provider rejects larger requests');
    for (let block = fromBlock; block <= toBlock; block++) requested.push(block);
    return [{ block: fromBlock }, { block: toBlock }];
  });
  assert.deepEqual(requested, Array.from({ length: 200 }, (_, index) => start + BigInt(index)));
  assert.deepEqual(events, [start, start + 99n, start + 100n, end].map(block => ({ block })));
});

test('preserves a single genesis block and a short final chunk', async () => {
  const genesis = await readEventWindow(0n, 0n, async range => [range]);
  assert.deepEqual(genesis, [{ fromBlock: 0n, toBlock: 0n }]);
  const ranges = await readEventWindow(8n, 208n, async range => [range]);
  assert.deepEqual(ranges, [
    { fromBlock: 8n, toBlock: 107n },
    { fromBlock: 108n, toBlock: 207n },
    { fromBlock: 208n, toBlock: 208n },
  ]);
});

test('returns an empty result without making a request for an empty window', async () => {
  const events = await readEventWindow(10n, 9n, async () => assert.fail('No blocks should be requested.'));
  assert.deepEqual(events, []);
});

test('reads the maximum dashboard window sequentially and retains event order', async () => {
  const origin = 9_007_199_254_740_993n;
  let active = 0;
  let calls = 0;
  const events = await readEventWindow(origin, origin + 999n, async range => {
    active++;
    assert.equal(active, 1, 'only one chunk per event series may be in flight');
    await new Promise(resolve => setImmediate(resolve));
    calls++;
    active--;
    return [range.fromBlock, range.toBlock];
  });
  assert.equal(calls, 10);
  assert.equal(events[0], origin);
  assert.equal(events.at(-1), origin + 999n);
  assert.ok(events.every((block, index) => index === 0 || block > events[index - 1]));
});

test('propagates a middle-chunk failure without retrying or publishing partial data', async () => {
  const failure = new Error('RPC request failed after transport retries');
  const calls = [];
  await assert.rejects(readEventWindow(1n, 300n, async range => {
    calls.push(range);
    if (calls.length === 2) throw failure;
    return [{ transactionHash: 'first-chunk-event' }];
  }), error => error === failure);
  assert.deepEqual(calls, [
    { fromBlock: 1n, toBlock: 100n },
    { fromBlock: 101n, toBlock: 200n },
  ]);
});

test('rejects negative blocks before contacting an RPC provider', async () => {
  await assert.rejects(readEventWindow(-1n, 1n, async () => assert.fail('Invalid range must not be requested.')), RangeError);
});
