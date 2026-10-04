import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeEventLog, encodePacked, keccak256, parseAbi, parseAbiItem, recoverTypedDataAddress, type Hex } from 'viem';
import { boundedResponse, checkChain, hash, json, liveManifest, loadEnvironment, main, manifestPath, publicRpc, root, safeUrl, save } from './ops-common.js';
import { taskId as taskRequestId, taskTypedData, verifyTaskReceipts, type Task } from './lib/task.js';
import { publicAuthorization } from './lib/proof.js';
import { verifyPaymentTransfer } from './lib/settlement.js';
import { blockRoot } from './ops-merkle.js';

const executionAbi = parseAbi(['event TaskExecuted(address indexed shard,uint256 indexed agentId,bytes32 indexed taskId,bytes32 inputHash,bytes32 outputHash,bytes32 proofHash)', 'function merkleBatches(bytes32 batchId) view returns (bytes32 root,uint256 leafCount,uint256 fromBlock,uint256 toBlock)']);
const explorer = 'https://testnet.monadscan.com';
const query = `query Evidence($chain: Int!, $router: String!, $tx: String!, $block: numeric!) {
  TaskExecution(where: {chainId: {_eq: $chain}, router: {_eq: $router}, transactionHash: {_eq: $tx}}, limit: 2) {
    agentId taskId inputHash outputHash proofHash leaf blockNumber blockHash transactionHash logIndex
    shard { address } agent { registry agentId } batch { batchId root leafCount status blockHash }
  }
  BatchCommitment(where: {chainId: {_eq: $chain}, router: {_eq: $router}, fromBlock: {_eq: $block}, toBlock: {_eq: $block}, verified: {_eq: true}}, limit: 5) {
    batchId root leafCount fromBlock toBlock verified transactionHash
  }
}`;

