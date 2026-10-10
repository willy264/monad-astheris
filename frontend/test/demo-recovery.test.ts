import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { encodeAbiParameters, encodeEventTopics, parseAbi, type Hex, type TransactionReceipt } from 'viem';
import { contracts, walletPublicClient as rpc } from '../lib/contracts';
import { readDemo, recoverDemo, saveDemo } from '../lib/demo-client';
import { requestId, salt, type DemoJournal, type DemoReceiptHints, type DemoTask } from '../lib/demo-protocol';

const owner = `0x${'11'.repeat(20)}` as const, router = `0x${'22'.repeat(20)}` as const;
const shard = `0x${'33'.repeat(20)}` as const, asset = `0x${'44'.repeat(20)}` as const;
const receiver = `0x${'55'.repeat(20)}` as const, nonce = `0x${'66'.repeat(32)}` as const;
const blockHash = `0x${'77'.repeat(32)}` as const;
const hints: DemoReceiptHints = { createTx: `0x${'a1'.repeat(32)}`, executionTx: `0x${'a2'.repeat(32)}`, paymentTx: `0x${'a3'.repeat(32)}` };
const task: DemoTask = { agentId: '2', taskId: `0x${'88'.repeat(32)}`, sequenceNonce: '17', inputHash: `0x${'99'.repeat(32)}`, outputHash: `0x${'aa'.repeat(32)}`, proofHash: `0x${'00'.repeat(32)}`, executor: owner, deadline: 1800000000 };
const id = requestId(task, router);
const journal = (withHints = true): DemoJournal => ({ version: 1, router, asset, receiver, createdAt: '2026-10-10T13:00:00Z', records: [{ task, requestId: id, payer: owner, paymentNonce: nonce, amount: '10', stage: 'verified', transactionHash: hints.executionTx, ...(withHints ? { receiptHints: hints } : {}) }] });
const completed = { requestId: id, status: 'completed', result: { shard, salt: salt(task), createTx: hints.createTx, executionTx: hints.executionTx }, payment: { success: true, network: 'eip155:10143', payer: owner, transaction: hints.paymentTx } };
const abi = parseAbi([
  'event ShardCreated(address indexed shard,uint256 indexed agentId,bytes32 indexed taskId,uint256 sequenceNonce,address executor,bytes32 inputHash)',
  'event TaskExecuted(address indexed shard,uint256 indexed agentId,bytes32 indexed taskId,bytes32 inputHash,bytes32 outputHash,bytes32 proofHash)',
  'event Transfer(address indexed from,address indexed to,uint256 value)', 'event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)',
]);
function fixtures(context: TestContext) {
  const previousRouter = contracts.router; contracts.router = router;
  context.after(() => { contracts.router = previousRouter; });
  const receipt = (transactionHash: Hex, logs: unknown[]): TransactionReceipt => ({ status: 'success', transactionHash, from: owner, to: router, blockNumber: 100n, blockHash, logs } as TransactionReceipt);
  const receipts = new Map<Hex, TransactionReceipt>([
    [hints.createTx, receipt(hints.createTx, [{ address: router, topics: encodeEventTopics({ abi, eventName: 'ShardCreated', args: { shard, agentId: 2n, taskId: task.taskId } }), data: encodeAbiParameters([{ type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }], [17n, owner, task.inputHash]) }])],
    [hints.executionTx, receipt(hints.executionTx, [{ address: router, topics: encodeEventTopics({ abi, eventName: 'TaskExecuted', args: { shard, agentId: 2n, taskId: task.taskId } }), data: encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }], [task.inputHash, task.outputHash, task.proofHash]) }])],
    [hints.paymentTx, receipt(hints.paymentTx, [
      { address: asset, topics: encodeEventTopics({ abi, eventName: 'Transfer', args: { from: owner, to: receiver } }), data: encodeAbiParameters([{ type: 'uint256' }], [10n]) },
      { address: asset, topics: encodeEventTopics({ abi, eventName: 'AuthorizationUsed', args: { authorizer: owner, nonce } }), data: '0x' },
    ])],
  ]);
  const calls: { url: string; method: string }[] = [];
  context.mock.method(rpc, 'getChainId', async () => 10143);
  context.mock.method(rpc, 'getBlock', async () => ({ hash: blockHash }));
  context.mock.method(rpc, 'readContract', async ({ functionName }: { functionName: string }) => { assert.equal(functionName, 'predictShardAddress'); return shard; });
  context.mock.method(rpc, 'waitForTransactionReceipt', async (input: { hash: Hex; confirmations: number }) => { assert.equal(input.confirmations, 2); assert.ok(receipts.has(input.hash)); return receipts.get(input.hash); });
  context.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    calls.push({ url, method: options.method ?? 'GET' }); assert.equal(options.method ?? 'GET', 'GET');
    return new Response(JSON.stringify({ error: 'Request is no longer in the free service journal.' }), { status: 404 });
  });
  return { receipts, calls };
}

