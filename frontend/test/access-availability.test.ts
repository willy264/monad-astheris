import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import type { AccessConfig } from '../lib/access-protocol';
import { ACCESS_UNAVAILABLE_MESSAGE, accessConfigQueryOptions, checkAccessService } from '../lib/access-service';

const config: AccessConfig = { chainId: 10143, router: `0x${'33'.repeat(20)}`, identity: `0x${'44'.repeat(20)}`, relayers: [], sessionTtlSeconds: 900 };

test('availability preflight and retry use only public GETs without a wallet or inbox authorization', async context => {
  const client = new QueryClient();
  context.after(() => client.clear());
  let healthy = false;
  const calls: { url: string; method: string }[] = [];
  context.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method || 'GET' });
    assert.equal(init?.body, undefined);
    assert.equal(init?.headers, undefined);
    assert.equal(init?.cache, 'no-store');
    assert.ok(init?.signal);
    return healthy ? Response.json(config) : Response.json({ error: 'Unavailable' }, { status: 503 });
  });
  await assert.rejects(checkAccessService(client), { message: ACCESS_UNAVAILABLE_MESSAGE });
  assert.equal(calls.length, 1, 'failed checks do not automatically retry');
  healthy = true;
  assert.deepEqual(await checkAccessService(client), config);
  assert.deepEqual(calls, [
    { url: '/api/access-requests/config', method: 'GET' },
    { url: '/api/access-requests/config', method: 'GET' },
  ]);
});

test('failed refetch rejects cached config while retaining existing inbox and approval history', async context => {
  const client = new QueryClient();
  const observer = new QueryObserver(client, { ...accessConfigQueryOptions, enabled: false });
  const unsubscribe = observer.subscribe(() => {});
  context.after(() => { unsubscribe(); client.clear(); });
  let healthy = true;
  context.mock.method(globalThis, 'fetch', async () => healthy ? Response.json(config) : Response.json({ error: 'Offline' }, { status: 503 }));
  await checkAccessService(client);
  assert.equal(observer.getCurrentResult().isSuccess, true);
  const historyKey = ['access-inbox', 'existing-wallet', config.router, 1800000800];
  const history = { requests: [{ id: 'saved-request', status: 'approving', transactionHash: 'saved-public-hash' }] };
  client.setQueryData(historyKey, history);
  healthy = false;
  await assert.rejects(checkAccessService(client), { message: ACCESS_UNAVAILABLE_MESSAGE });
  assert.equal(observer.getCurrentResult().isError, true);
  assert.deepEqual(observer.getCurrentResult().data, config, 'React Query retains data; error status must block prompts');
  assert.deepEqual(client.getQueryData(historyKey), history);
  healthy = true;
  assert.deepEqual(await checkAccessService(client), config);
  assert.equal(observer.getCurrentResult().isError, false);
  assert.deepEqual(client.getQueryData(historyKey), history);
});

test('an incompatible config is unavailable even if the endpoint returns HTTP 200', async context => {
  const client = new QueryClient();
  context.after(() => client.clear());
  context.mock.method(globalThis, 'fetch', async () => Response.json({ ...config, chainId: 1 }));
  await assert.rejects(checkAccessService(client), { message: ACCESS_UNAVAILABLE_MESSAGE });
  assert.equal(client.getQueryData(accessConfigQueryOptions.queryKey), undefined);
});
