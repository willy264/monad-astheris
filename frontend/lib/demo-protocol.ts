import { decodeEventLog, encodePacked, hashTypedData, isAddress, keccak256, parseAbi, type Address, type Hex, type TransactionReceipt } from 'viem';
import { routerAbi } from './contracts';

export function ensure(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
export function object(value: unknown): Record<string, unknown> { ensure(value && typeof value === 'object' && !Array.isArray(value), 'Invalid service response.'); return value as Record<string, unknown>; }
export function uint(value: unknown): bigint { ensure(typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(value), 'Invalid unsigned number.'); const result = BigInt(value); ensure(result < 2n ** 256n, 'Number exceeds uint256.'); return result; }
export function address(value: unknown): Address { ensure(typeof value === 'string' && isAddress(value) && !/^0x0{40}$/i.test(value), 'Invalid wallet address.'); return value; }
export function hash(value: unknown): Hex { ensure(typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value), 'Invalid transaction or task hash.'); return value as Hex; }
export function same(a: string | null | undefined, b: string): boolean { return typeof a === 'string' && a.toLowerCase() === b.toLowerCase(); }
export function assertDemoOrigin(request: Request): void {
  ensure(request.headers.get('origin') === new URL(request.url).origin, 'Only this dashboard can submit demo requests.');
  ensure(['same-origin', null].includes(request.headers.get('sec-fetch-site')), 'Cross-site demo requests are not allowed.');
  ensure(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'application/json', 'Send JSON task data.');
}

export interface DemoTask { agentId: string; taskId: Hex; sequenceNonce: string; inputHash: Hex; outputHash: Hex; proofHash: Hex; executor: Address; deadline: number; }
export interface SignedDemoTask extends DemoTask { authorization: Hex; }
export interface PaymentPolicy { resource: string; asset: Address; receiver: Address; maxAmount: string; name: string; version: string; }
export interface ExactPayment { scheme: 'exact'; network: 'eip155:10143'; amount: string; asset: Address; payTo: Address; maxTimeoutSeconds: number; extra: { name: string; version: string }; }
export interface DemoConfig { enabled: true; chainId: 10143; router: Address; identity: Address; agentId: string; relayers: Address[]; policy: PaymentPolicy; challenge: { x402Version: 2; resource: { url: string }; accepts: ExactPayment[] }; }
export interface DemoJob { requestId: Hex; status: 'accepted' | 'completed' | 'settlement_pending' | 'reconciliation_required'; result?: { shard: Address; salt: Hex; createTx: Hex; executionTx: Hex }; payment?: { success: boolean; network: string; payer: Address; transaction: Hex }; }
export interface DemoRecord { task: DemoTask; requestId: Hex; payer: Address; paymentNonce: Hex; amount: string; stage: 'submitted' | 'accepted' | 'verifying' | 'verified' | 'unresolved'; transactionHash?: Hex; }
export interface DemoJournal { version: 1; router: Address; asset: Address; receiver: Address; createdAt: string; records: DemoRecord[]; }

export const taskTypes = { TaskAuthorization: [
  { name: 'agentId', type: 'uint256' }, { name: 'taskId', type: 'bytes32' }, { name: 'sequenceNonce', type: 'uint256' },
  { name: 'inputHash', type: 'bytes32' }, { name: 'outputHash', type: 'bytes32' }, { name: 'proofHash', type: 'bytes32' },
  { name: 'executor', type: 'address' }, { name: 'deadline', type: 'uint64' },
] } as const;
export const paymentTypes = { TransferWithAuthorization: [
  { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
  { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
] } as const;
export const demoReadAbi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
]);
const paymentEvents = parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)', 'event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)']);

