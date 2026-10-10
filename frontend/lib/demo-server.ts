import 'server-only';
import { createPublicClient, http, recoverTypedDataAddress, type Address, type Hex } from 'viem';
import { contracts, identityAbi, monadTestnet, routerAbi } from './contracts';
import { address, assertDemoOrigin, boundedJson, ensure, hash, object, parseConfig, parseJob, parseTask, paymentTypes, same, taskTypedData, uint, validatePayment, type DemoConfig } from './demo-protocol';

export function upstreamBase(): URL {
  ensure(process.env.DEMO_ENABLED === 'true', 'The live demo is awaiting operator setup. Explore the preview while testnet services are connected.');
  const raw = process.env.DAEMON_URL; ensure(raw, 'The live demo is awaiting its task service.'); const url = new URL(raw);
  ensure(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)), 'The task service needs a secure connection.');
  ensure(!url.username && !url.password && !url.search && !url.hash && (url.pathname === '/' || url.pathname === ''), 'The task service address must be an origin.');
  return url;
}
export async function daemonRequest(path: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(new URL(path, upstreamBase()), { ...options, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(options?.method === 'POST' ? 25000 : 10000) });
  return response;
}
export function requestedDemoAgent(request: Request): string | undefined {
  const query = new URL(request.url).searchParams;
  ensure([...query.keys()].every(key => key === 'agentId') && query.getAll('agentId').length <= 1, 'Only one agentId query parameter is supported.');
  const value = query.get('agentId');
  if (value === null) return undefined;
  ensure(uint(value) > 0n, 'Agent ID must be a positive uint256.');
  return value;
}
export async function demoConfig(requestedAgentId?: string): Promise<DemoConfig> {
  ensure(contracts.router && contracts.identity, 'The live demo is awaiting its Monad contract deployment.');
  const policy = { resource: process.env.DEMO_TASK_RESOURCE, asset: process.env.DEMO_PAYMENT_ASSET, receiver: process.env.DEMO_PAYMENT_RECEIVER,
    maxAmount: process.env.DEMO_PAYMENT_MAX_AMOUNT, name: process.env.DEMO_PAYMENT_ASSET_NAME, version: process.env.DEMO_PAYMENT_ASSET_VERSION };
  ensure(Object.values(policy).every(value => Boolean(value)), 'The live demo is awaiting its payment configuration.');
  const agentId = requestedAgentId ?? (process.env.DEMO_AGENT_ID || '1');
  ensure(uint(agentId) > 0n, 'Agent ID must be positive.');
  const response = await daemonRequest('/v1/config'); ensure(response.ok, 'The task service is temporarily unavailable.'); const remote = object(await boundedJson(response));
  ensure(remote.chainId === 10143 && address(remote.router).toLowerCase() === contracts.router.toLowerCase(), 'The task service and dashboard use different deployments.');
  const authorization = object(remote.taskAuthorization); ensure(authorization.name === 'AetherisTask' && authorization.version === '1', 'The task service uses an unsupported authorization.');
  return parseConfig({ enabled: true, chainId: 10143, router: contracts.router, identity: contracts.identity, agentId, relayers: remote.relayers, policy, challenge: remote.payment });
}