test('reload keeps receipt locations as untrusted hints and never restores a verified stage from browser storage', context => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'); const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  context.after(() => { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  saveDemo(journal(), undefined, 'agent-task');
  const loaded = readDemo('agent-task')!;
  assert.deepEqual(loaded.records[0].receiptHints, hints); assert.equal(loaded.records[0].stage, 'unresolved'); assert.equal(loaded.records[0].transactionHash, undefined);
  const broken = journal(); broken.records[0].receiptHints = { ...hints, paymentTx: 'invalid' as Hex };
  saveDemo(broken, undefined, 'agent-task');
  assert.equal(readDemo('agent-task')!.records[0].receiptHints, undefined);
  assert.equal(readDemo('agent-task')!.records[0].requestId, id, 'malformed optional hints do not erase recovery IDs');
});

test('saved receipt hints reverify all three exact canonical receipts even after the daemon journal disappears', async context => {
  const { calls } = fixtures(context); const stages: string[] = [];
  await recoverDemo(journal(), 0, new AbortController().signal, (stage, tx, recoveredHints) => {
    stages.push(stage); assert.deepEqual(recoveredHints, hints); if (stage === 'verified') assert.equal(tx, hints.executionTx);
  });
  assert.deepEqual(stages, ['verifying', 'verified']); assert.deepEqual(calls, [], 'existing receipts need no daemon request and no new payment');
});

test('legacy journals recover through GET and expose the complete hint bundle before waiting for receipts', async context => {
  const { calls } = fixtures(context); let providedHints = false;
  context.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    calls.push({ url, method: options.method ?? 'GET' }); return new Response(JSON.stringify(completed));
  });
  context.mock.method(rpc, 'readContract', async () => { assert.equal(providedHints, true); return shard; });
  const stages: string[] = [];
  await recoverDemo(journal(false), 0, new AbortController().signal, (stage, _tx, recoveredHints) => { stages.push(stage); providedHints = Boolean(recoveredHints); });
  assert.deepEqual(stages, ['verifying', 'verified']); assert.deepEqual(calls, [{ url: `/api/demo/tasks/${id}`, method: 'GET' }]);
});

test('missing legacy jobs stay unresolved after bounded automatic checks without any paid retry', async context => {
  const { calls } = fixtures(context); const stages: string[] = [];
  await assert.rejects(recoverDemo(journal(false), 0, new AbortController().signal, stage => stages.push(stage), undefined, { maxAttempts: 1 }), /no payment will be repeated/);
  assert.deepEqual(stages, []); assert.deepEqual(calls, [{ url: `/api/demo/tasks/${id}`, method: 'GET' }, { url: '/api/overview', method: 'GET' }]);
});

test('legacy recovery finds exact indexed task receipts and this payer nonce after the daemon loses the job', async context => {
  const { receipts, calls } = fixtures(context); const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
  context.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    calls.push({ url, method: options.method ?? 'GET' });
    if (url !== '/api/overview') return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ chainId: 10143, shardHistory: { shards: [{ ...task, status: 'executed', transactionHash: hints.createTx, executionTransactionHash: hints.executionTx }] } }));
  });
  context.mock.method(rpc, 'getTransactionReceipt', async ({ hash }: { hash: Hex }) => receipts.get(hash));
  context.mock.method(rpc, 'getBlockNumber', async () => 9000000n);
  context.mock.method(rpc, 'getLogs', async (args: { address: string; args: { authorizer: string; nonce: string }; fromBlock: bigint; toBlock: bigint }) => {
    assert.equal(args.address, asset); assert.deepEqual(args.args, { authorizer: owner, nonce });
    assert.ok(args.toBlock - args.fromBlock < 100n); ranges.push({ fromBlock: args.fromBlock, toBlock: args.toBlock });
    return args.fromBlock === 100n ? [{ address: asset, transactionHash: hints.paymentTx, removed: false, args: { authorizer: owner, nonce } }] : [];
  });
  const stages: string[] = [];
  await recoverDemo(journal(false), 0, new AbortController().signal, stage => stages.push(stage), undefined, { maxAttempts: 1 });
  assert.deepEqual(stages, ['verifying', 'verified']);
  assert.deepEqual(ranges, [{ fromBlock: 100n, toBlock: 199n }, { fromBlock: 200n, toBlock: 299n }]);
  assert.deepEqual(calls, [{ url: `/api/demo/tasks/${id}`, method: 'GET' }, { url: '/api/overview', method: 'GET' }]);
});