export function parseTask(raw: unknown): DemoTask {
  const item = object(raw); const agentId = uint(item.agentId).toString(); ensure(BigInt(agentId) > 0n, 'Agent ID must be positive.');
  ensure(Number.isSafeInteger(item.deadline) && Number(item.deadline) > 0, 'Invalid authorization deadline.');
  return { agentId, taskId: hash(item.taskId), sequenceNonce: uint(item.sequenceNonce).toString(), inputHash: hash(item.inputHash), outputHash: hash(item.outputHash), proofHash: hash(item.proofHash), executor: address(item.executor), deadline: Number(item.deadline) };
}
export function taskTypedData(task: DemoTask, router: Address) { return { domain: { name: 'AetherisTask', version: '1', chainId: 10143, verifyingContract: router }, types: taskTypes, primaryType: 'TaskAuthorization' as const, message: { agentId: uint(task.agentId), taskId: task.taskId, sequenceNonce: uint(task.sequenceNonce), inputHash: task.inputHash, outputHash: task.outputHash, proofHash: task.proofHash, executor: task.executor, deadline: BigInt(task.deadline) } }; }
export function requestId(task: DemoTask, router: Address): Hex { return hashTypedData(taskTypedData(task, router)); }
export function salt(task: DemoTask): Hex { return keccak256(encodePacked(['uint256', 'bytes32', 'uint256'], [uint(task.agentId), task.taskId, uint(task.sequenceNonce)])); }

export function validatePayment(raw: unknown, policy: PaymentPolicy): ExactPayment {
  const item = object(raw); ensure(item.x402Version === 2 && object(item.resource).url === policy.resource, 'Payment resource differs from the configured demo.');
  ensure(!item.extensions || Object.keys(object(item.extensions)).length === 0, 'Payment extensions are not supported.');
  ensure(Array.isArray(item.accepts) && item.accepts.length === 1, 'The demo requires one exact payment option.');
  const accepted = object(item.accepts[0]); const extra = object(accepted.extra);
  ensure(accepted.scheme === 'exact' && accepted.network === 'eip155:10143', 'The demo requires x402 EIP-3009 payments on Monad Testnet.');
  ensure(same(address(accepted.asset), policy.asset) && same(address(accepted.payTo), policy.receiver), 'Payment token or recipient differs from the operator policy.');
  ensure(uint(accepted.amount) > 0n && uint(accepted.amount) <= uint(policy.maxAmount), 'The task price exceeds the configured limit.');
  ensure(Number.isSafeInteger(accepted.maxTimeoutSeconds) && Number(accepted.maxTimeoutSeconds) >= 60 && Number(accepted.maxTimeoutSeconds) <= 120, 'Unsupported payment expiry.');
  ensure(extra.name === policy.name && extra.version === policy.version && Object.keys(extra).every(key => ['name', 'version'].includes(key)), 'Unexpected payment token signing domain.');
  ensure(Object.keys(accepted).every(key => ['scheme', 'network', 'amount', 'asset', 'payTo', 'maxTimeoutSeconds', 'extra'].includes(key)), 'Unsupported payment mechanism.');
  return accepted as unknown as ExactPayment;
}
export function parseConfig(raw: unknown): DemoConfig {
  const item = object(raw); ensure(item.enabled === true && item.chainId === 10143, 'The live demo is not configured.');
  const policy = object(item.policy); const resource = new URL(String(policy.resource));
  ensure(resource.protocol === 'https:' || (resource.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(resource.hostname)), 'Unsafe payment resource.');
  ensure(!resource.username && !resource.password && !resource.search && !resource.hash, 'Unsafe payment resource.');
  const pinned = { resource: resource.toString(), asset: address(policy.asset), receiver: address(policy.receiver), maxAmount: uint(policy.maxAmount).toString(), name: String(policy.name), version: String(policy.version) };
  ensure(pinned.name.length > 0 && pinned.name.length <= 100 && pinned.version.length > 0 && pinned.version.length <= 30, 'Invalid payment domain.');
  const accepted = validatePayment(item.challenge, pinned); const agentId = uint(item.agentId).toString(); ensure(BigInt(agentId) > 0n, 'Invalid demo agent.');
  ensure(Array.isArray(item.relayers) && item.relayers.length > 0 && item.relayers.length <= 32, 'No executor is available.');
  return { enabled: true, chainId: 10143, router: address(item.router), identity: address(item.identity), agentId, relayers: item.relayers.map(address), policy: pinned, challenge: { x402Version: 2, resource: { url: pinned.resource }, accepts: [accepted] } };
}
export function parseJob(raw: unknown): DemoJob {
  const item = object(raw); ensure(['accepted', 'completed', 'settlement_pending', 'reconciliation_required'].includes(String(item.status)), 'Task status is unavailable.');
  const result = item.result ? object(item.result) : undefined; const payment = item.payment ? object(item.payment) : undefined;
  return { requestId: hash(item.requestId), status: item.status as DemoJob['status'],
    ...(result ? { result: { shard: address(result.shard), salt: hash(result.salt), createTx: hash(result.createTx), executionTx: hash(result.executionTx) } } : {}),
    ...(payment ? { payment: { success: payment.success === true, network: String(payment.network), payer: address(payment.payer), transaction: hash(payment.transaction) } } : {}) };
}

