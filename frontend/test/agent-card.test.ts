import assert from 'node:assert/strict';
import test from 'node:test';
import { agentCard } from '../lib/agent-card';

const cid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3udvq6wlbkqkhtktp44dsh3tu';
const uri = `ipfs://${cid}/cards/agent.json`;
const card = { name: 'Observed agent', description: 'Actual supplied metadata', capabilities: ['get_monad_block'] };
const primary = `https://ipfs.io/ipfs/${cid}/cards/agent.json`;
const fallback = `https://gateway.pinata.cloud/ipfs/${cid}/cards/agent.json`;

function fixture(responses: Array<Response | Error>) {
  const requests: string[] = [];
  const upstream: typeof fetch = async (url, init) => {
    requests.push(String(url));
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.cache, 'no-store');
    assert.ok(init?.signal);
    assert.equal(init.signal.aborted, false);
    const response = responses.shift();
    if (!response) throw new Error('Unexpected extra request.');
    if (response instanceof Error) throw response;
    return response;
  };
  return { requests, upstream };
}

test('valid IPFS metadata uses the default gateway once and preserves supplied content', async () => {
  const { requests, upstream } = fixture([Response.json(card)]);
  assert.deepEqual(await agentCard(uri.replace('ipfs://', 'ipfs://ipfs/'), { fetch: upstream }), card);
  assert.deepEqual(requests, [primary]);
});

test('omitted and canonical default gateways fall back once after 429 or server failures', async () => {
  for (const gateway of [undefined, 'https://ipfs.io/ipfs/', 'https://ipfs.io/ipfs']) {
    for (const status of [429, 500, 503, 599]) {
      const { requests, upstream } = fixture([new Response(null, { status }), Response.json(card)]);
      assert.deepEqual(await agentCard(uri, { gateway, fetch: upstream }), card);
      assert.deepEqual(requests, [primary, fallback]);
    }
  }
});

test('network, timeout and interrupted response failures can use the fixed fallback', async () => {
  const interrupted = new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('Socket closed')); } }));
  for (const failure of [new TypeError('Network failure'), new DOMException('Request timed out', 'TimeoutError'), interrupted]) {
    const { requests, upstream } = fixture([failure, Response.json(card)]);
    assert.deepEqual(await agentCard(uri, { fetch: upstream }), card);
    assert.deepEqual(requests, [primary, fallback]);
  }
});

test('custom gateways are exclusive for success, rate limits, server failures and network failures', async () => {
  const gateway = 'https://operator.example/ipfs/';
  for (const response of [Response.json(card), new Response(null, { status: 429 }), new Response(null, { status: 503 }), new TypeError('Offline')]) {
    const { requests, upstream } = fixture([response]);
    const result = agentCard(uri, { gateway, fetch: upstream });
    if (response instanceof Response && response.ok) assert.deepEqual(await result, card);
    else await assert.rejects(result);
    assert.deepEqual(requests, [`${gateway}${cid}/cards/agent.json`]);
  }
});

test('permanent HTTP failures and invalid metadata do not trigger another provider', async () => {
  for (const response of [new Response(null, { status: 404 }), new Response(null, { status: 401 }), new Response(null, { status: 302 }), new Response('invalid JSON'), Response.json(null), Response.json([])]) {
    const { requests, upstream } = fixture([response]);
    await assert.rejects(agentCard(uri, { fetch: upstream }));
    assert.deepEqual(requests, [primary]);
  }
});

test('URI traversal, non-IPFS addresses and unsafe gateway configuration fail before any fetch', async () => {
  const upstream: typeof fetch = async () => { assert.fail('An invalid URI or gateway must not be fetched.'); };
  for (const invalid of ['https://attacker.example/card', 'ipfs://', `ipfs://${cid}/../secret`, `ipfs://${cid}/./card`, `ipfs://${cid}/%2e%2e/card`, `ipfs://${cid}?token=value`, `ipfs://${cid}#fragment`, `ipfs://user@${cid}/card`, `ipfs://${cid}\\card`]) {
    await assert.rejects(agentCard(invalid, { fetch: upstream }), /ipfs:\/\//);
  }
  for (const gateway of ['http://operator.example/ipfs/', 'https://user:pass@operator.example/ipfs/', 'https://operator.example/ipfs/?token=value', 'https://operator.example/ipfs/#fragment']) {
    await assert.rejects(agentCard(uri, { gateway, fetch: upstream }), /HTTPS/);
  }
});

test('streamed metadata over 256 KiB is canceled without fallback', async () => {
  let canceled = false;
  const oversized = new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(256 * 1024)); controller.enqueue(new Uint8Array(1)); },
    cancel() { canceled = true; },
  }));
  const { requests, upstream } = fixture([oversized]);
  await assert.rejects(agentCard(uri, { fetch: upstream }), /exceeds 256 KiB/);
  assert.equal(canceled, true);
  assert.deepEqual(requests, [primary]);
});

test('an unavailable fallback remains an error instead of invented metadata', async () => {
  const { requests, upstream } = fixture([new Response(null, { status: 429 }), new Response(null, { status: 503 })]);
  await assert.rejects(agentCard(uri, { fetch: upstream }), /503/);
  assert.deepEqual(requests, [primary, fallback]);
});

test('a stalled default request is aborted before a successful fallback', async () => {
  const requests: string[] = [];
  const signals: AbortSignal[] = [];
  const upstream: typeof fetch = async (url, init) => {
    requests.push(String(url)); signals.push(init!.signal!);
    if (requests.length === 1) return new Promise<Response>(() => {});
    return Response.json(card);
  };
  assert.deepEqual(await agentCard(uri, { fetch: upstream, primaryTimeoutMs: 10, totalTimeoutMs: 1000 }), card);
  assert.deepEqual(requests, [primary, fallback]);
  assert.equal(signals[0].aborted, true);
});

test('the total deadline bounds a stalled fallback body and a custom gateway', async () => {
  for (const gateway of [undefined, 'https://operator.example/ipfs/']) {
    const requests: string[] = [];
    const signals: AbortSignal[] = [];
    const upstream: typeof fetch = async (url, init) => {
      requests.push(String(url)); signals.push(init!.signal!);
      if (!gateway && requests.length === 1) return new Response(null, { status: 429 });
      return new Response(new ReadableStream());
    };
    const started = Date.now();
    await assert.rejects(agentCard(uri, { gateway, fetch: upstream, totalTimeoutMs: 40 }), /timed out/);
    assert.ok(Date.now() - started < 1000);
    assert.equal(requests.length, gateway ? 1 : 2);
    assert.ok(signals.every(signal => signal.aborted));
  }
});
