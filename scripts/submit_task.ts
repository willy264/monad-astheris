import { randomBytes } from 'node:crypto';
import { readFile, rename } from 'node:fs/promises';
import { resolve, join, dirname, relative, isAbsolute } from 'node:path';
import { loadEnvFile } from 'node:process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { recoverTypedDataAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { routerAbi } from './lib/abi.js';
import { address, bytesHash, canonical, check, ClientError, endpoint, hash, object, readJsonResponse, request, required, rpcClient, sameAddress, uint, zeroHash } from './lib/common.js';
import { Journal, privateWrite } from './lib/journal.js';
import { callMcp } from './lib/mcp.js';
import { decodeChallenge, signPayment, validateChallenge, verifyCredential, type PaymentCredential, type PaymentPolicy } from './lib/payment.js';
import { recordReputation, type ReputationState } from './lib/reputation.js';
import { publicAuthorization } from './lib/proof.js';
import { withSignerJournal } from './lib/transactions.js';
import { shardSalt, signTask, taskId as requestId, taskTypedData, verifyTaskReceipts, type Task } from './lib/task.js';

interface State {
  schemaVersion: 1; fingerprint: Hex; phase: 'new' | 'mcp_started' | 'output_saved' | 'signed' | 'submitted' | 'verified';
  taskId: Hex; inputCanonical: string; outputCanonical?: string; task?: Task; requestId?: Hex;
  payment?: PaymentCredential; reputation: ReputationState;
}
export interface PublicTaskProof {
  schemaVersion: 1; chainId: 10143; router: Address; identityRegistry: Address; reputationRegistry: Address;
  agentId: string; taskId: Hex; sequenceNonce: string; executor: Address; signer: Address;
  inputHash: Hex; outputHash: Hex; proofHash: Hex; shard: Address; salt: Hex; requestId: Hex;
  createTransactionHash: Hex; executionTransactionHash: Hex; executionBlockNumber: string; executionBlockHash: Hex;
  payment: { mode: 'x402'; transactionHash: Hex; asset: Address; receiver: Address; amount: string; authorizationNonce: Hex };
  reputation: { recordTransactionHash: Hex | null; recordRevertedTransactionHash: Hex | null; alreadyRecorded: boolean };
  feedback: { status: 'submitted' | 'not-configured'; transactionHash: Hex | null; reviewer: Address | null; assessmentHash: Hex | null };
  mcp: { tool: string; canonicalization: 'aetheris-sorted-json-v1'; inputBytes: number; outputBytes: number };
  taskAuthorization: ReturnType<typeof publicAuthorization>;
}
async function artifact(path: string, text: string): Promise<void> {
  try { await privateWrite(path, text); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    check(await readFile(path, 'utf8') === text, 'An existing task artifact has different bytes');
  }
}

