import assert from 'node:assert/strict';
import test from 'node:test';
import { hashTypedData, type Address, type Hex } from 'viem';
import { isWalletRejection, saveApproval, withApprovalLock } from '../lib/access-client';
import { accessApprovalData, accessSessionData, parseAccessResponse, type AccessConfig, type AccessRequest } from '../lib/access-protocol';

const owner = `0x${'11'.repeat(20)}` as Address;
const requester = `0x${'22'.repeat(20)}` as Address;
const id = `0x${'55'.repeat(32)}` as Hex;
const config: AccessConfig = { chainId: 10143, router: `0x${'33'.repeat(20)}`, identity: `0x${'44'.repeat(20)}`, relayers: [], sessionTtlSeconds: 900 };

test('wallet EIP-712 payloads match the fixed daemon compatibility vectors', () => {
  const request: AccessRequest = { id, agentId: '1', owner, requester, durationSeconds: 3600,
    reason: 'Review access', createdAt: 1800000000, requestExpiresAt: 1800172800, status: 'pending', unread: true, revision: 1 };
  assert.equal(hashTypedData(accessSessionData(config, owner, 1800000800)), '0x2d74ebd083f940e38b8f761af96b5df8db2f2be8eb9a3d0c066499f5d54db1bd');
  assert.equal(hashTypedData(accessApprovalData(config, request, { id, expiresAt: 1800003600, deadline: 1800000300, ownershipEpoch: '2', relayed: true })), '0x4aff28fb06ea96bcf7bfad2aaf0d4460178900bd2cb4849198561b53e352147c');
});

test('a browser without Web Locks cannot open a competing approval prompt', async context => {
  const beforeWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const beforeNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  context.after(() => {
    if (beforeWindow) Object.defineProperty(globalThis, 'window', beforeWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (beforeNavigator) Object.defineProperty(globalThis, 'navigator', beforeNavigator); else Reflect.deleteProperty(globalThis, 'navigator');
  });
  let prompts = 0;
  await assert.rejects(withApprovalLock(owner, async () => { prompts++; }), /coordinate approvals/);
  await assert.rejects(withApprovalLock(owner, async () => { prompts++; }), /coordinate approvals/);
  assert.equal(prompts, 0);
});

test('an unavailable or silently failing recovery store blocks approval before a wallet write', context => {
  const beforeStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  context.after(() => {
    if (beforeStorage) Object.defineProperty(globalThis, 'localStorage', beforeStorage); else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined });
  assert.throws(() => saveApproval(config, owner, { id }), /storage is required/);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem() {}, getItem() { return null; } } });
  assert.throws(() => saveApproval(config, owner, { id }), /could not be saved/);
});

test('recovery journal persists only public request and transaction identifiers', context => {
  const beforeStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  } });
  context.after(() => {
    if (beforeStorage) Object.defineProperty(globalThis, 'localStorage', beforeStorage); else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  const accidentalSession = { id, transactionHash: id, signature: 'must never persist', authorization: 'must never persist' };
  saveApproval(config, owner, accidentalSession);
  assert.deepEqual(JSON.parse([...storage.values()][0]), { id, transactionHash: id });
});

test('only explicit nested wallet rejection permits cancelling an unsubmitted approval', () => {
  assert.equal(isWalletRejection({ cause: { cause: { code: 4001 } } }), true);
  assert.equal(isWalletRejection({ cause: { name: 'UserRejectedRequestError' } }), true);
  assert.equal(isWalletRejection(new Error('Network failed after sending transaction')), false);
  assert.equal(isWalletRejection({ code: -32002, message: 'Request still pending in wallet' }), false);
  const cycle: { cause?: unknown } = {}; cycle.cause = cycle;
  assert.equal(isWalletRejection(cycle), false);
});

test('a valid Unicode request cannot prevent the owner from reading their whole inbox', () => {
  const request = { id, agentId: '1', owner, requester, durationSeconds: 3600, reason: '🔍'.repeat(500),
    createdAt: 1800000000, requestExpiresAt: 1800172800, status: 'pending', unread: true, revision: 1 };
  const parsed = parseAccessResponse({ requests: [request] }, owner);
  assert.equal(parsed.requests[0].reason, request.reason);
  assert.throws(() => parseAccessResponse({ requests: [{ ...request, reason: '🔍'.repeat(501) }] }, owner), /500 characters/);
});
