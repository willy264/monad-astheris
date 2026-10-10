import { bytesToHex, keccak256, toBytes, type Address, type Hex, type WalletClient } from 'viem';
import { contracts, identityAbi, monadTestnet, routerAbi, walletPublicClient as rpc } from './contracts';
import { address, boundedJson, demoReadAbi, ensure, hash, object, parseJob, parseTask, paymentTypes, requestId, salt, same, taskTypedData, uint, validatePayment, verifyPaymentReceipt, verifyTaskReceipts, type DemoConfig, type DemoJournal, type DemoRecord, type DemoTask, type SignedDemoTask } from './demo-protocol';

export type DemoScope = 'demo' | 'agent-task';
export interface DemoWorkload { inputHash: Hex; outputHash: Hex }
export interface DemoJournalContext { router: Address; identity: Address; payer: Address; agentId: string }
type RunOptions = ({ scope?: 'demo' } | { scope: 'agent-task'; workload: DemoWorkload }) & {
  journalContext?: DemoJournalContext;
  isCurrent?: () => boolean;
};
const journalKeys: Record<DemoScope, string> = { demo: 'aetheris:judge-demo:v1', 'agent-task': 'aetheris:agent-task:v1' };
function taskCount(scope: DemoScope) { ensure(scope === 'demo' || scope === 'agent-task', 'Unsupported task workflow.'); return scope === 'demo' ? 5 : 1; }
const randomHash = (): Hex => bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
function journalKey(scope: DemoScope, context?: DemoJournalContext) {
  if (!context) return journalKeys[scope];
  ensure(uint(context.agentId) > 0n, 'Choose a registered agent.');
  return `${journalKeys[scope]}:10143:${address(context.identity).toLowerCase()}:${address(context.router).toLowerCase()}:${address(context.payer).toLowerCase()}:${context.agentId}`;
}
function belongsTo(journal: DemoJournal, context: DemoJournalContext) {
  return same(journal.router, context.router) && journal.records.every(record => same(record.payer, context.payer) && record.task.agentId === context.agentId);
}
export function saveDemo(journal: DemoJournal, expectedFirstRequest?: Hex, scope: DemoScope = 'demo', context?: DemoJournalContext): void {
  ensure(journal.records.length === taskCount(scope), 'The saved journal has an unexpected task count.');
  ensure(!context || belongsTo(journal, context), 'The saved requests belong to a different wallet or agent.');
  if (expectedFirstRequest) { const saved = readDemo(scope, context); ensure(saved?.records[0].requestId === expectedFirstRequest, 'Another page changed the saved demo journal. Keep this page open for reconciliation.'); }
  localStorage.setItem(journalKey(scope, context), JSON.stringify(journal));
}
export function readDemo(scope: DemoScope = 'demo', context?: DemoJournalContext): DemoJournal | undefined {
  const count = taskCount(scope); const raw = localStorage.getItem(journalKey(scope, context));
  if (!raw) {
    // Preserve earlier requests after this upgrade. A legacy journal is exposed
    // only to its original payer and agent; it is never deleted or resubmitted.
    if (context) { const legacy = readDemo(scope); return legacy && belongsTo(legacy, context) ? legacy : undefined; }
    return undefined;
  }
  ensure(raw.length < 32768, 'The saved demo journal is invalid.');
  const item = object(JSON.parse(raw)); ensure(item.version === 1 && Array.isArray(item.records) && item.records.length === count, 'The saved demo journal is invalid.');
  const router = address(item.router); const records = item.records.map(value => {
    const record = object(value); const task = parseTask(record.task); const id = hash(record.requestId);
    ensure(same(requestId(task, router), id), 'A saved task request does not match its contents.');
    // Reloaded success is rechecked on-chain; browser storage alone cannot assert verification.
    return { task, requestId: id, payer: address(record.payer), paymentNonce: hash(record.paymentNonce), amount: uint(record.amount).toString(), stage: 'unresolved' as const };
  });
  ensure(new Set(records.map(record => record.requestId)).size === count, 'Saved task IDs must be unique.');
  const journal: DemoJournal = { version: 1, router, asset: address(item.asset), receiver: address(item.receiver), createdAt: String(item.createdAt), records };
  ensure(!context || belongsTo(journal, context), 'The saved requests belong to a different wallet or agent.');
  return journal;
}