async function run(): Promise<void> {
  const { values } = parseArgs({ options: { 'run-dir': { type: 'string' }, resume: { type: 'boolean' }, 'prepare-only': { type: 'boolean' }, 'export-proof': { type: 'boolean' }, help: { type: 'boolean' } }, strict: true });
  if (values.help) {
    console.log('Usage: pnpm submit-task --run-dir .state/tasks/<name> [--resume] [--prepare-only | --export-proof]\nReads scripts/.env. Calls one MCP tool, signs a bounded x402 payment, submits /v1/tasks, verifies receipts, records reputation; independent configured feedback is optional. --resume never repeats an ambiguous MCP invocation or task POST. --export-proof requires --resume and a previously verified task with an expired authorization; it only reads chain state and exports the expired task signature.');
    return;
  }
  const scriptRoot = dirname(fileURLToPath(import.meta.url));
  try { loadEnvFile(join(scriptRoot, '.env')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  check(values['run-dir'], 'Supply a persistent --run-dir for this task');
  const runDirectory = resolve(values['run-dir']);
  const withinState = relative(join(scriptRoot, '.state'), runDirectory);
  check(withinState && !withinState.startsWith('..') && !isAbsolute(withinState), '--run-dir must be a subdirectory of scripts/.state so credentials remain in ignored storage');
  const journal = await Journal.acquire<State>(runDirectory);
  try {
    let state = await journal.load();
    check(Boolean(state) === Boolean(values.resume), state ? 'Existing task journal: use --resume' : 'No task journal exists to resume');
    check(!(values['prepare-only'] && values['export-proof']), 'Choose either --prepare-only or --export-proof');
    if (values['export-proof']) check(state?.phase === 'verified' && state.task && state.task.deadline < Math.floor(Date.now() / 1000), 'Proof export requires an already verified task whose authorization has expired');
    const router = address(required('AETHERIS_ROUTER_ADDRESS'), 'router');
    const reputation = address(required('REPUTATION_REGISTRY_ADDRESS'), 'reputation registry');
    const executor = address(required('EXECUTOR_ADDRESS'), 'executor');
    const agentId = required('AGENT_ID'); uint(agentId);
    const sequenceNonce = process.env.TASK_SEQUENCE_NONCE?.trim() || '0'; uint(sequenceNonce);
    const signer = privateKeyToAccount(required('TASK_SIGNER_PRIVATE_KEY') as Hex);
    const rpcUrl = required('MONAD_RPC_URL');
    const rpc = rpcClient(rpcUrl);
    const daemonUrl = endpoint(required('DAEMON_URL')).replace(/\/$/, '');
    const taskUrl = `${daemonUrl}/v1/tasks`;
    const mcpUrl = endpoint(required('MCP_SERVER_URL'));
    const tool = required('MCP_TOOL_NAME');
    const args = object(JSON.parse(await readFile(required('MCP_ARGUMENTS_FILE'), 'utf8')));
    const inputCanonical = canonical({ format: 'aetheris-mcp-input-v1', endpoint: mcpUrl, tool, arguments: args });
    check(Buffer.byteLength(inputCanonical) <= 1024 * 1024, 'MCP input exceeds 1 MiB');
    check((process.env.PAYMENT_MODE || 'x402') === 'x402', 'This client implements x402 exact EIP3009; Graph Tally requires its separate receipt client');
    const policy: PaymentPolicy = {
      resource: taskUrl, asset: address(required('PAYMENT_ASSET')), receiver: address(required('PAYMENT_RECEIVER')),
      maxAmount: uint(required('PAYMENT_MAX_AMOUNT'), 'payment budget', 128),
      name: required('PAYMENT_ASSET_NAME'), version: required('PAYMENT_ASSET_VERSION'),
      maxTimeoutSeconds: Number(process.env.PAYMENT_MAX_TIMEOUT_SECONDS || '120'),
    };
    check(policy.maxAmount > 0n && Number.isSafeInteger(policy.maxTimeoutSeconds) && policy.maxTimeoutSeconds > 0 && policy.maxTimeoutSeconds <= 300, 'Invalid payment policy limits');
    const confirmations = Number(process.env.TASK_CONFIRMATIONS || '12');
    check(Number.isSafeInteger(confirmations) && confirmations >= 1 && confirmations <= 1000, 'TASK_CONFIRMATIONS must be 1..1000');
    const selectedTaskId = state?.taskId ?? (process.env.TASK_ID ? hash(process.env.TASK_ID) : `0x${randomBytes(32).toString('hex')}` as Hex);
    check(selectedTaskId !== zeroHash && (!process.env.TASK_ID || hash(process.env.TASK_ID) === selectedTaskId), 'Task ID differs from saved attempt or is zero');
    const fingerprint = bytesHash(canonical({ router, reputation, executor, agentId, sequenceNonce, signer: signer.address, daemonUrl, inputCanonical,
      taskId: selectedTaskId, policy: { ...policy, maxAmount: policy.maxAmount.toString() }, confirmations }));
    if (!state) {
      state = { schemaVersion: 1, fingerprint, phase: 'new', taskId: selectedTaskId, inputCanonical, reputation: {} };
      await journal.save(state);
    }
    check(state.schemaVersion === 1 && state.fingerprint === fingerprint && state.inputCanonical === inputCanonical, 'Configuration/input differs from the saved task; preserve this attempt for reconciliation');
    const current = state;
    const persist = () => journal.save(current);
    await artifact(join(runDirectory, 'input.canonical.json'), current.inputCanonical);
    check(await rpc.getChainId() === 10143, 'RPC is not Monad Testnet');
    const routerCode = await rpc.getCode({ address: router });
    check(routerCode && routerCode !== '0x', 'Router has no deployed code');
    const identity = await rpc.readContract({ address: router, abi: routerAbi, functionName: 'identityRegistry' });
    const configResponse = await request(`${daemonUrl}/v1/config`);
    check(configResponse.ok, 'Daemon config endpoint is unavailable');
    const config = object(await readJsonResponse(configResponse));
    check(config.chainId === 10143 && sameAddress(config.router, router), 'Daemon network/router do not match local configuration');
    check(object(config.taskAuthorization).name === 'AetherisTask' && object(config.taskAuthorization).version === '1', 'Unexpected daemon authorization domain');
    check(Array.isArray(config.relayers), 'Daemon relayers missing');
    const relayers = config.relayers.map(item => address(item));
    check(relayers.some(item => sameAddress(item, executor)), 'Executor is not a configured daemon relayer');
    check(!relayers.some(item => sameAddress(item, signer.address)), 'Use a task signer separate from every daemon relayer to avoid nonce conflicts');
    validateChallenge(config.payment, policy);
    // Authorization is required for a new submission. Existing submitted jobs can
    // still be inspected after an agent transfer or a delegation has expired.
    if (['new', 'mcp_started', 'output_saved', 'signed'].includes(current.phase)) {
      const [clientAllowed, executorAllowed] = await Promise.all([
        rpc.readContract({ address: router, abi: routerAbi, functionName: 'isAuthorized', args: [uint(agentId), signer.address] }),
        rpc.readContract({ address: router, abi: routerAbi, functionName: 'isAuthorized', args: [uint(agentId), executor] }),
      ]);
      check(clientAllowed && executorAllowed, 'Task signer and executor must both be authorized for the agent');
    }
    if (current.phase === 'mcp_started') throw new ClientError('Previous MCP invocation has an unknown outcome. Reconcile with the tool server; this client will not call it again');
    if (current.phase === 'new') {
      current.phase = 'mcp_started'; await persist();
      const output = await callMcp(mcpUrl, tool, args, process.env.MCP_BEARER_TOKEN || undefined);
      current.outputCanonical = canonical(output);
      current.phase = 'output_saved'; await persist();
    }
    check(current.outputCanonical, 'Saved MCP output is missing');
    await artifact(join(runDirectory, 'output.canonical.json'), current.outputCanonical);
    if (values['prepare-only']) { console.log(JSON.stringify({ status: 'output_saved', taskId: current.taskId, inputHash: bytesHash(current.inputCanonical), outputHash: bytesHash(current.outputCanonical) })); return; }
    if (current.phase === 'output_saved') {
      // Obtain an actual 402 challenge. This request carries no payment and cannot
      // route a task; compare it against operator limits before either signature.
      const response = await request(taskUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      check(response.status === 402, 'Daemon did not return the expected unpaid 402 challenge');
      const challenge = decodeChallenge(response.headers.get('PAYMENT-REQUIRED'));
      validateChallenge(challenge, policy);
      await response.body?.cancel();
      const now = Math.floor(Date.now() / 1000);
      current.task = await signTask({ agentId, taskId: current.taskId, sequenceNonce, inputHash: bytesHash(current.inputCanonical), outputHash: bytesHash(current.outputCanonical),
        proofHash: zeroHash, executor, deadline: now + 600 }, router, signer);
      current.requestId = requestId(current.task, router);
      current.payment = await signPayment(challenge, policy, signer, now);
      current.phase = 'signed'; await persist();
    }
    check(current.task && current.payment && current.requestId, 'Saved signed task/payment is missing');
    check(current.task.agentId === agentId && current.task.taskId === current.taskId && current.task.sequenceNonce === sequenceNonce && sameAddress(current.task.executor, executor)
      && current.task.inputHash === bytesHash(current.inputCanonical) && current.task.outputHash === bytesHash(current.outputCanonical) && current.task.proofHash === zeroHash, 'Saved task does not match the MCP artifacts');
    check(requestId(current.task, router) === current.requestId, 'Saved task digest is invalid');
    check(sameAddress(await recoverTypedDataAddress({ ...taskTypedData(current.task, router), signature: current.task.authorization }), signer.address), 'Saved task signature is invalid');
    await verifyCredential(current.payment, policy, signer.address);

    let job: Record<string, unknown> | undefined;
    if (current.phase === 'signed') {
      const now = Math.floor(Date.now() / 1000);
      check(current.payment.validBefore > now + 10 && current.task.deadline > now + 10, 'Saved authorization expired before submission. Do not create another payment under this attempt; reconcile first');
      current.phase = 'submitted'; await persist();
      // Persist submission intent before the only paid POST. Any ambiguous response
      // resumes with GET only; no fresh nonce, payment or MCP request is generated.
      const response = await request(taskUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', [current.payment.header]: current.payment.value }, body: JSON.stringify(current.task) }, 180_000);
      const body = await readJsonResponse(response);
      check([200, 202, 502].includes(response.status), `Task submission returned HTTP ${response.status}; preserve journal and inspect daemon/provider before retrying`);
      job = object(body);
    }
    if (!job || job.status === 'accepted') {
      // Bounded polling keeps resumes useful without an unbounded local process.
      for (let attempt = 0; attempt < 60; attempt++) {
        const response = await request(`${taskUrl}/${current.requestId}`);
        check(response.status !== 404, 'Submitted request is unknown to the daemon. Reconcile the saved submission intent; no automatic paid retry');
        check([200, 202, 502].includes(response.status), 'Task status endpoint is unavailable');
        job = object(await readJsonResponse(response));
        if (job.status !== 'accepted') break;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    check(job && job.requestId === current.requestId, 'Daemon returned a different task request ID');
    check(job.status === 'completed', 'Task is not completed; inspect the persisted daemon status and resume later without another payment');
    const result = object(job.result);
    const shard = address(result.shard);
    const salt = shardSalt(current.task);
    check(hash(result.salt) === salt, 'Daemon returned an incorrect CREATE2 salt');
    const predicted = await rpc.readContract({ address: router, abi: routerAbi, functionName: 'predictShardAddress', args: [uint(agentId), current.taskId, uint(sequenceNonce), executor, current.task.inputHash] });
    check(sameAddress(shard, predicted), 'Daemon shard differs from the router prediction');
    const [created, executed] = await Promise.all([
      rpc.waitForTransactionReceipt({ hash: hash(result.createTx), confirmations, timeout: 180_000 }),
      rpc.waitForTransactionReceipt({ hash: hash(result.executionTx), confirmations, timeout: 180_000 }),
    ]);
    check(created.transactionHash === hash(result.createTx) && executed.transactionHash === hash(result.executionTx), 'Task transaction was replaced');
    verifyTaskReceipts(current.task, router, shard, created, executed);
    for (const receipt of [created, executed]) check((await rpc.getBlock({ blockNumber: receipt.blockNumber })).hash === receipt.blockHash, 'Task receipt is not canonical');
    const payment = object(job.payment);
    check(payment.success === true && payment.network === 'eip155:10143' && sameAddress(payment.payer, signer.address), 'Payment settlement receipt does not match the task payer/network');
    const paymentHash = hash(payment.transaction);
    const paymentReceipt = await rpc.waitForTransactionReceipt({ hash: paymentHash, confirmations, timeout: 180_000 });
    check(paymentReceipt.transactionHash === paymentHash && paymentReceipt.status === 'success', 'Payment transaction is not confirmed successful');
    // Payment transfer logs are checked below; provider success alone is not proof.
    const { verifyPaymentTransfer } = await import('./lib/settlement.js');
    verifyPaymentTransfer(paymentReceipt, policy.asset, signer.address, policy.receiver, BigInt(current.payment.amount), current.payment.nonce);
    check((await rpc.getBlock({ blockNumber: paymentReceipt.blockNumber })).hash === paymentReceipt.blockHash, 'Payment receipt is not canonical');
    current.phase = 'verified'; await persist();
    if (!values['export-proof']) await recordReputation({ rpc, rpcUrl, router, identity, reputation, task: current.task, shard, signer, relayers, state: current.reputation, persist, confirmations,
      withSigner: (account, action) => withSignerJournal(join(scriptRoot, '.state', 'signers', account.toLowerCase()), runDirectory, rpc, confirmations, action),
    });
    const proof: PublicTaskProof = {
      schemaVersion: 1, chainId: 10143, router, identityRegistry: identity, reputationRegistry: reputation,
      agentId, taskId: current.taskId, sequenceNonce, executor, signer: signer.address,
      inputHash: current.task.inputHash, outputHash: current.task.outputHash, proofHash: current.task.proofHash,
      shard, salt, requestId: current.requestId, createTransactionHash: created.transactionHash,
      executionTransactionHash: executed.transactionHash, executionBlockNumber: executed.blockNumber.toString(), executionBlockHash: executed.blockHash,
      payment: { mode: 'x402', transactionHash: paymentHash, asset: policy.asset, receiver: policy.receiver, amount: current.payment.amount, authorizationNonce: current.payment.nonce },
      reputation: { recordTransactionHash: current.reputation.recordTransactionHash ?? null, recordRevertedTransactionHash: current.reputation.recordRevertedTransactionHash ?? null, alreadyRecorded: current.reputation.alreadyRecorded === true },
      feedback: { status: current.reputation.feedbackTransactionHash ? 'submitted' : 'not-configured', transactionHash: current.reputation.feedbackTransactionHash ?? null,
        reviewer: current.reputation.reviewer ?? null, assessmentHash: current.reputation.assessmentHash ?? null },
      mcp: { tool, canonicalization: 'aetheris-sorted-json-v1', inputBytes: Buffer.byteLength(current.inputCanonical), outputBytes: Buffer.byteLength(current.outputCanonical) },
      taskAuthorization: publicAuthorization(current.task, router, values['export-proof'] === true, Number((await rpc.getBlock({ blockTag: 'latest' })).timestamp)),
    };
    // Public proof is an allowlist. Only an explicitly exported expired task
    // signature is included; payment signatures/tokens/private output never are.
    const proofPath = join(runDirectory, 'client-proof.json');
    const proofTemporary = `${proofPath}.${randomBytes(8).toString('hex')}.tmp`;
    await privateWrite(proofTemporary, canonical(proof));
    await rename(proofTemporary, proofPath);
    console.log(JSON.stringify({ status: 'verified', proof: proofPath, requestId: current.requestId, shard, executionTransactionHash: executed.transactionHash }));
  } finally { await journal.release(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(error => { console.error(error instanceof ClientError ? error.message : 'Task client failed; preserve the journal and check configuration/provider/receipt state. Raw errors are suppressed to protect credentials.'); process.exitCode = 1; });
}