async function authorizeTask(config: DemoConfig, signer: Address): Promise<void> {
  ensure(!config.relayers.some(relayer => same(relayer, signer)), 'A daemon executor cannot also be the task payer.');
  // Use only server configuration for this permission decision. No authorization
  // result is cached between submissions; the daemon rechecks before charging.
  const rpc = createPublicClient({ chain: monadTestnet, cacheTime: 0, transport: http(process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz', {
    timeout: 8000, retryCount: 0, fetchOptions: { cache: 'no-store', redirect: 'error' },
  }) });
  ensure(await rpc.getChainId() === 10143, 'The permission RPC is not Monad Testnet.');
  const blockNumber = await rpc.getBlockNumber({ cacheTime: 0 });
  const agentId = uint(config.agentId);
  const [identity, owner, authorized, ...executors] = await Promise.all([
    rpc.readContract({ address: config.router, abi: routerAbi, functionName: 'identityRegistry', blockNumber }),
    rpc.readContract({ address: config.identity, abi: identityAbi, functionName: 'ownerOf', args: [agentId], blockNumber }),
    rpc.readContract({ address: config.router, abi: routerAbi, functionName: 'isAuthorized', args: [agentId, signer], blockNumber }),
    ...[...new Set(config.relayers)].map(executor => rpc.readContract({ address: config.router, abi: routerAbi, functionName: 'isAuthorized', args: [agentId, executor], blockNumber })),
  ]);
  ensure(same(identity, config.identity), 'The router belongs to a different identity registry.');
  address(owner); // A missing or malformed owner cannot establish registration.
  ensure(authorized === true, 'The task signer is not the selected agent owner or an active delegate.');
  ensure(executors.every(value => value === true), 'The selected agent must authorize every configured executor.');
}
export async function submitDemo(request: Request): Promise<{ status: number; body: unknown }> {
  assertDemoOrigin(request);
  const body = object(await boundedJson(new Response(request.body), 8192)); const task = parseTask(body);
  ensure(Object.keys(body).every(key => ['agentId', 'taskId', 'sequenceNonce', 'inputHash', 'outputHash', 'proofHash', 'executor', 'deadline', 'authorization'].includes(key)), 'Unexpected task fields.');
  ensure(typeof body.authorization === 'string' && /^0x[0-9a-fA-F]{130}$/.test(body.authorization), 'A wallet task signature is required.');
  const config = await demoConfig(task.agentId); ensure(config.relayers.some(relayer => same(relayer, task.executor)), 'This task must use a configured executor.');
  const now = Math.floor(Date.now() / 1000); ensure(task.deadline >= now && task.deadline <= now + 600, 'The task authorization has expired.');
  const header = request.headers.get('payment-signature'); ensure(header && header.length <= 16384 && /^[A-Za-z0-9+/]+={0,2}$/.test(header), 'A signed payment is required.');
  const payment = object(JSON.parse(Buffer.from(header, 'base64').toString('utf8')));
  const accepted = validatePayment({ x402Version: payment.x402Version, resource: payment.resource, accepts: [payment.accepted] }, config.policy);
  const payload = object(payment.payload); const authorization = object(payload.authorization);
  ensure(typeof payload.signature === 'string' && /^0x[0-9a-fA-F]{130}$/.test(payload.signature), 'Invalid payment signature.');
  ensure(authorization.value === accepted.amount && authorization.validAfter === '0' && uint(authorization.validBefore) > BigInt(now)
    && uint(authorization.validBefore) <= BigInt(now + accepted.maxTimeoutSeconds) && address(authorization.to).toLowerCase() === config.policy.receiver.toLowerCase(), 'The payment authorization differs from the configured policy.');
  const payer = address(authorization.from); const nonce = hash(authorization.nonce);
  const [taskSigner, paymentSigner] = await Promise.all([
    recoverTypedDataAddress({ ...taskTypedData(task, config.router), signature: body.authorization as Hex }),
    recoverTypedDataAddress({ domain: { name: config.policy.name, version: config.policy.version, chainId: 10143, verifyingContract: config.policy.asset }, types: paymentTypes, primaryType: 'TransferWithAuthorization',
      message: { from: payer, to: config.policy.receiver, value: uint(accepted.amount), validAfter: 0n, validBefore: uint(authorization.validBefore), nonce }, signature: payload.signature as Hex }),
  ]);
  ensure(same(taskSigner, payer) && same(paymentSigner, payer), 'Task and payment must be signed by the same wallet.');
  await authorizeTask(config, taskSigner);
  // Forward exactly once after permission checks. The daemon independently
  // recovers both signatures and enforces current delegation before any charge.
  const response = await daemonRequest('/v1/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json', 'PAYMENT-SIGNATURE': header }, body: JSON.stringify({ ...task, authorization: body.authorization }) });
  const remote = await boundedJson(response);
  if ([200, 202, 502].includes(response.status) && object(remote).requestId) return { status: response.status, body: parseJob(remote) };
  return { status: response.status >= 400 && response.status <= 599 ? response.status : 502, body: { error: 'The task service did not confirm acceptance. Check the saved request status before making another payment.' } };
}
