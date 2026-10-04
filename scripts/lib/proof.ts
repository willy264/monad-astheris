import type { Address } from 'viem';
import { check } from './common.js';
import { taskTypes, type Task } from './task.js';

export function publicAuthorization(task: Task, router: Address, exportExpiredSignature: boolean, now = Math.floor(Date.now() / 1000)) {
  if (exportExpiredSignature) check(task.deadline < now, 'Task signature is still active; wait until after its deadline before exporting it');
  return {
    domain: { name: 'AetherisTask', version: '1', chainId: 10143, verifyingContract: router },
    types: taskTypes, primaryType: 'TaskAuthorization' as const,
    message: { agentId: task.agentId, taskId: task.taskId, sequenceNonce: task.sequenceNonce,
      inputHash: task.inputHash, outputHash: task.outputHash, proofHash: task.proofHash,
      executor: task.executor, deadline: String(task.deadline) },
    ...(exportExpiredSignature ? { signature: task.authorization } : {}),
  };
}
