import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { encodeAbiParameters, encodeEventTopics, parseAbi, type Hex, type TransactionReceipt } from 'viem';
import { assertDemoOrigin, boundedJson, parseJob, requestId, salt, taskTypedData, validatePayment, verifyPaymentReceipt, verifyTaskReceipts, type DemoTask, type PaymentPolicy } from '../lib/demo-protocol';
import { readDemo, recoverDemo, saveDemo } from '../lib/demo-client';
import { contracts, walletPublicClient } from '../lib/contracts';

const owner = `0x${'11'.repeat(20)}` as const, router = `0x${'22'.repeat(20)}` as const, shard = `0x${'33'.repeat(20)}` as const, asset = `0x${'44'.repeat(20)}` as const;
const receiver = `0x${'55'.repeat(20)}` as const, nonce = `0x${'66'.repeat(32)}` as const, transactionHash = `0x${'77'.repeat(32)}` as const;
const task: DemoTask = { agentId: '1', taskId: `0x${'88'.repeat(32)}`, sequenceNonce: '17', inputHash: `0x${'99'.repeat(32)}`, outputHash: `0x${'aa'.repeat(32)}`, proofHash: `0x${'00'.repeat(32)}`, executor: owner, deadline: 1800000000 };
const policy: PaymentPolicy = { resource: 'https://demo.example/v1/tasks', asset, receiver, maxAmount: '100', name: 'TestToken', version: '1' };
const accepted = { scheme: 'exact', network: 'eip155:10143', amount: '10', asset, payTo: receiver, maxTimeoutSeconds: 120, extra: { name: 'TestToken', version: '1' } };
const challenge = (changes = {}) => ({ x402Version: 2, resource: { url: policy.resource }, accepts: [{ ...accepted, ...changes }] });
const eventAbi = parseAbi([
  'event ShardCreated(address indexed shard,uint256 indexed agentId,bytes32 indexed taskId,uint256 sequenceNonce,address executor,bytes32 inputHash)',
  'event TaskExecuted(address indexed shard,uint256 indexed agentId,bytes32 indexed taskId,bytes32 inputHash,bytes32 outputHash,bytes32 proofHash)',
  'event Transfer(address indexed from,address indexed to,uint256 value)', 'event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)',
]);
const receipt = (logs: unknown[], overrides = {}): TransactionReceipt => ({ status: 'success', transactionHash, from: owner, to: router, blockNumber: 100n, logs, ...overrides } as unknown as TransactionReceipt);
const createLog = { address: router, topics: encodeEventTopics({ abi: eventAbi, eventName: 'ShardCreated', args: { shard, agentId: 1n, taskId: task.taskId } }), data: encodeAbiParameters([{ type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }], [17n, owner, task.inputHash]) };
const executionLog = { address: router, topics: encodeEventTopics({ abi: eventAbi, eventName: 'TaskExecuted', args: { shard, agentId: 1n, taskId: task.taskId } }), data: encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }], [task.inputHash, task.outputHash, task.proofHash]) };

