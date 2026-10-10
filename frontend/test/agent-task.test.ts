import assert from 'node:assert/strict';
import test from 'node:test';
import { keccak256, toBytes, type WalletClient } from 'viem';
import { contracts, walletPublicClient } from '../lib/contracts';
import { readDemo, saveDemo, signDemo } from '../lib/demo-client';
import { requestId, type DemoConfig, type DemoJournal, type DemoTask } from '../lib/demo-protocol';
import { checkObserverAccess, observeAgentTask, observerWorkload } from '../lib/observer-task';
import { createMonadMcpHandler } from '../lib/mcp-server';

const signer = `0x${'11'.repeat(20)}` as const, router = `0x${'22'.repeat(20)}` as const, identity = `0x${'33'.repeat(20)}` as const;
const asset = `0x${'44'.repeat(20)}` as const, receiver = `0x${'55'.repeat(20)}` as const, executor = `0x${'66'.repeat(20)}` as const;
const nonce = `0x${'77'.repeat(32)}` as const;
const observation = { chainId: 10143, blockNumber: '9007199254740993', blockHash: `0x${'aa'.repeat(32)}`, timestamp: '1791234567', transactionCount: 7 };
const result = { content: [{ type: 'text', text: JSON.stringify(observation) }], structuredContent: observation };
const policy = { resource: 'https://daemon.example/v1/tasks', asset, receiver, maxAmount: '10', name: 'USDC', version: '2' };
const accepted = { scheme: 'exact' as const, network: 'eip155:10143' as const, amount: '10', asset, payTo: receiver, maxTimeoutSeconds: 120, extra: { name: 'USDC', version: '2' } };
const config: DemoConfig = { enabled: true, chainId: 10143, router, identity, agentId: '1', relayers: [executor], policy, challenge: { x402Version: 2, resource: { url: policy.resource }, accepts: [accepted] } };
const task: DemoTask = { agentId: '1', taskId: nonce, sequenceNonce: '1', inputHash: nonce, outputHash: nonce, proofHash: `0x${'00'.repeat(32)}`, executor, deadline: 1800000000 };

function storage() {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'); const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  return { values, restore() { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage'); } };
}
function journal(count: number): DemoJournal {
  return { version: 1, router, asset, receiver, createdAt: new Date().toISOString(), records: Array.from({ length: count }, (_, index) => {
    const item = { ...task, sequenceNonce: String(index) };
    return { task: item, requestId: requestId(item, router), payer: signer, paymentNonce: nonce, amount: '10', stage: 'verified', transactionHash: nonce };
  }) };
}

test('single-agent task recovery is isolated from the five-task demo and never trusts stored success', () => {
  const local = storage();
  try {
    const five = journal(5); const one = journal(1);
    saveDemo(five); saveDemo(one, undefined, 'agent-task');
    assert.equal(readDemo()?.records.length, 5); assert.equal(readDemo('agent-task')?.records.length, 1);
    assert.equal(readDemo('agent-task')?.records[0].stage, 'unresolved'); assert.equal(readDemo('agent-task')?.records[0].transactionHash, undefined);
    assert.throws(() => saveDemo(one), /task count/); assert.throws(() => saveDemo(five, undefined, 'agent-task'), /task count/);
    assert.throws(() => saveDemo(one, nonce, 'agent-task'), /Another page/);
    const corrupted = { ...one, records: [{ ...one.records[0], task: { ...task, outputHash: `0x${'88'.repeat(32)}` } }] };
    local.values.set('aetheris:agent-task:v1', JSON.stringify(corrupted));
    assert.throws(() => readDemo('agent-task'), /does not match/);
    assert.equal(readDemo()?.records.length, 5, 'a damaged single-task journal must not affect the demo');
  } finally { local.restore(); }
});

test('observer journals are wallet-scoped and legacy requests remain recoverable only by their original payer', () => {
  const local = storage();
  try {
    const context = { identity, router, payer: signer, agentId: '1' };
    const other = { ...context, payer: executor };
    saveDemo(journal(1), undefined, 'agent-task');
    assert.ok(readDemo('agent-task', context), 'the original wallet retains its pre-upgrade recovery');
    assert.equal(readDemo('agent-task', other), undefined);
    const own = journal(1); own.records[0].payer = executor;
    saveDemo(own, undefined, 'agent-task', other);
    assert.equal(readDemo('agent-task', other)?.records[0].payer, executor);
    assert.equal(readDemo('agent-task', context)?.records[0].payer, signer);
    assert.equal(readDemo('agent-task', context)?.records[0].stage, 'unresolved');
  } finally { local.restore(); }
});

