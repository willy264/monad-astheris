import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { hashTypedData, recoverTypedDataAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { accessApprovalData, accessSessionData, parseAccessEnvelope, parseAccessResponse, type AccessConfig, type AccessRequest } from '../lib/access-protocol';
import { clearApproval, readApproval, saveApproval, sendAccessAction, withApprovalLock } from '../lib/access-client';
import { contracts } from '../lib/contracts';

const owner = privateKeyToAccount(`0x${'11'.repeat(32)}`), requester = privateKeyToAccount(`0x${'22'.repeat(32)}`);
const router = `0x${'33'.repeat(20)}` as Address, identity = `0x${'44'.repeat(20)}` as Address;
const id = `0x${'55'.repeat(32)}` as Hex;
const config: AccessConfig = { chainId: 10143, router, identity, relayers: [owner.address], sessionTtlSeconds: 900 };
const request: AccessRequest = { id, agentId: '1', owner: owner.address, requester: requester.address, durationSeconds: 3600,
  reason: 'Run one observation for my review.', createdAt: 1800000000, requestExpiresAt: 1800172800, status: 'pending', unread: true, revision: 1 };

test('session cannot stand in for an approval; approval binds request, recipient, ownership epoch and expiry', async () => {
  const session = accessSessionData(config, owner.address, 1800000800);
  const approval = { id, expiresAt: 1800003600, deadline: 1800000300, ownershipEpoch: '2', relayed: true };
  const typed = accessApprovalData(config, request, approval);
  const signedSession = await owner.signTypedData(session);
  assert.notEqual(await recoverTypedDataAddress({ ...typed, signature: signedSession }), owner.address);
  const signedApproval = await owner.signTypedData(typed);
  assert.equal(await recoverTypedDataAddress({ ...typed, signature: signedApproval }), owner.address);
  const digest = hashTypedData(typed);
  assert.notEqual(hashTypedData(accessApprovalData(config, { ...request, requester: owner.address }, approval)), digest);
  assert.notEqual(hashTypedData(accessApprovalData(config, request, { ...approval, ownershipEpoch: '3' })), digest);
  assert.notEqual(hashTypedData(accessApprovalData(config, request, { ...approval, expiresAt: 1800003700 })), digest);
  assert.notEqual(hashTypedData(accessApprovalData({ ...config, router: identity }, request, approval)), digest);
});

test('strict inbox validation rejects another wallet records and keeps confirmed history separate from active authority', () => {
  assert.throws(() => parseAccessResponse({ requests: [request] }, router), /another wallet/);
  assert.throws(() => parseAccessResponse({ requests: [request, request] }, requester.address), /Duplicate/);
  assert.throws(() => parseAccessResponse({ requests: [{ ...request, revision: -1 }] }, requester.address), /revision/);
  const parsed = parseAccessResponse({ requests: [{ ...request, status: 'approved', currentAuthority: false, decisionNote: null, transactionHash: id, grantExpiresAt: 1800003600 }] }, requester.address);
  assert.equal(parsed.requests[0].status, 'approved'); assert.equal(parsed.requests[0].currentAuthority, false);
});

test('session/action validation rejects expired authorization, wrong agents and unbounded data', async () => {
  const now = 1800000000;
  const auth = { wallet: requester.address, expiresAt: now + 800, signature: await requester.signTypedData(accessSessionData(config, requester.address, now + 800)) };
  const payload = { id, agentId: '1', owner: owner.address, durationSeconds: 3600, reason: 'Review access' };
  assert.equal(parseAccessEnvelope({ auth, action: 'request', payload }, now).action, 'request');
  assert.throws(() => parseAccessEnvelope({ auth: { ...auth, expiresAt: now - 1 }, action: 'list', payload: {} }, now), /expired/);
  assert.throws(() => parseAccessEnvelope({ auth: { ...auth, expiresAt: now + 901 }, action: 'list', payload: {} }, now), /expired/);
  for (const patch of [{ agentId: '2' }, { durationSeconds: 1000000 }, { reason: 'x'.repeat(501) }, { requester: owner.address }]) {
    assert.throws(() => parseAccessEnvelope({ auth, action: 'request', payload: { ...payload, ...patch } }, now));
  }
  assert.throws(() => parseAccessEnvelope({ auth, action: 'seen', payload: { ids: [id] } }, now), /Unexpected/);
  assert.equal(parseAccessEnvelope({ auth, action: 'seen', payload: { items: [{ id, revision: 1 }] } }, now).action, 'seen');
});

test('public recovery journal is scoped by deployment, owner and request; concurrent submissions are excluded', async context => {
  const storage = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } });
  context.after(() => { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  saveApproval(config, owner.address, { id });
  assert.deepEqual(readApproval(config, owner.address, id), { id });
  assert.equal(readApproval(config, requester.address, id), undefined);
  assert.equal(readApproval({ ...config, router: identity }, owner.address, id), undefined);
  saveApproval(config, owner.address, { id, transactionHash: id });
  assert.equal(readApproval(config, owner.address, id)?.transactionHash, id);
  assert.ok([...storage.values()].every(value => !value.includes('signature')));
  let release!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; });
  const first = withApprovalLock(owner.address, () => waiting);
  await assert.rejects(withApprovalLock(owner.address, async () => {}), /already in progress/);
  release(); await first;
  clearApproval(config, owner.address, id); assert.equal(readApproval(config, owner.address, id), undefined);
});

