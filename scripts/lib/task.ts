import { decodeEventLog, encodePacked, hashTypedData, keccak256, type Address, type Hex, type TransactionReceipt } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import { check, hash, sameAddress, uint } from './common.js';
import { routerAbi } from './abi.js';

export interface Task {
  agentId: string; taskId: Hex; sequenceNonce: string; inputHash: Hex; outputHash: Hex;
  proofHash: Hex; executor: Address; deadline: number; authorization: Hex;
}
export const taskTypes = { TaskAuthorization: [
  { name: 'agentId', type: 'uint256' }, { name: 'taskId', type: 'bytes32' },
  { name: 'sequenceNonce', type: 'uint256' }, { name: 'inputHash', type: 'bytes32' },
  { name: 'outputHash', type: 'bytes32' }, { name: 'proofHash', type: 'bytes32' },
  { name: 'executor', type: 'address' }, { name: 'deadline', type: 'uint64' },
] } as const;
export function taskTypedData(task: Omit<Task, 'authorization'>, router: Address) {
  check(Number.isSafeInteger(task.deadline) && task.deadline > 0, 'Invalid task deadline');
  return {
    domain: { name: 'AetherisTask', version: '1', chainId: 10143, verifyingContract: router },
    types: taskTypes, primaryType: 'TaskAuthorization' as const,
    message: { ...task, agentId: uint(task.agentId), sequenceNonce: uint(task.sequenceNonce), deadline: BigInt(task.deadline) },
  };
}
export function taskId(task: Task, router: Address): Hex { return hashTypedData(taskTypedData(task, router)); }
export async function signTask(task: Omit<Task, 'authorization'>, router: Address, signer: PrivateKeyAccount): Promise<Task> {
  return { ...task, authorization: await signer.signTypedData(taskTypedData(task, router)) };
}
export function shardSalt(task: Pick<Task, 'agentId' | 'taskId' | 'sequenceNonce'>): Hex {
  return keccak256(encodePacked(['uint256', 'bytes32', 'uint256'], [uint(task.agentId), hash(task.taskId), uint(task.sequenceNonce)]));
}
export function verifyTaskReceipts(task: Task, router: Address, shard: Address, create: TransactionReceipt, execution: TransactionReceipt): void {
  for (const receipt of [create, execution]) {
    check(receipt.status === 'success' && receipt.to && sameAddress(receipt.to, router), 'Task transaction failed or targeted another contract');
    check(sameAddress(receipt.from, task.executor), 'Task transaction sender is not the assigned executor');
  }
  check(create.blockNumber <= execution.blockNumber, 'Execution precedes shard creation');
  const created = create.logs.filter(log => sameAddress(log.address, router)).flatMap(log => {
    try { const event = decodeEventLog({ abi: routerAbi, eventName: 'ShardCreated', data: log.data, topics: log.topics, strict: true }); return [event.args]; }
    catch { return []; }
  }).filter(args => sameAddress(args.shard, shard));
  check(created.length === 1, 'Expected exactly one matching ShardCreated event');
  const initial = created[0];
  check(initial.agentId === uint(task.agentId) && initial.taskId === task.taskId && initial.sequenceNonce === uint(task.sequenceNonce)
    && sameAddress(initial.executor, task.executor) && initial.inputHash === task.inputHash, 'ShardCreated fields do not match the signed task');
  const executed = execution.logs.filter(log => sameAddress(log.address, router)).flatMap(log => {
    try { const event = decodeEventLog({ abi: routerAbi, eventName: 'TaskExecuted', data: log.data, topics: log.topics, strict: true }); return [event.args]; }
    catch { return []; }
  }).filter(args => sameAddress(args.shard, shard));
  check(executed.length === 1, 'Expected exactly one matching TaskExecuted event');
  const completed = executed[0];
  check(completed.agentId === uint(task.agentId) && completed.taskId === task.taskId && completed.inputHash === task.inputHash
    && completed.outputHash === task.outputHash && completed.proofHash === task.proofHash, 'TaskExecuted fields do not match the signed task');
}
