import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, hashTypedData, keccak256, parseAbi, recoverTypedDataAddress, type Address, type Hex, type TransactionReceipt } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { canonical, bytesHash, endpoint, zeroHash, type Rpc } from '../lib/common.js';
import { Journal } from '../lib/journal.js';
import { callMcp, validateToolResult } from '../lib/mcp.js';
import { decodeChallenge, signPayment, validateChallenge, verifyCredential, type PaymentPolicy } from '../lib/payment.js';
import { publicAuthorization } from '../lib/proof.js';
import { recordReputation, validateAssessment, type ReputationState } from '../lib/reputation.js';
import { verifyPaymentTransfer } from '../lib/settlement.js';
import { shardSalt, signTask, taskId, taskTypedData, verifyTaskReceipts, type Task } from '../lib/task.js';
import { verifySignedOperation, withSignerJournal } from '../lib/transactions.js';
import { reputationAbi, routerAbi } from '../lib/abi.js';

const account = privateKeyToAccount(`0x${'00'.repeat(31)}01`);
const router = `0x${'11'.repeat(20)}` as Address;
const shard = `0x${'22'.repeat(20)}` as Address;
const executor = `0x${'77'.repeat(20)}` as Address;
const task: Task = { agentId: '1', taskId: `0x${'33'.repeat(32)}`, sequenceNonce: '7', inputHash: `0x${'44'.repeat(32)}`,
  outputHash: `0x${'55'.repeat(32)}`, proofHash: `0x${'66'.repeat(32)}`, executor, deadline: 1000, authorization: '0x' };
const policy: PaymentPolicy = { resource: 'http://127.0.0.1:8080/v1/tasks', asset: router, receiver: shard, maxAmount: 1000n, name: 'Test Token', version: '1', maxTimeoutSeconds: 120 };
function challenge() { return { x402Version: 2, resource: { url: policy.resource }, accepts: [{ scheme: 'exact', network: 'eip155:10143', amount: '500', asset: router, payTo: shard, maxTimeoutSeconds: 120, extra: { name: policy.name, version: policy.version } }] }; }
function receipt(logs: TransactionReceipt['logs'], transactionHash = `0x${'88'.repeat(32)}` as Hex): TransactionReceipt {
  return { status: 'success', to: router, from: executor, blockNumber: 10n, blockHash: `0x${'99'.repeat(32)}`, transactionHash, logs } as TransactionReceipt;
}
function creationLog() {
  return { address: router, topics: encodeEventTopics({ abi: routerAbi, eventName: 'ShardCreated', args: { shard, agentId: 1n, taskId: task.taskId } }),
    data: encodeAbiParameters([{ type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }], [7n, executor, task.inputHash]) } as TransactionReceipt['logs'][number];
}
function executionLog(output = task.outputHash) {
  return { address: router, topics: encodeEventTopics({ abi: routerAbi, eventName: 'TaskExecuted', args: { shard, agentId: 1n, taskId: task.taskId } }),
    data: encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }], [task.inputHash, output, task.proofHash]) } as TransactionReceipt['logs'][number];
}

test('canonical MCP bytes preserve Unicode and array order and reject unsafe integers', () => {
  assert.equal(canonical({ z: [2, 1], a: 'é' }), '{"a":"é","z":[2,1]}');
  assert.equal(bytesHash(canonical({ a: 1, b: 2 })), bytesHash(canonical({ b: 2, a: 1 })));
  assert.throws(() => canonical({ value: Number.MAX_SAFE_INTEGER + 1 }));
  assert.throws(() => canonical({ value: undefined }));
  assert.throws(() => endpoint('https://example.com/mcp?secret=do-not-publish'));
});