test('access proxy enforces origin and wallet proof independently from paid-task config', async context => {
  const hooks = registerHooks({ resolve(specifier, resolution, next) { return next(specifier === 'server-only' ? 'next/dist/compiled/server-only/empty.js' : specifier, resolution); } });
  const { accessAction, accessOrigin } = await import('../lib/access-server'); hooks.deregister();
  const originalContracts = { ...contracts }, previousURL = process.env.DAEMON_URL, previousEnabled = process.env.DEMO_ENABLED;
  Object.assign(contracts, { router, identity }); process.env.DAEMON_URL = 'https://daemon.example'; process.env.DEMO_ENABLED = 'false';
  context.after(() => { Object.assign(contracts, originalContracts); if (previousURL === undefined) delete process.env.DAEMON_URL; else process.env.DAEMON_URL = previousURL; if (previousEnabled === undefined) delete process.env.DEMO_ENABLED; else process.env.DEMO_ENABLED = previousEnabled; });
  let forwards = 0;
  context.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.cache, 'no-store'); assert.equal(init?.redirect, 'error'); assert.ok(init?.signal);
    if (String(url).endsWith('/config')) return Response.json(config);
    forwards++; return Response.json({ requests: [request] });
  });
  const expiresAt = Math.floor(Date.now() / 1000) + 800;
  const auth = { wallet: requester.address, expiresAt, signature: await requester.signTypedData(accessSessionData(config, requester.address, expiresAt)) };
  const make = (origin = 'https://dashboard.example', patch = {}) => new Request('https://dashboard.example/api/access-requests', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ auth: { ...auth, ...patch }, action: 'list', payload: {} }) });
  assert.equal((await accessAction(make())).requests[0].id, id); assert.equal(forwards, 1);
  await assert.rejects(accessAction(make('https://other.example')), /dashboard/);
  await assert.rejects(accessAction(make(undefined, { wallet: owner.address })), /another wallet/);
  assert.equal(forwards, 1);
  assert.throws(() => accessOrigin('http://remote.example'), /HTTPS/);
  assert.throws(() => accessOrigin('https://secret:token@daemon.example/'), /origin/);
});

test('client never retries a mutation after an ambiguous HTTP failure', async context => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('connection lost'); });
  await assert.rejects(sendAccessAction({ wallet: requester.address, expiresAt: 1800000800, signature: `0x${'11'.repeat(65)}` }, 'grant', { id }), /connection lost/);
  assert.equal(calls, 1);
});