test('an indexer success label never verifies missing exact payment evidence or a different task', async context => {
  for (const change of ['payment-missing', 'payment-other-payer', 'payment-other-nonce', 'task-output', 'task-receipt'] as const) {
    await context.test(change, async child => {
      const { receipts, calls } = fixtures(child);
      child.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
        calls.push({ url, method: options.method ?? 'GET' });
        if (url !== '/api/overview') return new Response('{}', { status: 404 });
        return new Response(JSON.stringify({ chainId: 10143, shardHistory: { shards: [{ ...task, outputHash: change === 'task-output' ? nonce : task.outputHash, status: 'executed', transactionHash: hints.createTx, executionTransactionHash: hints.executionTx }] } }));
      });
      child.mock.method(rpc, 'getTransactionReceipt', async ({ hash }: { hash: Hex }) => receipts.get(hash));
      child.mock.method(rpc, 'getBlockNumber', async () => 110n);
      child.mock.method(rpc, 'getLogs', async () => change === 'payment-missing' ? [] : [{ address: asset, transactionHash: hints.paymentTx, removed: false, args: { authorizer: change === 'payment-other-payer' ? receiver : owner, nonce: change === 'payment-other-nonce' ? task.taskId : nonce } }]);
      if (change === 'task-receipt') receipts.get(hints.createTx)!.logs = [];
      const stages: string[] = [];
      await assert.rejects(recoverDemo(journal(false), 0, new AbortController().signal, stage => stages.push(stage), undefined, { maxAttempts: 1 }), /pending/);
      assert.equal(stages.includes('verified'), false); assert.ok(calls.every(call => call.method === 'GET'));
    });
  }
});

test('forged success hints cannot verify a wrong task, payment nonce, receipt transaction or canonical block', async context => {
  for (const change of ['task', 'payment', 'replacement', 'canonical'] as const) {
    await context.test(change, async child => {
      const { receipts, calls } = fixtures(child); const source = journal(); const stages: string[] = [];
      if (change === 'task') { source.records[0].task = { ...task, outputHash: nonce }; source.records[0].requestId = requestId(source.records[0].task, router); }
      if (change === 'payment') source.records[0].paymentNonce = task.taskId;
      if (change === 'replacement') receipts.get(hints.executionTx)!.transactionHash = nonce;
      if (change === 'canonical') context.mock.method(rpc, 'getBlock', async () => ({ hash: nonce }));
      await assert.rejects(recoverDemo(source, 0, new AbortController().signal, stage => stages.push(stage), undefined, { maxAttempts: 1 }), /pending/);
      assert.equal(stages.includes('verified'), false); assert.ok(calls.every(call => call.method === 'GET'));
    });
  }
});

test('wallet/session cancellation during receipt reads never reports verified or polls the daemon afterward', async context => {
  const { receipts, calls } = fixtures(context); const abort = new AbortController(); const stages: string[] = [];
  context.mock.method(rpc, 'waitForTransactionReceipt', async ({ hash }: { hash: Hex }) => { abort.abort(); return receipts.get(hash); });
  await assert.rejects(recoverDemo(journal(), 0, abort.signal, stage => stages.push(stage)), /Stopped checking/);
  assert.deepEqual(stages, ['verifying']); assert.deepEqual(calls, []);
});

test('an already aborted recovery performs no network read', async context => {
  fixtures(context); const abort = new AbortController(); abort.abort();
  context.mock.method(rpc, 'getChainId', async () => { throw new Error('Unexpected RPC after account change'); });
  await assert.rejects(recoverDemo(journal(), 0, abort.signal, () => { throw new Error('Unexpected status update'); }), /Stopped checking/);
});

test('automatic receipt wait bounds are forwarded and account cancellation does not await a stuck RPC poll', async context => {
  fixtures(context); const abort = new AbortController(); const stages: string[] = [];
  let started!: () => void; const start = new Promise<void>(resolve => { started = resolve; });
  context.mock.method(rpc, 'waitForTransactionReceipt', (input: { timeout: number }) => {
    assert.equal(input.timeout, 15000); started(); return new Promise(() => {});
  });
  const recovery = recoverDemo(journal(), 0, abort.signal, stage => stages.push(stage), undefined, { maxAttempts: 3, receiptTimeoutMs: 15000 });
  await start; abort.abort();
  await assert.rejects(recovery, /Stopped checking/);
  assert.deepEqual(stages, ['verifying']);
});