test('task EIP712 binds output, chain/router and executor; salt matches Rust/Solidity vector', async () => {
  assert.equal(shardSalt(task), '0xc0837dccb7b05109d2ced1dfbcf109adeaa1a1258e74fa924d4f5c7f13562173');
  const signed = await signTask(task, router, account);
  assert.equal(await recoverTypedDataAddress({ ...taskTypedData(signed, router), signature: signed.authorization }), account.address);
  assert.notEqual(taskId(signed, router), taskId({ ...signed, outputHash: zeroHash }, router));
  assert.notEqual(taskId(signed, router), taskId(signed, shard));
  assert.notEqual(taskId(signed, router), taskId({ ...signed, executor: account.address }, router));
  assert.notEqual(taskId(signed, router), hashTypedData({ ...taskTypedData(signed, router), domain: { ...taskTypedData(signed, router).domain, chainId: 1 } }));
});

test('payment challenge rejects server-controlled overspend, recipient/domain changes and alternate mechanisms', () => {
  assert.equal(validateChallenge(challenge(), policy).amount, '500');
  for (const mutate of [
    (value: ReturnType<typeof challenge>) => { value.accepts[0].amount = '1001'; },
    (value: ReturnType<typeof challenge>) => { value.accepts[0].amount = '0'; },
    (value: ReturnType<typeof challenge>) => { value.accepts[0].payTo = account.address; },
    (value: ReturnType<typeof challenge>) => { value.accepts[0].asset = shard; },
    (value: ReturnType<typeof challenge>) => { value.accepts[0].network = 'eip155:1'; },
    (value: ReturnType<typeof challenge>) => { value.accepts[0].extra.name = 'Other Token'; },
    (value: ReturnType<typeof challenge>) => { value.accepts[0].maxTimeoutSeconds = 121; },
    (value: ReturnType<typeof challenge>) => { value.resource.url = 'https://attacker.example/v1/tasks'; },
    (value: ReturnType<typeof challenge>) => { Object.assign(value.accepts[0].extra, { assetTransferMethod: 'permit2' }); },
  ]) { const value = challenge(); mutate(value); assert.throws(() => validateChallenge(value, policy)); }
});

test('EIP3009 authorization is cryptographically bound to locally pinned policy', async () => {
  const payment = await signPayment(challenge(), policy, account, 100);
  assert.equal(payment.validBefore, 220);
  await verifyCredential(payment, policy, account.address);
  const payload = decodeChallenge(payment.value) as { payload: { authorization: { value: string } } };
  payload.payload.authorization.value = '501';
  await assert.rejects(verifyCredential({ ...payment, value: Buffer.from(JSON.stringify(payload)).toString('base64') }, policy, account.address));
  await assert.rejects(verifyCredential(payment, { ...policy, version: '2' }, account.address));
});

test('task receipt verification rejects changed outputs, wrong contracts, failed receipts and missing creation', () => {
  const created = receipt([creationLog()]);
  const completed = receipt([executionLog()]);
  verifyTaskReceipts(task, router, shard, created, completed);
  assert.throws(() => verifyTaskReceipts(task, router, shard, created, receipt([executionLog(zeroHash)])));
  assert.throws(() => verifyTaskReceipts(task, router, shard, created, { ...completed, status: 'reverted' }));
  assert.throws(() => verifyTaskReceipts(task, router, shard, receipt([]), completed));
  assert.throws(() => verifyTaskReceipts(task, router, shard, created, receipt([{ ...executionLog(), address: shard }])));
});

test('payment success requires an actual matching token Transfer event', () => {
  const abi = parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']);
  const log = { address: router, topics: encodeEventTopics({ abi, eventName: 'Transfer', args: { from: account.address, to: shard } }), data: encodeAbiParameters([{ type: 'uint256' }], [500n]) } as TransactionReceipt['logs'][number];
  const authAbi = parseAbi(['event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)']);
  const used = { address: router, topics: encodeEventTopics({ abi: authAbi, eventName: 'AuthorizationUsed', args: { authorizer: account.address, nonce: task.taskId } }), data: '0x' } as unknown as TransactionReceipt['logs'][number];
  verifyPaymentTransfer(receipt([log, used]), router, account.address, shard, 500n, task.taskId);
  assert.throws(() => verifyPaymentTransfer(receipt([log, used]), router, account.address, shard, 501n, task.taskId));
  assert.throws(() => verifyPaymentTransfer(receipt([log, used]), shard, account.address, shard, 500n, task.taskId));
  assert.throws(() => verifyPaymentTransfer(receipt([log]), router, account.address, shard, 500n, task.taskId));
  assert.throws(() => verifyPaymentTransfer(receipt([log, used]), router, account.address, shard, 500n, zeroHash));
});