export async function signDemo(config: DemoConfig, wallet: WalletClient, signer: Address, onSigning: (index: number, kind: string) => void, signal?: AbortSignal, options: RunOptions = {}) {
  const scope = options.scope ?? 'demo'; const count = taskCount(scope);
  const assertSession = () => ensure(!signal?.aborted && (!options.isCurrent || options.isCurrent()), 'The wallet or selected agent changed. No requests were submitted.');
  assertSession();
  const workload = options.scope === 'agent-task' ? { inputHash: hash(options.workload.inputHash), outputHash: hash(options.workload.outputHash) } : undefined;
  ensure(contracts.router && contracts.identity && same(config.router, contracts.router) && same(config.identity, contracts.identity), 'The dashboard and demo are configured for different contracts.');
  ensure(await rpc.getChainId() === 10143, 'The RPC is not Monad Testnet.');
  assertSession();
  const initialChain = await wallet.getChainId(); assertSession();
  if (initialChain !== 10143) { await wallet.switchChain({ id: 10143 }); assertSession(); }
  ensure(wallet.account && same(wallet.account.address, signer), 'The connected wallet account changed.');
  async function assertWallet() {
    assertSession();
    const [accounts, chainId] = await Promise.all([wallet.getAddresses(), wallet.getChainId()]);
    ensure(chainId === 10143 && accounts[0] && same(accounts[0], signer), 'The wallet account or network changed. No requests were submitted.');
    assertSession();
  }
  await assertWallet();
  const relayers = [...new Set(config.relayers)];
  ensure(!relayers.some(relayer => same(relayer, signer)), 'Use the agent owner or a separate delegated wallet; the daemon executor key cannot also be the browser signer.');
  const [identity, authorized, owner, head, balance, ...executorAuth] = await Promise.all([
    rpc.readContract({ address: config.router, abi: routerAbi, functionName: 'identityRegistry' }),
    rpc.readContract({ address: config.router, abi: routerAbi, functionName: 'isAuthorized', args: [uint(config.agentId), signer] }),
    rpc.readContract({ address: config.identity, abi: identityAbi, functionName: 'ownerOf', args: [uint(config.agentId)] }),
    rpc.getBlock({ blockTag: 'latest' }),
    rpc.readContract({ address: config.policy.asset, abi: demoReadAbi, functionName: 'balanceOf', args: [signer] }),
    ...relayers.map(executor => rpc.readContract({ address: config.router, abi: routerAbi, functionName: 'isAuthorized', args: [uint(config.agentId), executor] })),
  ]);
  ensure(same(identity, config.identity) && owner && authorized, 'Connect the configured agent owner or an authorized delegate.');
  ensure(executorAuth.every(Boolean), 'The agent owner must delegate execution to each configured daemon wallet first.');
  const accepted = validatePayment(config.challenge, config.policy);
  ensure(balance >= uint(accepted.amount) * BigInt(count), `This wallet needs enough of the configured testnet payment token for ${count === 1 ? 'one task' : 'five tasks'}.`);
  ensure(Math.abs(Number(head.timestamp) - Math.floor(Date.now() / 1000)) <= 60, 'Your clock and the testnet clock differ. Correct your device clock before signing.');
  const clockOffset = Math.min(0, Number(head.timestamp) - Math.floor(Date.now() / 1000));
  const deadline = Math.floor(Date.now() / 1000) + clockOffset + 540; const batchId = randomHash();
  const signed: { task: SignedDemoTask; paymentHeader: string; validBefore: number }[] = [];
  const records: DemoRecord[] = [];
  for (let index = 0; index < count; index++) {
    await assertWallet();
    // The five-lane demo uses disclosed browser checksums. A single observer task
    // supplies the validated MCP input/output hashes through its scoped workload.
    const input = JSON.stringify({ workload: 'aetheris-checksum-demo-v1', batchId, lane: index + 1, numbers: [index + 1, index + 2, index + 3] });
    const inputHash = keccak256(toBytes(input)); const output = JSON.stringify({ checksum: inputHash, sum: 3 * index + 6 });
    const task: DemoTask = { agentId: config.agentId, taskId: randomHash(), sequenceNonce: BigInt(randomHash()).toString(), inputHash: workload?.inputHash ?? inputHash, outputHash: workload?.outputHash ?? keccak256(toBytes(output)), proofHash: `0x${'00'.repeat(32)}`, executor: relayers[index % relayers.length], deadline };
    onSigning(index, 'task authorization');
    const authorization = await wallet.signTypedData({ ...taskTypedData(task, config.router), account: wallet.account });
    await assertWallet();
    onSigning(index, 'testnet payment');
    const validBefore = Math.floor(Date.now() / 1000) + clockOffset + accepted.maxTimeoutSeconds; const nonce = randomHash();
    const paymentAuthorization = { from: signer, to: config.policy.receiver, value: accepted.amount, validAfter: '0', validBefore: String(validBefore), nonce };
    const signature = await wallet.signTypedData({ account: wallet.account, domain: { name: config.policy.name, version: config.policy.version, chainId: 10143, verifyingContract: config.policy.asset }, types: paymentTypes, primaryType: 'TransferWithAuthorization', message: { ...paymentAuthorization, value: uint(accepted.amount), validAfter: 0n, validBefore: BigInt(validBefore) } });
    const credential = { x402Version: 2, resource: config.challenge.resource, accepted, payload: { signature, authorization: paymentAuthorization } };
    const paymentHeader = btoa(Array.from(new TextEncoder().encode(JSON.stringify(credential)), byte => String.fromCharCode(byte)).join(''));
    signed.push({ task: { ...task, authorization }, paymentHeader, validBefore });
    records.push({ task, requestId: requestId(task, config.router), payer: signer, paymentNonce: nonce, amount: accepted.amount, stage: 'submitted' });
  }
  await assertWallet();
  ensure(signed.every(item => item.validBefore > Math.floor(Date.now() / 1000) + 15) && deadline > Math.floor(Date.now() / 1000) + 30, 'Signing took longer than the payment window. Nothing was submitted. Start again when ready to approve the wallet prompts.');
  const journal: DemoJournal = { version: 1, router: config.router, asset: config.policy.asset, receiver: config.policy.receiver, createdAt: new Date().toISOString(), records };
  // Only public task metadata is persisted. Active task/payment signatures stay in memory.
  // A storage failure aborts before the first POST, preserving status-only recovery.
  saveDemo(journal, undefined, scope, options.journalContext);
  return { signed, journal };
}