test('paid demo pins network, token, recipient, signing domain, amount and mechanisms', () => {
  assert.equal(validatePayment(challenge(), policy).amount, '10');
  for (const changes of [{ network: 'eip155:1' }, { asset: owner }, { payTo: owner }, { amount: '101' }, { amount: '0' }, { extra: { name: 'WrongToken', version: '1' } }, { extra: { ...accepted.extra, permit: true } }, { maxTimeoutSeconds: 600 }, { permit: true }]) assert.throws(() => validatePayment(challenge(changes), policy));
  assert.throws(() => validatePayment({ ...challenge(), resource: { url: 'https://other.example/' } }, policy));
  assert.throws(() => validatePayment({ ...challenge(), extensions: { permit: {} } }, policy));
});
test('task authorization binds router, executor, output and expiry while CREATE2 salt ignores expiry', () => {
  const original = requestId(task, router);
  for (const changed of [{ ...task, executor: receiver }, { ...task, outputHash: nonce }, { ...task, deadline: task.deadline + 1 }]) assert.notEqual(requestId(changed, router), original);
  assert.notEqual(requestId(task, receiver), original);
  assert.equal(salt(task), salt({ ...task, deadline: task.deadline + 1 }));
  assert.equal(taskTypedData(task, router).domain.chainId, 10143);
  assert.deepEqual(taskTypedData(task, router).types.TaskAuthorization.map(field => field.name), ['agentId', 'taskId', 'sequenceNonce', 'inputHash', 'outputHash', 'proofHash', 'executor', 'deadline']);
});
test('receipt verification rejects foreign router events, incorrect outputs, executor mismatch and reverts', () => {
  const create = receipt([createLog]); const execution = receipt([executionLog]);
  assert.doesNotThrow(() => verifyTaskReceipts(task, router, shard, create, execution));
  assert.throws(() => verifyTaskReceipts(task, router, shard, create, receipt([{ ...executionLog, address: owner }])));
  assert.throws(() => verifyTaskReceipts({ ...task, outputHash: nonce }, router, shard, create, execution));
  assert.throws(() => verifyTaskReceipts(task, router, shard, create, receipt([executionLog], { from: receiver })));
  assert.throws(() => verifyTaskReceipts(task, router, shard, create, receipt([executionLog], { status: 'reverted' })));
});
test('payment verification requires exact transfer and this authorization nonce', () => {
  const transfer = { address: asset, topics: encodeEventTopics({ abi: eventAbi, eventName: 'Transfer', args: { from: owner, to: receiver } }), data: encodeAbiParameters([{ type: 'uint256' }], [10n]) };
  const used = { address: asset, topics: encodeEventTopics({ abi: eventAbi, eventName: 'AuthorizationUsed', args: { authorizer: owner, nonce } }), data: '0x' as Hex };
  assert.doesNotThrow(() => verifyPaymentReceipt(receipt([transfer, used]), asset, owner, receiver, '10', nonce));
  assert.throws(() => verifyPaymentReceipt(receipt([transfer]), asset, owner, receiver, '10', nonce));
  assert.throws(() => verifyPaymentReceipt(receipt([transfer, used]), asset, owner, receiver, '11', nonce));
  assert.throws(() => verifyPaymentReceipt(receipt([transfer, used]), asset, owner, receiver, '10', task.taskId));
});
test('paid proxy requires explicit same origin and JSON', () => {
  const request = (headers: Record<string, string>) => new Request('https://demo.example/api/demo/tasks', { method: 'POST', headers });
  assert.doesNotThrow(() => assertDemoOrigin(request({ origin: 'https://demo.example', 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' })));
  const invalidHeaders: Record<string, string>[] = [{ origin: 'https://evil.example', 'content-type': 'application/json' }, { 'content-type': 'application/json' }, { origin: 'https://demo.example', 'content-type': 'text/plain' }, { origin: 'https://demo.example', 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }];
  for (const headers of invalidHeaders) assert.throws(() => assertDemoOrigin(request(headers)));
});
test('bounded responses fail closed and unknown completion labels cannot create verified jobs', async () => {
  await assert.rejects(() => boundedJson(new Response(JSON.stringify({ data: 'a'.repeat(100) })), 32), /size limit/);
  await assert.rejects(() => boundedJson(new Response('not-json')), /invalid JSON/);
  assert.throws(() => parseJob({ requestId: transactionHash, status: 'verified' }));
  assert.equal(parseJob({ requestId: transactionHash, status: 'settlement_pending' }).status, 'settlement_pending');
});
test('saved progress never supplies verification and another run cannot overwrite recovery IDs', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'); const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  try {
    const records = Array.from({ length: 5 }, (_, index) => { const item = { ...task, sequenceNonce: String(index) }; return { task: item, requestId: requestId(item, router), payer: owner, paymentNonce: nonce, amount: '10', stage: 'verified' as const, transactionHash }; });
    const journal = { version: 1 as const, router, asset, receiver, createdAt: new Date().toISOString(), records };
    saveDemo(journal); const reloaded = readDemo(); assert.ok(reloaded); assert.ok(reloaded.records.every(record => record.stage === 'unresolved' && !record.transactionHash));
    assert.throws(() => saveDemo(journal, transactionHash), /Another page/);
    assert.doesNotThrow(() => saveDemo(journal, records[0].requestId));
    const tampered = { ...journal, records: [{ ...records[0], task: { ...records[0].task, outputHash: nonce } }, ...records.slice(1)] };
    values.set('aetheris:judge-demo:v1', JSON.stringify(tampered)); assert.throws(() => readDemo(), /does not match/);
  } finally { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage'); }
});
test('normal settlement_pending keeps polling with GET only instead of treating it as a failed task', async context => {
  const previousRouter = contracts.router; contracts.router = router;
  const id = requestId(task, router); const stages: string[] = []; const calls: { url: string; method?: string }[] = [];
  const journal = { version: 1 as const, router, asset, receiver, createdAt: new Date().toISOString(), records: [{ task, requestId: id, payer: owner, paymentNonce: nonce, amount: '10', stage: 'submitted' as const }] };
  context.mock.method(walletPublicClient, 'getChainId', async () => 10143);
  context.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    calls.push({ url, method: options.method }); return new Response(JSON.stringify({ requestId: id, status: 'reconciliation_required' }), { status: 502 });
  });
  try {
    await assert.rejects(() => recoverDemo(journal, 0, new AbortController().signal, stage => stages.push(stage), { requestId: id, status: 'settlement_pending' }), /operator reconciliation/);
    assert.deepEqual(stages, ['accepted']); assert.deepEqual(calls, [{ url: `/api/demo/tasks/${id}`, method: undefined }]);
  } finally { contracts.router = previousRouter; }
});