test('active signatures are excluded from public proof; only explicit expired export includes one', async () => {
  const signed = await signTask(task, router, account);
  const active = publicAuthorization(signed, router, false, 999);
  assert.equal('signature' in active, false);
  assert.equal(JSON.stringify(active).includes(signed.authorization), false);
  assert.throws(() => publicAuthorization(signed, router, true, 999));
  assert.throws(() => publicAuthorization(signed, router, true, 1000));
  assert.equal(publicAuthorization(signed, router, true, 1001).signature, signed.authorization);
});

test('durable journals lock concurrent clients and preserve ambiguous intent across restarts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'aetheris-client-test-'));
  t.after(async () => { assert.ok(resolve(directory).startsWith(resolve(tmpdir()))); await rm(directory, { recursive: true, force: true }); });
  const journal = await Journal.acquire<{ phase: string; privateCredential?: string }>(directory);
  await assert.rejects(Journal.acquire(directory), /locked/);
  assert.equal(await journal.load(), undefined);
  await journal.save({ phase: 'mcp_started' });
  await journal.release();
  const resumed = await Journal.acquire<{ phase: string; privateCredential?: string }>(directory);
  assert.equal((await resumed.load())?.phase, 'mcp_started');
  await resumed.save({ phase: 'submitted', privateCredential: 'not-public' });
  assert.equal(JSON.parse(await readFile(join(directory, 'state-00000001.json'), 'utf8')).phase, 'submitted');
  await resumed.release();
});

test('saved raw transaction validation rejects changed intent before replay', async () => {
  const raw = await account.signTransaction({ chainId: 10143, type: 'eip1559', nonce: 3, gas: 50_000n, maxFeePerGas: 2n, maxPriorityFeePerGas: 1n, to: router, data: '0x1234', value: 0n });
  const operation = { raw, hash: keccak256(raw), from: account.address, to: router, data: '0x1234' as Hex, nonce: 3 };
  await verifySignedOperation(operation, account.address, router, '0x1234');
  await assert.rejects(verifySignedOperation(operation, account.address, shard, '0x1234'));
  await assert.rejects(verifySignedOperation(operation, account.address, router, '0xabcd'));
  await assert.rejects(verifySignedOperation({ ...operation, nonce: 4 }, account.address, router, '0x1234'));
});

test('ambiguous signer nonce remains reserved across journals and releases only after canonical confirmation', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'aetheris-signer-test-'));
  t.after(async () => { assert.ok(resolve(directory).startsWith(resolve(tmpdir()))); await rm(directory, { recursive: true, force: true }); });
  const raw = await account.signTransaction({ chainId: 10143, type: 'eip1559', nonce: 3, gas: 50_000n, maxFeePerGas: 2n, maxPriorityFeePerGas: 1n, to: router, data: '0x1234', value: 0n });
  const operation = { raw, hash: keccak256(raw), from: account.address, to: router, data: '0x1234' as Hex, nonce: 3 };
  let confirmed = false;
  const rpc = {
    getTransactionReceipt: async () => { if (!confirmed) throw new Error('unknown'); return { ...receipt([], operation.hash), status: 'reverted' }; },
    getBlockNumber: async () => 22n,
    getBlock: async () => ({ hash: receipt([]).blockHash }),
  } as unknown as Rpc;
  await assert.rejects(withSignerJournal(directory, 'task-a', rpc, 12, async (_pending, reserve) => {
    await reserve(operation); throw new Error('simulated crash after global save');
  }));
  let otherTaskRan = false;
  await assert.rejects(withSignerJournal(directory, 'task-b', rpc, 12, async () => { otherTaskRan = true; }), /unresolved operation/);
  assert.equal(otherTaskRan, false);
  await withSignerJournal(directory, 'task-a', rpc, 12, async pending => { assert.equal(pending?.raw, raw); });
  confirmed = true;
  await withSignerJournal(directory, 'task-b', rpc, 12, async pending => { assert.equal(pending, undefined); otherTaskRan = true; });
  assert.equal(otherTaskRan, true);
});