export async function postDemo(task: SignedDemoTask, paymentHeader: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch('/api/demo/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json', 'PAYMENT-SIGNATURE': paymentHeader }, body: JSON.stringify(task), signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), cache: 'no-store' });
  return boundedJson(response);
}
async function delay(signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(new Error('Stopped checking. The saved request can be recovered.')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, 2500);
    signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel();
  });
}
export async function recoverDemo(journal: DemoJournal, index: number, signal: AbortSignal, onStage: (stage: DemoRecord['stage'], transactionHash?: Hex) => void, initial?: unknown): Promise<void> {
  ensure(contracts.router && same(journal.router, contracts.router), 'This saved demo belongs to another router deployment.');
  ensure(await rpc.getChainId() === 10143, 'The RPC is not Monad Testnet.');
  const record = journal.records[index]; let candidate = initial;
  for (let attempt = 0; attempt < 60; attempt++) {
    ensure(!signal.aborted, 'Stopped checking. The saved request can be recovered.');
    if (!candidate) {
      try { const response = await fetch(`/api/demo/tasks/${record.requestId}`, { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }); candidate = await boundedJson(response); }
      catch { candidate = undefined; }
    }
    const job = (() => { try { return parseJob(candidate); } catch { return undefined; } })(); candidate = undefined;
    if (!job) { await delay(signal); continue; }
    ensure(same(job.requestId, record.requestId), 'The service returned a different request.');
    if (job.status === 'reconciliation_required') throw new Error('This task needs operator reconciliation. Its payment will not be retried.');
    if (job.status === 'completed') {
      ensure(job.result && job.payment?.success && job.payment.network === 'eip155:10143' && same(job.payment.payer, record.payer), 'The task has no matching payment settlement.');
      ensure(same(job.result.salt, salt(record.task)), 'The shard salt differs from the signed task.'); onStage('verifying');
      const predicted = await rpc.readContract({ address: journal.router, abi: routerAbi, functionName: 'predictShardAddress', args: [uint(record.task.agentId), record.task.taskId, uint(record.task.sequenceNonce), record.task.executor, record.task.inputHash] });
      ensure(same(predicted, job.result.shard), 'The CREATE2 shard address differs from the signed task.');
      const hashes = [job.result.createTx, job.result.executionTx, job.payment.transaction];
      const receipts = await Promise.all(hashes.map(transactionHash => rpc.waitForTransactionReceipt({ hash: transactionHash, confirmations: 2, timeout: 90000 })));
      for (let position = 0; position < receipts.length; position++) {
        const receipt = receipts[position]; ensure(same(receipt.transactionHash, hashes[position]), 'A task or payment transaction was replaced.');
        const block = await rpc.getBlock({ blockNumber: receipt.blockNumber }); ensure(same(block.hash, receipt.blockHash), 'A receipt is no longer on the canonical chain.');
      }
      verifyTaskReceipts(record.task, journal.router, predicted, receipts[0], receipts[1]);
      verifyPaymentReceipt(receipts[2], journal.asset, record.payer, journal.receiver, record.amount, record.paymentNonce);
      ensure(!signal.aborted, 'Stopped checking. The saved request can be recovered.');
      onStage('verified', job.result.executionTx); return;
    }
    onStage('accepted'); await delay(signal);
  }
  throw new Error('Confirmation is still pending. Recover the saved status later; no payment will be repeated.');
}
