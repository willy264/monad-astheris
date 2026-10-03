import { readFile } from 'node:fs/promises';
import { decodeEventLog, encodeFunctionData, type Address, type Hex } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { identityAbi, reputationAbi, routerAbi } from './abi.js';
import { address, bytesHash, canonical, check, hash, object, sameAddress, uint, type Rpc } from './common.js';
import { sendOperation, type SignedOperation, type SignerAction } from './transactions.js';
import type { Task } from './task.js';

export interface ReputationState {
  recordOperation?: SignedOperation; recordTransactionHash?: Hex; recordRevertedTransactionHash?: Hex; alreadyRecorded?: boolean;
  feedbackOperation?: SignedOperation; feedbackTransactionHash?: Hex; reviewer?: Address; assessmentHash?: Hex;
}
export interface Assessment { taskId: Hex; outputHash: Hex; reviewed: true; value: string; valueDecimals: number; tag1: string; tag2: string; endpoint: string; feedbackURI: string; assessment: string; }
export function validateAssessment(raw: unknown, task: Task): Assessment {
  const item = object(raw);
  check(item.reviewed === true && hash(item.taskId) === task.taskId && hash(item.outputHash) === task.outputHash, 'Assessment must explicitly review this task and output');
  check(typeof item.value === 'string' && /^-?(0|[1-9][0-9]*)$/.test(item.value), 'Assessment value must be a signed decimal integer');
  check(BigInt(item.value) >= -(2n ** 127n) && BigInt(item.value) < 2n ** 127n, 'Assessment value exceeds int128');
  check(Number.isSafeInteger(item.valueDecimals) && (item.valueDecimals as number) >= 0 && (item.valueDecimals as number) <= 18, 'Assessment precision must be 0..18');
  for (const key of ['tag1', 'tag2', 'endpoint', 'feedbackURI', 'assessment']) check(typeof item[key] === 'string' && (item[key] as string).length <= 4096, 'Invalid assessment text field');
  check((item.assessment as string).trim().length > 0 && (item.tag1 as string).length > 0, 'A written assessment and rating tag are required');
  return item as unknown as Assessment;
}
export async function recordReputation(options: {
  rpc: Rpc; rpcUrl: string; router: Address; identity: Address; reputation: Address;
  task: Task; shard: Address; signer: PrivateKeyAccount; relayers: Address[];
  state: ReputationState; persist: () => Promise<void>; confirmations: number;
  withSigner: SignerAction;
}): Promise<void> {
  const { rpc, task, reputation, state } = options;
  const [identity, router] = await Promise.all([
    rpc.readContract({ address: reputation, abi: reputationAbi, functionName: 'getIdentityRegistry' }),
    rpc.readContract({ address: reputation, abi: reputationAbi, functionName: 'taskRouter' }),
  ]);
  check(sameAddress(identity, options.identity) && sameAddress(router, options.router), 'Reputation registry belongs to another deployment');
  check(!options.relayers.some(item => sameAddress(item, options.signer.address)), 'Task client signer must not share a daemon relayer nonce');
  const recorded = await rpc.readContract({ address: reputation, abi: reputationAbi, functionName: 'recordedTasks', args: [options.shard] });
  const data = encodeFunctionData({ abi: reputationAbi, functionName: 'recordTaskExecution', args: [options.shard] });
  const recordReceipt = await options.withSigner(options.signer.address, (pending, reserve) => {
    // A global signer save can precede the per-task save. Inspect it even if a
    // third party has since recorded the shard, so no pending nonce is orphaned.
    if (!state.recordOperation && !pending && recorded) return Promise.resolve(undefined);
    return sendOperation({
      rpc, rpcUrl: options.rpcUrl, signer: options.signer, to: reputation, data, saved: state.recordOperation ?? pending, confirmations: options.confirmations, allowReverted: true,
      save: async operation => { await reserve(operation); state.recordOperation = operation; await options.persist(); },
    });
  });
  if (recordReceipt) {
    const receipt = recordReceipt;
    if (receipt.status === 'reverted') {
      check(await rpc.readContract({ address: reputation, abi: reputationAbi, functionName: 'recordedTasks', args: [options.shard] }), 'Reputation recording reverted without an existing record; reconcile the transaction');
      state.recordRevertedTransactionHash = receipt.transactionHash;
      state.alreadyRecorded = true;
    } else {
      const events = receipt.logs.filter(log => sameAddress(log.address, reputation)).flatMap(log => {
        try { return [decodeEventLog({ abi: reputationAbi, eventName: 'TaskExecutionRecorded', data: log.data, topics: log.topics, strict: true }).args]; } catch { return []; }
      });
      check(events.some(event => sameAddress(event.shard, options.shard) && event.agentId === uint(task.agentId) && event.taskId === task.taskId && event.outputHash === task.outputHash && event.proofHash === task.proofHash), 'Reputation record event does not match the completed task');
      state.recordTransactionHash = receipt.transactionHash;
    }
  } else { state.alreadyRecorded = true; }
  await options.persist();

  // Never invent a rating or use the owner's key as a reviewer.
  const reviewerKey = process.env.REVIEWER_PRIVATE_KEY?.trim();
  const assessmentPath = process.env.REVIEW_ASSESSMENT_FILE?.trim();
  check(Boolean(reviewerKey) === Boolean(assessmentPath), 'Feedback needs both REVIEWER_PRIVATE_KEY and REVIEW_ASSESSMENT_FILE');
  if (!reviewerKey || !assessmentPath) {
    check(!state.feedbackOperation, 'A saved feedback transaction requires the original reviewer configuration to resume');
    return;
  }
  const reviewer = privateKeyToAccount(reviewerKey as Hex);
  check(!sameAddress(reviewer.address, options.signer.address) && !options.relayers.some(item => sameAddress(item, reviewer.address)), 'Reviewer must be independent of the task signer and daemon relayers');
  const assessment = validateAssessment(JSON.parse(await readFile(assessmentPath, 'utf8')), task);
  const assessmentHash = bytesHash(canonical(assessment));
  check(!state.assessmentHash || state.assessmentHash === assessmentHash, 'Assessment changed after feedback was prepared');
  check(!state.reviewer || sameAddress(state.reviewer, reviewer.address), 'Reviewer changed after feedback was prepared');
  const owner = await rpc.readContract({ address: identity, abi: identityAbi, functionName: 'ownerOf', args: [uint(task.agentId)] });
  const [approved, operator, delegate] = await Promise.all([
    rpc.readContract({ address: identity, abi: identityAbi, functionName: 'getApproved', args: [uint(task.agentId)] }),
    rpc.readContract({ address: identity, abi: identityAbi, functionName: 'isApprovedForAll', args: [owner, reviewer.address] }),
    rpc.readContract({ address: router, abi: routerAbi, functionName: 'isAuthorized', args: [uint(task.agentId), reviewer.address] }),
  ]);
  check(!sameAddress(owner, reviewer.address) && !sameAddress(approved, reviewer.address) && !operator && !delegate, 'Reviewer is an owner, approved operator or task delegate');
  state.reviewer = reviewer.address;
  state.assessmentHash = assessmentHash;
  await options.persist();
  const feedbackData = encodeFunctionData({ abi: reputationAbi, functionName: 'giveFeedback', args: [
    uint(task.agentId), BigInt(assessment.value), assessment.valueDecimals, assessment.tag1, assessment.tag2,
    assessment.endpoint, assessment.feedbackURI, assessmentHash,
  ] });
  const receipt = await options.withSigner(reviewer.address, (pending, reserve) => sendOperation({
    rpc, rpcUrl: options.rpcUrl, signer: reviewer, to: reputation, data: feedbackData, saved: state.feedbackOperation ?? pending, confirmations: options.confirmations,
    save: async operation => { await reserve(operation); state.feedbackOperation = operation; await options.persist(); },
  }));
  const events = receipt.logs.filter(log => sameAddress(log.address, reputation)).flatMap(log => {
    try { return [decodeEventLog({ abi: reputationAbi, eventName: 'NewFeedback', data: log.data, topics: log.topics, strict: true }).args]; } catch { return []; }
  });
  check(events.some(event => event.agentId === uint(task.agentId) && sameAddress(event.clientAddress, reviewer.address) && event.feedbackHash === assessmentHash
    && event.value === BigInt(assessment.value) && event.valueDecimals === assessment.valueDecimals && event.tag1 === assessment.tag1 && event.tag2 === assessment.tag2
    && event.endpoint === assessment.endpoint && event.feedbackURI === assessment.feedbackURI), 'Feedback event does not match the reviewed assessment');
  state.feedbackTransactionHash = receipt.transactionHash;
  await options.persist();
}