export function verifyTaskReceipts(task: DemoTask, router: Address, shard: Address, create: TransactionReceipt, execution: TransactionReceipt): void {
  for (const receipt of [create, execution]) ensure(receipt.status === 'success' && same(receipt.to, router) && same(receipt.from, task.executor), 'A task receipt has an unexpected status, router or executor.');
  ensure(create.blockNumber <= execution.blockNumber, 'Execution precedes shard creation.');
  const created = create.logs.filter(log => same(log.address, router)).flatMap(log => { try { return [decodeEventLog({ abi: routerAbi, eventName: 'ShardCreated', ...log, strict: true }).args]; } catch { return []; } }).filter(event => same(event.shard, shard));
  const executed = execution.logs.filter(log => same(log.address, router)).flatMap(log => { try { return [decodeEventLog({ abi: routerAbi, eventName: 'TaskExecuted', ...log, strict: true }).args]; } catch { return []; } }).filter(event => same(event.shard, shard));
  ensure(created.length === 1 && executed.length === 1, 'The expected shard events are missing.');
  const initial = created[0], completed = executed[0];
  ensure(initial.agentId === uint(task.agentId) && same(initial.taskId, task.taskId) && initial.sequenceNonce === uint(task.sequenceNonce) && same(initial.executor, task.executor) && same(initial.inputHash, task.inputHash), 'Shard creation differs from the signed task.');
  ensure(completed.agentId === uint(task.agentId) && same(completed.taskId, task.taskId) && same(completed.inputHash, task.inputHash) && same(completed.outputHash, task.outputHash) && same(completed.proofHash, task.proofHash), 'Execution differs from the signed task.');
}
export function verifyPaymentReceipt(receipt: TransactionReceipt, asset: Address, payer: Address, receiver: Address, amount: string, nonce: Hex) {
  ensure(receipt.status === 'success', 'The payment reverted.');
  const transfers = receipt.logs.filter(log => same(log.address, asset)).flatMap(log => { try { return [decodeEventLog({ abi: paymentEvents, eventName: 'Transfer', ...log, strict: true }).args]; } catch { return []; } });
  const uses = receipt.logs.filter(log => same(log.address, asset)).flatMap(log => { try { return [decodeEventLog({ abi: paymentEvents, eventName: 'AuthorizationUsed', ...log, strict: true }).args]; } catch { return []; } });
  ensure(transfers.some(event => same(event.from, payer) && same(event.to, receiver) && event.value === uint(amount)), 'The payment transfer does not match this task.');
  ensure(uses.some(event => same(event.authorizer, payer) && same(event.nonce, nonce)), 'This task payment authorization was not consumed.');
}

export async function boundedJson(response: Response, maxBytes = 32768): Promise<unknown> {
  ensure(response.body, 'The service returned an empty response.'); const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try { while (true) { const item = await reader.read(); if (item.done) break; length += item.value.length; ensure(length <= maxBytes, 'Service response exceeds the size limit.'); chunks.push(item.value); } }
  finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new Error('The service returned invalid JSON.'); }
}