test('observer access preflight denies unrelated wallets at one fresh block before any MCP or wallet request', async context => {
  const originalContracts = { ...contracts }; Object.assign(contracts, { router, identity });
  const reads: { functionName: string; blockNumber?: bigint; args?: unknown[] }[] = [];
  const rpc = {
    getChainId: async () => 10143,
    getBlockNumber: async (options: { cacheTime: number }) => { assert.equal(options.cacheTime, 0); return 100n; },
    readContract: async (args: typeof reads[number]) => {
      reads.push(args);
      if (args.functionName === 'identityRegistry') return identity;
      if (args.functionName === 'ownerOf') return receiver;
      return args.args?.[1] === executor;
    },
  } as unknown as typeof walletPublicClient;
  context.mock.method(globalThis, 'fetch', async () => { throw new Error('Preflight must not call MCP or submit a payment'); });
  try {
    const result = await checkObserverAccess(config, signer, new AbortController().signal, rpc);
    assert.equal(result.allowed, false);
    assert.match(result.message, /Run your own agent/);
    assert.equal(reads.length, 4); assert.ok(reads.every(read => read.blockNumber === 100n));
    assert.deepEqual(reads.find(read => read.functionName === 'ownerOf')?.args, [1n]);
  } finally { Object.assign(contracts, originalContracts); }
});

test('observer preflight requires both current signer authority and every executor grant', async () => {
  const originalContracts = { ...contracts }; Object.assign(contracts, { router, identity });
  let signerAllowed = true; let executorAllowed = true; let head = 100n;
  const rpc = {
    getChainId: async () => 10143, getBlockNumber: async () => ++head,
    readContract: async (args: { functionName: string; args?: unknown[] }) => {
      if (args.functionName === 'identityRegistry') return identity;
      if (args.functionName === 'ownerOf') return signer;
      return args.args?.[1] === signer ? signerAllowed : executorAllowed;
    },
  } as unknown as typeof walletPublicClient;
  try {
    assert.equal((await checkObserverAccess(config, signer, new AbortController().signal, rpc)).allowed, true);
    signerAllowed = false;
    assert.equal((await checkObserverAccess(config, signer, new AbortController().signal, rpc)).allowed, false, 'a previous positive check never caches a now-revoked grant');
    signerAllowed = true; executorAllowed = false;
    const missingExecutor = await checkObserverAccess(config, signer, new AbortController().signal, rpc);
    assert.equal(missingExecutor.allowed, false); assert.match(missingExecutor.message, /active executor delegation/);
    const sameExecutor = await checkObserverAccess(config, executor, new AbortController().signal, rpc);
    assert.equal(sameExecutor.allowed, false); assert.match(sameExecutor.message, /cannot also sign/);
    assert.equal(head, 103n, 'daemon signer rejection requires no network reads');
  } finally { Object.assign(contracts, originalContracts); }
});

