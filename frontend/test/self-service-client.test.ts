import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type { Address, Hex, WalletClient } from 'viem';
import { contracts, walletPublicClient as rpc } from '../lib/contracts';
import { readDemo, saveDemo, signDemo, type DemoJournalContext } from '../lib/demo-client';
import { requestId, type DemoConfig, type DemoJournal, type DemoTask } from '../lib/demo-protocol';

const owner = `0x${'11'.repeat(20)}` as Address, other = `0x${'22'.repeat(20)}` as Address;
const identity = `0x${'33'.repeat(20)}` as Address, router = `0x${'44'.repeat(20)}` as Address;
const executor = `0x${'55'.repeat(20)}` as Address, asset = `0x${'66'.repeat(20)}` as Address, receiver = `0x${'77'.repeat(20)}` as Address;
const hash = `0x${'88'.repeat(32)}` as Hex;
const policy = { resource: 'https://daemon.example/v1/tasks', asset, receiver, maxAmount: '10', name: 'USDC', version: '2' };
const config: DemoConfig = { enabled: true, chainId: 10143, identity, router, agentId: '42', relayers: [executor], policy,
  challenge: { x402Version: 2, resource: { url: policy.resource }, accepts: [{ scheme: 'exact', network: 'eip155:10143', amount: '10', asset, payTo: receiver, maxTimeoutSeconds: 120, extra: { name: 'USDC', version: '2' } }] } };
const scope: DemoJournalContext = { identity, router, payer: owner, agentId: '42' };

function fixture(context: TestContext) {
  const previous = { ...contracts }; Object.assign(contracts, { router, identity });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'); const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  context.after(() => { Object.assign(contracts, previous); if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  const state = { account: owner, chainId: 10143, current: true, signatures: 0, afterSign: () => {} };
  context.mock.method(rpc, 'getChainId', async () => 10143);
  context.mock.method(rpc, 'getBlock', async () => ({ timestamp: BigInt(Math.floor(Date.now() / 1000)) }));
  context.mock.method(rpc, 'readContract', async (input: { functionName: string; args?: readonly unknown[] }) => {
    if (input.functionName === 'identityRegistry') return identity;
    if (input.functionName === 'ownerOf') { assert.equal(input.args?.[0], 42n); return owner; }
    if (input.functionName === 'balanceOf') return 50n;
    if (input.functionName === 'isAuthorized') { assert.equal(input.args?.[0], 42n); return true; }
    throw new Error('Unexpected chain read.');
  });
  context.mock.method(globalThis, 'fetch', async () => { throw new Error('Preparing signatures must never make a paid HTTP request.'); });
  const wallet = { account: { address: owner }, getAddresses: async () => [state.account], getChainId: async () => state.chainId,
    switchChain: async () => { throw new Error('Unexpected chain switch.'); }, signTypedData: async () => { state.signatures++; state.afterSign(); return `0x${'aa'.repeat(65)}`; } } as unknown as WalletClient;
  return { state, values, wallet };
}

function journal(payer = owner, agentId = '42'): DemoJournal {
  return { version: 1, router, asset, receiver, createdAt: new Date().toISOString(), records: Array.from({ length: 5 }, (_, index) => {
    const task: DemoTask = { agentId, taskId: hash, sequenceNonce: String(index), inputHash: hash, outputHash: hash, proofHash: hash, executor, deadline: 1_800_000_000 };
    return { task, payer, requestId: requestId(task, router), amount: '10', paymentNonce: hash, stage: 'verified', transactionHash: hash };
  }) };
}

test('paid journals separate wallets, agents and deployments, while preserving matching legacy recovery', context => {
  const { values } = fixture(context); const original = journal(); saveDemo(original);
  assert.equal(readDemo('demo', scope)?.records[0].stage, 'unresolved');
  assert.equal(readDemo('demo', { ...scope, payer: other }), undefined);
  assert.equal(readDemo('demo', { ...scope, agentId: '43' }), undefined);
  assert.equal(readDemo('demo', { ...scope, router: other }), undefined);
  const another = journal(other, '43'); const anotherScope = { ...scope, payer: other, agentId: '43' };
  saveDemo(another, undefined, 'demo', anotherScope);
  assert.equal(readDemo('demo', anotherScope)?.records[0].payer, other);
  assert.equal(readDemo('demo', scope)?.records[0].payer, owner);
  assert.equal(values.get('aetheris:judge-demo:v1'), JSON.stringify(original), 'legacy data remains intact');
  saveDemo(original, original.records[0].requestId, 'demo', scope);
  assert.equal(readDemo('demo', scope)?.records[0].transactionHash, undefined, 'local success never bypasses receipt rechecks');
  assert.throws(() => saveDemo(original, undefined, 'demo', anotherScope), /different wallet or agent/);
  const scopedKey = [...values.keys()].find(key => key.endsWith(`:${owner}:42`)); assert.ok(scopedKey);
  values.set(scopedKey, JSON.stringify(another));
  assert.throws(() => readDemo('demo', scope), /different wallet or agent/);
});

test('a personally selected agent signs five payments and saves only public requests in its own scope', async context => {
  const { wallet, state, values } = fixture(context);
  const prepared = await signDemo(config, wallet, owner, () => {}, undefined, { journalContext: scope, isCurrent: () => state.current });
  assert.equal(state.signatures, 10); assert.equal(prepared.signed.length, 5);
  assert.ok(prepared.journal.records.every(record => record.task.agentId === '42' && record.payer === owner));
  assert.equal(readDemo('demo', scope)?.records.length, 5);
  assert.equal(readDemo(), undefined, 'new run does not overwrite the legacy global journal');
  assert.equal(readDemo('demo', { ...scope, payer: other }), undefined);
  const stored = [...values.values()].join('');
  assert.equal(stored.includes('authorization'), false); assert.equal(stored.includes('signature'), false);
});

test('account, network or selection changes during signing stop before further prompts and journal creation', async context => {
  for (const change of ['account', 'network', 'selection'] as const) {
    await context.test(change, async child => {
      const { state, wallet, values } = fixture(child);
      state.afterSign = () => { if (change === 'account') state.account = other; else if (change === 'network') state.chainId = 1; else state.current = false; };
      await assert.rejects(() => signDemo(config, wallet, owner, () => {}, undefined, { journalContext: scope, isCurrent: () => state.current }), /changed/);
      assert.equal(state.signatures, 1); assert.equal(values.size, 0);
    });
  }
});

test('the final payment prompt is followed by another identity check before any runnable journal exists', async context => {
  const { state, wallet, values } = fixture(context);
  state.afterSign = () => { if (state.signatures === 10) state.account = other; };
  await assert.rejects(() => signDemo(config, wallet, owner, () => {}, undefined, { journalContext: scope }), /changed/);
  assert.equal(state.signatures, 10); assert.equal(values.size, 0);
});

test('an obsolete setup cannot open a network-switch prompt before signing', async context => {
  const { state, wallet, values } = fixture(context);
  state.current = false; state.chainId = 1;
  await assert.rejects(() => signDemo(config, wallet, owner, () => {}, undefined, { journalContext: scope, isCurrent: () => state.current }), /changed/);
  assert.equal(state.signatures, 0); assert.equal(values.size, 0);
});