main(async () => {
  loadEnvironment(); const client = publicRpc();
  const checks: { item: string; status: string; detail: string }[] = [];
  const lines = ['# Aetheris submission proof', '', `Evidence generated: ${new Date().toISOString()}. Target: Monad Testnet, chain 10143.`, '', 'This file records observed evidence. Missing credentials, receipts or indexing results remain explicit blockers; local compilation alone does not establish a live submission.', ''];
  let manifest: any; let proof: any; let executionVerified = false; let indexingVerified = false; let agentVerified = false; let verifiedAgentId: string | undefined;
  if (!existsSync(manifestPath)) checks.push({ item: 'Live contracts', status: 'BLOCKED', detail: 'No receipt-verified deployment manifest. Configure a funded contracts/.env deployment account and run pnpm run deploy --broadcast from scripts.' });
  else {
    try {
      manifest = liveManifest(); await checkChain(client);
      for (const [name, item] of Object.entries<any>(manifest.deployments)) {
        const receipt = await client.getTransactionReceipt({ hash: hash(item.transactionHash, 'deployment transaction') });
        const block = await client.getBlock({ blockNumber: receipt.blockNumber });
        const code = await client.getCode({ address: item.address });
        if (receipt.status !== 'success' || receipt.contractAddress?.toLowerCase() !== item.address.toLowerCase() || receipt.blockHash !== block.hash || !code || keccak256(code) !== item.runtimeCodeHash) throw new Error('Deployment evidence does not match live state');
        lines.push(`- ${name}: [${item.address}](${explorer}/address/${item.address}) — [deployment transaction](${explorer}/tx/${receipt.transactionHash}).`);
      }
      checks.push({ item: 'Live contracts', status: 'VERIFIED', detail: 'Four deployment receipts, runtime code hashes and canonical blocks rechecked; compiler/linkage evidence is in contracts/deployments/10143.json.' });
    } catch { manifest = undefined; checks.push({ item: 'Live contracts', status: 'UNVERIFIED', detail: 'Manifest exists but live receipt/code verification failed. Resolve RPC or deployment mismatch before submission.' }); }
  }
  const agentPath = resolve(root, 'contracts/deployments/10143.agent.json');
  if (manifest && existsSync(agentPath)) {
    try {
      const agent = json(agentPath); const abi = parseAbi(['function ownerOf(uint256) view returns (address)', 'function tokenURI(uint256) view returns (string)', 'event Registered(uint256 indexed agentId,string agentURI,address indexed owner)']);
      if (agent.identityRegistry.toLowerCase() !== manifest.identityRegistry.toLowerCase()) throw new Error('Registry differs');
      const [owner, uri, receipt] = await Promise.all([client.readContract({ address: manifest.identityRegistry, abi, functionName: 'ownerOf', args: [BigInt(agent.agentId)] }), client.readContract({ address: manifest.identityRegistry, abi, functionName: 'tokenURI', args: [BigInt(agent.agentId)] }), client.getTransactionReceipt({ hash: hash(agent.transactionHash, 'registration') })]);
      if (owner.toLowerCase() !== agent.owner.toLowerCase() || uri !== agent.agentURI || receipt.status !== 'success') throw new Error('Registration state differs');
      if ((await client.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash || receipt.blockHash !== agent.blockHash) throw new Error('Registration receipt is not canonical');
      const registrations = receipt.logs.filter(log => log.address.toLowerCase() === manifest.identityRegistry.toLowerCase()).flatMap(log => {
        try { return [decodeEventLog({ abi, eventName: 'Registered', topics: log.topics, data: log.data, strict: true }).args]; } catch { return []; }
      });
      if (!registrations.some(event => event.agentId.toString() === agent.agentId && event.owner.toLowerCase() === owner.toLowerCase() && event.agentURI === uri)) throw new Error('Receipt does not register this agent');
      agentVerified = true; verifiedAgentId = agent.agentId;
      lines.push('', `Agent **${agent.agentId}**: ${uri}; [registration](${explorer}/tx/${agent.transactionHash}).`);
      checks.push({ item: 'Agent registration', status: 'VERIFIED', detail: 'Owner, URI and successful registration receipt checked against the configured registry.' });
    } catch { checks.push({ item: 'Agent registration', status: 'UNVERIFIED', detail: 'Saved agent evidence did not verify against live registry state.' }); }
  } else checks.push({ item: 'Agent registration', status: 'BLOCKED', detail: 'Needs actual MCP endpoint/card, public IPFS pin, funded owner and registration receipt.' });
  if (manifest && process.env.TASK_PROOF_PATH) {
    try {
      proof = json(resolve(process.env.TASK_PROOF_PATH));
      if (!agentVerified || proof.agentId !== verifiedAgentId || proof.chainId !== 10143 || proof.router.toLowerCase() !== manifest.router.toLowerCase() || proof.identityRegistry.toLowerCase() !== manifest.identityRegistry.toLowerCase()) throw new Error('Task belongs to a different deployment or an unverified agent');
      const receipt = await client.getTransactionReceipt({ hash: hash(proof.executionTransactionHash, 'task transaction') });
      const block = await client.getBlock({ blockNumber: receipt.blockNumber });
      if (receipt.status !== 'success' || block.hash !== receipt.blockHash || receipt.blockHash !== proof.executionBlockHash || receipt.blockNumber.toString() !== proof.executionBlockNumber) throw new Error('Task receipt is not successful and canonical');
      const events = receipt.logs.filter(log => log.address.toLowerCase() === manifest.router.toLowerCase()).flatMap(log => {
        try { const parsed = decodeEventLog({ abi: executionAbi, topics: log.topics, data: log.data, strict: true }); return parsed.eventName === 'TaskExecuted' ? [parsed.args] : []; } catch { return []; }
      });
      const event = events.find(item => item.shard.toLowerCase() === proof.shard.toLowerCase());
      if (!event || event.agentId.toString() !== proof.agentId || event.taskId !== proof.taskId || event.inputHash !== proof.inputHash || event.outputHash !== proof.outputHash || event.proofHash !== proof.proofHash) throw new Error('Execution event differs from signed task proof');
      const salt = keccak256(encodePacked(['uint256', 'bytes32', 'uint256'], [BigInt(proof.agentId), hash(proof.taskId, 'taskId'), BigInt(proof.sequenceNonce)]));
      if (salt !== proof.salt) throw new Error('Task salt mismatch');
      const authorization = proof.taskAuthorization;
      const task: Task = { ...authorization.message, deadline: Number(authorization.message.deadline), authorization: authorization.signature || '0x' };
      if (taskRequestId(task, manifest.router) !== proof.requestId || task.agentId !== proof.agentId || task.taskId !== proof.taskId || task.sequenceNonce !== proof.sequenceNonce || task.inputHash !== proof.inputHash || task.outputHash !== proof.outputHash || task.proofHash !== proof.proofHash || task.executor.toLowerCase() !== proof.executor.toLowerCase()) throw new Error('Typed task does not match proof');
      const created = await client.getTransactionReceipt({ hash: hash(proof.createTransactionHash, 'shard creation transaction') });
      if ((await client.getBlock({ blockNumber: created.blockNumber })).hash !== created.blockHash) throw new Error('Shard creation receipt is not canonical');
      verifyTaskReceipts(task, manifest.router, proof.shard, created, receipt);
      if (authorization.signature && (task.deadline >= Math.floor(Date.now() / 1000) || BigInt(task.deadline) >= (await client.getBlock({ blockTag: 'latest' })).timestamp || (await recoverTypedDataAddress({ ...taskTypedData(task, manifest.router), signature: authorization.signature })).toLowerCase() !== proof.signer.toLowerCase())) throw new Error('Exported task signature is active or invalid');
      const paymentReceipt = await client.getTransactionReceipt({ hash: hash(proof.payment.transactionHash, 'payment transaction') });
      if (paymentReceipt.status !== 'success' || (await client.getBlock({ blockNumber: paymentReceipt.blockNumber })).hash !== paymentReceipt.blockHash) throw new Error('Payment receipt is not canonical');
      verifyPaymentTransfer(paymentReceipt, proof.payment.asset, proof.signer, proof.payment.receiver, BigInt(proof.payment.amount), hash(proof.payment.authorizationNonce, 'payment authorization nonce'));
      executionVerified = true;
      lines.push('', '## Task evidence', '', `Request ID: ${proof.requestId}.`, '', `[TaskExecuted receipt](${explorer}/tx/${receipt.transactionHash}) · [isolated shard](${explorer}/address/${proof.shard}) · [payment transfer](${explorer}/tx/${paymentReceipt.transactionHash})`, '', '```json', JSON.stringify(publicAuthorization(task, manifest.router, Boolean(authorization.signature)), null, 2), '```', '', 'Payment credentials and active task signatures are excluded. The client can export a sample task signature after its deadline has expired. Preserve private input/output bytes separately to reproduce their hashes.');
      checks.push({ item: 'Task execution', status: 'VERIFIED', detail: 'Successful canonical TaskExecuted event and all task commitments match the client proof.' });
      checks.push({ item: 'Sample EIP-712 signature', status: authorization.signature ? 'VERIFIED' : 'NOT EXPORTED', detail: authorization.signature ? 'Expired signature recovers the recorded signer and matches the request ID.' : 'Run submit-task --resume --export-proof after the task deadline, then regenerate this document.' });
      // Settlement verification is performed by the client, and recorded separately from on-chain output success.
      checks.push({ item: 'Payment', status: 'VERIFIED', detail: 'Canonical successful token receipt contains the expected payer, receiver, asset and transferred amount.' });
      checks.push({ item: 'Reputation and feedback', status: 'CLIENT EVIDENCE', detail: 'Inspect the client-proof reputation and reviewer receipt records; a successful task alone is not a quality rating.' });
    } catch { proof = undefined; executionVerified = false; checks.push({ item: 'Task execution', status: 'UNVERIFIED', detail: 'Task proof failed receipt, deployment, event, typed-signature, payment or salt verification.' }); }
  } else checks.push({ item: 'Task execution', status: 'BLOCKED', detail: 'Configure an authorized funded client/payment provider, run submit-task and set TASK_PROOF_PATH to its client-proof.json.' });
  if (manifest && executionVerified && process.env.ENVIO_GRAPHQL_URL) {
    try {
      const endpoint = safeUrl(process.env.ENVIO_GRAPHQL_URL, 'GraphQL', true);
      const variables = { chain: 10143, router: manifest.router.toLowerCase(), tx: proof.executionTransactionHash.toLowerCase(), block: proof.executionBlockNumber };
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.ENVIO_GRAPHQL_ADMIN_SECRET ? { 'x-hasura-admin-secret': process.env.ENVIO_GRAPHQL_ADMIN_SECRET } : {}) }, body: JSON.stringify({ query, variables }), redirect: 'error', signal: AbortSignal.timeout(20_000) });
      const result = JSON.parse(await boundedResponse(response));
      if (result.errors || result.data?.TaskExecution?.length !== 1) throw new Error('Expected one indexed execution');
      const task = result.data.TaskExecution[0];
      if (task.shard.address.toLowerCase() !== proof.shard.toLowerCase() || task.agent.registry.toLowerCase() !== manifest.identityRegistry.toLowerCase() || task.agentId !== proof.agentId || task.taskId !== proof.taskId || task.outputHash !== proof.outputHash || task.inputHash !== proof.inputHash || task.proofHash !== proof.proofHash || task.blockHash !== proof.executionBlockHash) throw new Error('Indexed task differs from canonical chain execution');
      const leaf = keccak256(keccak256(encodePacked(['uint256','address','address','uint256','bytes32','bytes32','bytes32','bytes32'], [10143n, manifest.router, proof.shard, BigInt(proof.agentId), proof.taskId, proof.inputHash, proof.outputHash, proof.proofHash])));
      if (task.leaf !== leaf) throw new Error('Indexed task leaf differs');
      const batchId = keccak256(encodePacked(['uint256','address','uint256','bytes32'], [10143n, manifest.router, BigInt(proof.executionBlockNumber), proof.executionBlockHash]));
      const commitment = result.data.BatchCommitment?.find((item: any) => item.batchId === batchId && item.verified === true && item.root === task.batch.root && String(item.leafCount) === String(task.batch.leafCount));
      if (!commitment) throw new Error('No independently verified indexed commitment for this task block');
      const batch = await client.readContract({ address: manifest.router, abi: executionAbi, functionName: 'merkleBatches', args: [batchId] });
      if (batch[0] !== commitment.root || batch[1].toString() !== String(commitment.leafCount) || batch[2].toString() !== proof.executionBlockNumber || batch[3] !== batch[2]) throw new Error('Indexed root differs from router batch');
      const event = parseAbiItem('event TaskExecuted(address indexed shard,uint256 indexed agentId,bytes32 indexed taskId,bytes32 inputHash,bytes32 outputHash,bytes32 proofHash)');
      const logs = await client.getLogs({ address: manifest.router, event, strict: true, blockHash: proof.executionBlockHash });
      logs.sort((left, right) => Number(left.logIndex) - Number(right.logIndex));
      const leaves = logs.map(log => keccak256(keccak256(encodePacked(['uint256','address','address','uint256','bytes32','bytes32','bytes32','bytes32'], [10143n, manifest.router, log.args.shard, log.args.agentId, log.args.taskId, log.args.inputHash, log.args.outputHash, log.args.proofHash]))));
      if (BigInt(leaves.length) !== batch[1] || blockRoot(leaves) !== batch[0] || !leaves.includes(leaf)) throw new Error('Canonical block logs do not reconstruct the committed root');
      if ((await client.getBlock({ blockNumber: BigInt(proof.executionBlockNumber) })).hash !== proof.executionBlockHash) throw new Error('Execution block changed during proof collection');
      mkdirSync(resolve(root, 'submission'), { recursive: true });
      save(resolve(root, 'submission/indexer-evidence.json'), { observedAt: new Date().toISOString(), query, variables, data: result.data });
      lines.push('', '## Indexed execution and batch', '', 'The query below was executed against the configured Envio endpoint; its returned task and commitment matched live chain data.', '', '```graphql', query, '```', '', '```json', JSON.stringify(result.data, null, 2), '```');
      indexingVerified = true;
      checks.push({ item: 'Envio and Merkle batch', status: 'VERIFIED', detail: 'Indexed identity/shard/task and a verified batch root match the canonical execution and router commitment.' });
    } catch { checks.push({ item: 'Envio and Merkle batch', status: 'UNVERIFIED', detail: 'GraphQL unavailable, task not yet indexed or indexed task/commitment does not match the chain.' }); }
  } else checks.push({ item: 'Envio and Merkle batch', status: 'BLOCKED', detail: 'Needs a hosted GraphQL URL, verified task and finalized committed block.' });
  checks.push({ item: 'Dynamic / Mera / CRE', status: 'LIVE CHECK REQUIRED', detail: 'Local modules/tests do not establish a successful user passkey ceremony or a production CRE workflow delivery.' });
  checks.push({ item: 'Reviewer access', status: 'PUBLIC REPOSITORY', detail: 'https://github.com/willy264/monad-astheris is public (checked 2026-10-03). No invitation sent; an email alone is not a GitHub collaborator identity.' });
  lines.push('', '## Evidence status', '', '| Item | Status | Detail |', '| --- | --- | --- |', ...checks.map(check => `| ${check.item} | ${check.status} | ${check.detail} |`), '', `Live core path: **${manifest && agentVerified && executionVerified && indexingVerified ? 'evidence collected; review payment/provider and sponsor-specific checks above' : 'incomplete — resolve the blockers above before claiming submission readiness'}**.`, '', 'Local test/build results are recorded in [VERIFICATION.md](../VERIFICATION.md). Sponsor eligibility, prize amounts, organizer deadlines and required submission format have not been independently established by this evidence generator.', '');
  lines.push('Curated registration, MCP and submission evidence: [SUBMISSION_PROOF.md](../SUBMISSION_PROOF.md). This generated report does not replace that record.', '');
  mkdirSync(resolve(root, 'submission'), { recursive: true });
  writeFileSync(resolve(root, 'submission/LIVE_CHECKS.md'), lines.join('\n'));
  console.log('Wrote submission/LIVE_CHECKS.md with observed evidence and explicit blockers; curated SUBMISSION_PROOF.md preserved.');
});
