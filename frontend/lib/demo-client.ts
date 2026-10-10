import { bytesToHex, keccak256, parseAbiItem, toBytes, type Address, type Hex, type WalletClient } from 'viem';
import { contracts, identityAbi, monadTestnet, routerAbi, walletPublicClient as rpc } from './contracts';
import { readEventWindow } from './rpc-events.mjs';
import { address, boundedJson, demoReadAbi, ensure, hash, object, parseJob, parseTask, paymentTypes, requestId, salt, same, taskTypedData, uint, validatePayment, verifyPaymentReceipt, verifyTaskReceipts, type DemoConfig, type DemoJournal, type DemoRecord, type DemoReceiptHints, type DemoTask, type SignedDemoTask } from './demo-protocol';

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
function receiptHints(value: unknown): DemoReceiptHints | undefined {
  if (!value) return undefined;
  // A malformed optional hint must not destroy the original recovery IDs.
  try { const item = object(value); return { createTx: hash(item.createTx), executionTx: hash(item.executionTx), paymentTx: hash(item.paymentTx) }; }
  catch { return undefined; }
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
    const hints = receiptHints(record.receiptHints);
    return { task, requestId: id, payer: address(record.payer), paymentNonce: hash(record.paymentNonce), amount: uint(record.amount).toString(), stage: 'unresolved' as const, ...(hints ? { receiptHints: hints } : {}) };
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
const historyReads = new WeakMap<AbortSignal, Promise<unknown>>();
const authorizationUsed = parseAbiItem('event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)');
function readForSession<T>(read: Promise<T>, signal: AbortSignal): Promise<T> {
  // Viem does not forward this UI signal to receipt polling. Stop following the
  // result immediately on account change, even if an RPC read finishes later.
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new Error('Stopped checking. The saved request can be recovered.'));
    signal.addEventListener('abort', cancel, { once: true });
    read.then(value => { signal.removeEventListener('abort', cancel); if (signal.aborted) cancel(); else resolve(value); }, cause => { signal.removeEventListener('abort', cancel); reject(cause); });
    if (signal.aborted) cancel();
  });
}
async function indexedReceiptHints(journal: DemoJournal, record: DemoRecord, signal: AbortSignal): Promise<DemoReceiptHints | undefined> {
  let snapshot = historyReads.get(signal);
  if (!snapshot) {
    snapshot = (async () => {
      const response = await fetch('/api/overview', { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
      ensure(response.ok, 'Indexed receipt history is not available yet.');
      return boundedJson(response, 512 * 1024);
    })();
    historyReads.set(signal, snapshot);
  }
  const overview = object(await snapshot);
  ensure(!signal.aborted && overview.chainId === 10143, 'The indexed history is not available for this session and network.');
  const history = overview.shardHistory ? object(overview.shardHistory).shards : overview.shards;
  ensure(Array.isArray(history) && history.length <= 200, 'Indexed receipt history is unavailable or exceeds the recovery limit.');
  // An indexer row only locates receipts. None of its success labels are trusted.
  const matches = history.map(object).filter(row => row.status === 'executed' && row.agentId === record.task.agentId
    && same(String(row.taskId), record.task.taskId) && row.sequenceNonce === record.task.sequenceNonce
    && same(String(row.executor), record.task.executor) && same(String(row.inputHash), record.task.inputHash)
    && same(String(row.outputHash), record.task.outputHash) && same(String(row.proofHash), record.task.proofHash));
  if (matches.length !== 1) return undefined;
  const createTx = hash(matches[0].transactionHash), executionTx = hash(matches[0].executionTransactionHash);
  const execution = await rpc.getTransactionReceipt({ hash: executionTx });
  ensure(!signal.aborted, 'Stopped checking. The saved request can be recovered.');
  ensure(same(execution.transactionHash, executionTx) && execution.status === 'success' && same(execution.to, journal.router) && same(execution.from, record.task.executor), 'The indexed task receipt does not match the saved task.');
  // Payment settlement follows execution. Limit this fallback to 200 blocks and
  // split into <=100-block requests for Monad's public RPC range limit.
  const head = await rpc.getBlockNumber();
  const end = execution.blockNumber + 199n;
  type PaymentLog = { address: Address; removed: boolean; transactionHash: Hex | null; args: { authorizer: Address; nonce: Hex } };
  const payments = await readEventWindow<PaymentLog>(execution.blockNumber, head < end ? head : end, async range => {
    ensure(!signal.aborted, 'Stopped checking. The saved request can be recovered.');
    return rpc.getLogs({ address: journal.asset, event: authorizationUsed, args: { authorizer: record.payer, nonce: record.paymentNonce }, ...range, strict: true });
  });
  ensure(!signal.aborted, 'Stopped checking. The saved request can be recovered.');
  const hashes = [...new Set(payments.filter(log => !log.removed && same(log.address, journal.asset) && same(log.args.authorizer, record.payer) && same(log.args.nonce, record.paymentNonce)).map(log => hash(log.transactionHash)))];
  ensure(hashes.length === 1, 'The exact task payment was not found in the bounded receipt search. Keep this request saved for reconciliation.');
  return { createTx, executionTx, paymentTx: hashes[0] };
}
export async function recoverDemo(journal: DemoJournal, index: number, signal: AbortSignal, onStage: (stage: DemoRecord['stage'], transactionHash?: Hex, hints?: DemoReceiptHints) => void, initial?: unknown, options: { maxAttempts?: number; receiptTimeoutMs?: number } = {}): Promise<void> {
  const assertCurrent = () => ensure(!signal.aborted, 'Stopped checking. The saved request can be recovered.');
  assertCurrent();
  ensure(contracts.router && same(journal.router, contracts.router), 'This saved demo belongs to another router deployment.');
  ensure(await readForSession(rpc.getChainId(), signal) === 10143, 'The RPC is not Monad Testnet.');
  assertCurrent();
  const record = journal.records[index]; let candidate = initial;
  ensure(record && same(record.requestId, requestId(record.task, journal.router)), 'The saved request does not match its task.');
  const receiptTimeout = options.receiptTimeoutMs ?? 90000;
  ensure(Number.isSafeInteger(receiptTimeout) && receiptTimeout > 0 && receiptTimeout <= 90000, 'Invalid receipt timeout.');
  async function verify(hints: DemoReceiptHints, reportedShard?: Address) {
    assertCurrent(); onStage('verifying', undefined, hints);
    const predicted = await rpc.readContract({ address: journal.router, abi: routerAbi, functionName: 'predictShardAddress', args: [uint(record.task.agentId), record.task.taskId, uint(record.task.sequenceNonce), record.task.executor, record.task.inputHash] });
    assertCurrent();
    if (reportedShard) ensure(same(predicted, reportedShard), 'The CREATE2 shard address differs from the signed task.');
    const hashes = [hints.createTx, hints.executionTx, hints.paymentTx];
    const receipts = await readForSession(Promise.all(hashes.map(transactionHash => rpc.waitForTransactionReceipt({ hash: transactionHash, confirmations: 2, timeout: receiptTimeout }))), signal);
    assertCurrent();
    for (let position = 0; position < receipts.length; position++) {
      const receipt = receipts[position]; ensure(same(receipt.transactionHash, hashes[position]), 'A task or payment transaction was replaced.');
      const block = await rpc.getBlock({ blockNumber: receipt.blockNumber }); assertCurrent();
      ensure(same(block.hash, receipt.blockHash), 'A receipt is no longer on the canonical chain.');
    }
    verifyTaskReceipts(record.task, journal.router, predicted, receipts[0], receipts[1]);
    verifyPaymentReceipt(receipts[2], journal.asset, record.payer, journal.receiver, record.amount, record.paymentNonce);
    assertCurrent(); onStage('verified', hints.executionTx, hints);
  }
  // Render's free service can lose its local job journal on restart. Previously
  // observed hashes survive locally, but every exact task/payment event and
  // canonical receipt is checked again before a lane can become green.
  const savedHints = receiptHints(record.receiptHints);
  if (savedHints) {
    try { await verify(savedHints); return; }
    catch { assertCurrent(); /* A stale or invalid hint may be replaced by the job's current receipt locations. */ }
  }
  const maxAttempts = options.maxAttempts ?? 60;
  ensure(Number.isSafeInteger(maxAttempts) && maxAttempts > 0 && maxAttempts <= 60, 'Invalid status check limit.');
  let historyChecked = false;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    assertCurrent();
    if (!candidate) {
      try { const response = await fetch(`/api/demo/tasks/${record.requestId}`, { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }); candidate = await boundedJson(response); }
      catch { candidate = undefined; }
    }
    assertCurrent();
    const job = (() => { try { return parseJob(candidate); } catch { return undefined; } })(); candidate = undefined;
    if (!job) {
      if (!historyChecked) {
        historyChecked = true;
        try { const hints = await indexedReceiptHints(journal, record, signal); if (hints) { await verify(hints); return; } }
        catch { assertCurrent(); /* Preserve the original request and manual recovery if history or payment evidence is incomplete. */ }
      }
      if (attempt + 1 < maxAttempts) await delay(signal); continue;
    }
    ensure(same(job.requestId, record.requestId), 'The service returned a different request.');
    if (job.status === 'reconciliation_required') throw new Error('This task needs operator reconciliation. Its payment will not be retried.');
    if (job.status === 'completed') {
      ensure(job.result && job.payment?.success && job.payment.network === 'eip155:10143' && same(job.payment.payer, record.payer), 'The task has no matching payment settlement.');
      ensure(same(job.result.salt, salt(record.task)), 'The shard salt differs from the signed task.');
      await verify({ createTx: job.result.createTx, executionTx: job.result.executionTx, paymentTx: job.payment.transaction }, job.result.shard);
      return;
    }
    onStage('accepted'); if (attempt + 1 < maxAttempts) await delay(signal);
  }
  throw new Error('Confirmation is still pending. Recover the saved status later; no payment will be repeated.');
}