test('permissionless recording race retains reverted provenance and does not block completion', async () => {
  const data = encodeFunctionData({ abi: reputationAbi, functionName: 'recordTaskExecution', args: [shard] });
  const raw = await account.signTransaction({ chainId: 10143, type: 'eip1559', nonce: 3, gas: 80_000n, maxFeePerGas: 2n, maxPriorityFeePerGas: 1n, to: router, data, value: 0n });
  const operation = { raw, hash: keccak256(raw), from: account.address, to: router, data, nonce: 3 };
  const failed = { ...receipt([], operation.hash), status: 'reverted' as const };
  const state: ReputationState = { recordOperation: operation };
  const rpc = {
    readContract: async (request: { functionName: string }) => request.functionName === 'getIdentityRegistry' ? shard : request.functionName === 'taskRouter' ? router : true,
    getTransactionReceipt: async () => failed,
    waitForTransactionReceipt: async () => failed,
    getBlock: async () => ({ hash: failed.blockHash }),
    sendRawTransaction: async () => { assert.fail('Already-mined transaction must not be rebroadcast'); },
  } as unknown as Rpc;
  await recordReputation({ rpc, rpcUrl: 'http://localhost:8545', router, identity: shard, reputation: router, task, shard, signer: account,
    relayers: [executor], state, persist: async () => {}, confirmations: 12,
    withSigner: async (_signer, action) => action(undefined, async () => {}),
  });
  assert.equal(state.alreadyRecorded, true);
  assert.equal(state.recordRevertedTransactionHash, operation.hash);
  assert.equal(state.recordTransactionHash, undefined);
});

test('feedback requires a written assessment bound to this output and explicit reviewed consent', () => {
  const assessment = { taskId: task.taskId, outputHash: task.outputHash, reviewed: true, value: '8', valueDecimals: 0, tag1: 'quality', tag2: '', endpoint: 'https://example.com/mcp', feedbackURI: '', assessment: 'Reviewed the returned computation against the input.' };
  validateAssessment(assessment, task);
  assert.throws(() => validateAssessment({ ...assessment, reviewed: false }, task));
  assert.throws(() => validateAssessment({ ...assessment, outputHash: zeroHash }, task));
  assert.throws(() => validateAssessment({ ...assessment, assessment: '' }, task));
  assert.throws(() => validateAssessment({ ...assessment, value: '1.5' }, task));
});

test('MCP initialization/list/call succeeds once; server errors are rejected without retry or leaked text', async t => {
  let calls = 0;
  let toolError = false;
  const methods: string[] = [];
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    const chunks = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    methods.push(body.method);
    if (body.id === undefined) { res.writeHead(202).end(); return; }
    let result: unknown;
    if (body.method === 'initialize') result = { protocolVersion: body.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'test-fixture', version: '1' } };
    else if (body.method === 'tools/list') result = { tools: [{ name: 'echo', inputSchema: { type: 'object', properties: { prompt: { type: 'string' } } } }] };
    else if (body.method === 'tools/call') { calls++; result = { content: [{ type: 'text', text: toolError ? 'private-server-secret' : body.params.arguments.prompt }], isError: toolError }; }
    else { res.writeHead(400).end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const listen = server.address(); assert.ok(listen && typeof listen !== 'string');
  const url = `http://127.0.0.1:${listen.port}/mcp`;
  const result = await callMcp(url, 'echo', { prompt: 'actual test output' });
  assert.equal((result.content as Array<{ text: string }>)[0].text, 'actual test output');
  assert.equal(calls, 1);
  assert.ok(methods.includes('initialize') && methods.includes('notifications/initialized') && methods.includes('tools/list'));
  toolError = true;
  await assert.rejects(callMcp(url, 'echo', { prompt: 'second' }), error => error instanceof Error && !error.message.includes('private-server-secret'));
  assert.equal(calls, 2);
  assert.throws(() => validateToolResult({ content: [] }));
});