test('observer preflight fails closed on a wrong chain, changed registry, cancellation or RPC failure', async () => {
  const originalContracts = { ...contracts }; Object.assign(contracts, { router, identity });
  let calls = 0;
  const fail = async () => { calls++; throw new Error('unexpected call'); };
  try {
    const wrongChain = { getChainId: async () => 143, getBlockNumber: fail, readContract: fail } as unknown as typeof walletPublicClient;
    await assert.rejects(checkObserverAccess(config, signer, new AbortController().signal, wrongChain), /not connected to Monad Testnet/);
    assert.equal(calls, 0);
    const abort = new AbortController();
    const cancelled = { getChainId: async () => { abort.abort(); return 10143; }, getBlockNumber: fail, readContract: fail } as unknown as typeof walletPublicClient;
    await assert.rejects(checkObserverAccess(config, signer, abort.signal, cancelled), /abort/i);
    assert.equal(calls, 0);
    const unavailable = { getChainId: async () => { throw new Error('RPC unavailable'); }, readContract: fail } as unknown as typeof walletPublicClient;
    await assert.rejects(checkObserverAccess(config, signer, new AbortController().signal, unavailable), /RPC unavailable/);
    const wrongRegistry = { getChainId: async () => 10143, getBlockNumber: async () => 100n, readContract: async (args: { functionName: string }) => args.functionName === 'identityRegistry' ? receiver : args.functionName === 'ownerOf' ? signer : true } as unknown as typeof walletPublicClient;
    await assert.rejects(checkObserverAccess(config, signer, new AbortController().signal, wrongRegistry), /registry could not be verified/);
    await assert.rejects(checkObserverAccess({ ...config, agentId: '2' }, signer, new AbortController().signal, wrongChain), /belongs to Agent #1/);
  } finally { Object.assign(contracts, originalContracts); }
});

test('observer workloads commit exact validated block data and reject malformed or wrong-chain output', () => {
  const workload = observerWorkload(result);
  assert.equal(workload.observation.blockNumber, '9007199254740993');
  assert.equal(workload.inputHash, keccak256(toBytes(JSON.stringify({ name: 'get_monad_block', arguments: {} }))));
  assert.equal(workload.outputHash, keccak256(toBytes(JSON.stringify(observation))));
  for (const output of [{ ...observation, chainId: 1 }, { ...observation, blockNumber: 123 }, { ...observation, blockHash: 'bad' }, { ...observation, transactionCount: -1 }, { ...observation, transactionCount: 0.5 }, { ...observation, extra: 'unbound data' }]) {
    assert.throws(() => observerWorkload({ ...result, structuredContent: output }));
  }
  assert.throws(() => observerWorkload({ ...result, isError: true }), /could not read/);
  assert.notEqual(workload.outputHash, observerWorkload({ ...result, structuredContent: { ...observation, transactionCount: 8 } }).outputHash);
});

test('directory MCP client initializes the existing stateless observer and calls only its pinned read-only tool', async () => {
  const methods: string[] = []; const tools: string[] = [];
  const handler = createMonadMcpHandler({ rpcUrl: 'https://rpc.example/', fetch: async (_input, init) => {
    const message = JSON.parse(String(init?.body)); methods.push(message.method);
    return Response.json({ jsonrpc: '2.0', id: message.id, result: message.method === 'eth_chainId' ? '0x279f' : { number: '0x20000000000001', hash: observation.blockHash, timestamp: `0x${BigInt(observation.timestamp).toString(16)}`, transactions: Array.from({ length: 7 }, () => nonce) } });
  } });
  const workload = await observeAgentTask('https://observer.example', new AbortController().signal, async (input, init) => {
    assert.equal(String(input), 'https://observer.example/api/mcp'); assert.equal(init?.redirect, 'error'); assert.equal(init?.cache, 'no-store');
    const request = new Request(input, init);
    if (request.method === 'POST') { const message = await request.clone().json(); if (message.method === 'tools/call') { tools.push(message.params.name); assert.deepEqual(message.params.arguments, {}); } }
    return handler(request);
  });
  assert.deepEqual(workload.observation, observation); assert.deepEqual(tools, ['get_monad_block']); assert.deepEqual(methods, ['eth_chainId', 'eth_getBlockByNumber']);
});

test('one-task signing binds the observed hashes, charges one payment and leaves the five-task journal untouched', async context => {
  const local = storage(); const originalContracts = { ...contracts }; const signatures: Record<string, unknown>[] = [];
  contracts.router = router; contracts.identity = identity;
  context.mock.method(walletPublicClient, 'getChainId', async () => 10143);
  context.mock.method(walletPublicClient, 'getBlock', async () => ({ timestamp: BigInt(Math.floor(Date.now() / 1000)) }));
  context.mock.method(walletPublicClient, 'readContract', async (args: { functionName: string }) => {
    if (args.functionName === 'identityRegistry') return identity;
    if (args.functionName === 'ownerOf') return signer;
    if (args.functionName === 'balanceOf') return 10n;
    return true;
  });
  context.mock.method(globalThis, 'fetch', async () => { throw new Error('Signing must never submit a task or payment'); });
  const wallet = { account: { address: signer }, getAddresses: async () => [signer], getChainId: async () => 10143, signTypedData: async (data: Record<string, unknown>) => { signatures.push(data); return `0x${'bb'.repeat(65)}`; } } as unknown as WalletClient;
  try {
    saveDemo(journal(5)); const untouched = local.values.get('aetheris:judge-demo:v1');
    const workload = observerWorkload(result);
    const prepared = await signDemo(config, wallet, signer, () => {}, new AbortController().signal, { scope: 'agent-task', workload });
    assert.equal(prepared.signed.length, 1); assert.equal(signatures.length, 2);
    assert.equal(prepared.journal.records[0].task.inputHash, workload.inputHash); assert.equal(prepared.journal.records[0].task.outputHash, workload.outputHash);
    assert.equal(prepared.journal.records[0].task.agentId, '1'); assert.equal(prepared.journal.records[0].task.executor, executor);
    const payment = JSON.parse(atob(prepared.signed[0].paymentHeader));
    assert.equal(payment.payload.authorization.value, '10'); assert.equal(payment.payload.authorization.from, signer); assert.equal(payment.payload.authorization.to, receiver);
    assert.equal(payment.payload.authorization.nonce, prepared.journal.records[0].paymentNonce);
    assert.equal(readDemo('agent-task')?.records[0].requestId, prepared.journal.records[0].requestId); assert.equal(local.values.get('aetheris:judge-demo:v1'), untouched);
    signatures.length = 0;
    await assert.rejects(() => signDemo(config, wallet, signer, () => {}), /five tasks/);
    assert.equal(signatures.length, 0, 'the unchanged demo still requires a budget for five tasks');
  } finally { Object.assign(contracts, originalContracts); local.restore(); }
});
