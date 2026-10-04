import 'server-only';
import { recoverTypedDataAddress, type Hex } from 'viem';
import { contracts } from './contracts';
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
export async function demoConfig(): Promise<DemoConfig> {
  ensure(contracts.router && contracts.identity, 'The live demo is awaiting its Monad contract deployment.');
  const policy = { resource: process.env.DEMO_TASK_RESOURCE, asset: process.env.DEMO_PAYMENT_ASSET, receiver: process.env.DEMO_PAYMENT_RECEIVER,
    maxAmount: process.env.DEMO_PAYMENT_MAX_AMOUNT, name: process.env.DEMO_PAYMENT_ASSET_NAME, version: process.env.DEMO_PAYMENT_ASSET_VERSION };
  ensure(process.env.DEMO_AGENT_ID && Object.values(policy).every(value => Boolean(value)), 'The live demo is awaiting its agent and payment configuration.');
  const response = await daemonRequest('/v1/config'); ensure(response.ok, 'The task service is temporarily unavailable.'); const remote = object(await boundedJson(response));
  ensure(remote.chainId === 10143 && address(remote.router).toLowerCase() === contracts.router.toLowerCase(), 'The task service and dashboard use different deployments.');
  const authorization = object(remote.taskAuthorization); ensure(authorization.name === 'AetherisTask' && authorization.version === '1', 'The task service uses an unsupported authorization.');
  return parseConfig({ enabled: true, chainId: 10143, router: contracts.router, identity: contracts.identity, agentId: process.env.DEMO_AGENT_ID, relayers: remote.relayers, policy, challenge: remote.payment });
}
export async function submitDemo(request: Request): Promise<{ status: number; body: unknown }> {
  assertDemoOrigin(request);
  const body = object(await boundedJson(new Response(request.body), 8192)); const task = parseTask(body);
  ensure(Object.keys(body).every(key => ['agentId', 'taskId', 'sequenceNonce', 'inputHash', 'outputHash', 'proofHash', 'executor', 'deadline', 'authorization'].includes(key)), 'Unexpected task fields.');
  ensure(typeof body.authorization === 'string' && /^0x[0-9a-fA-F]{130}$/.test(body.authorization), 'A wallet task signature is required.');
  const config = await demoConfig(); ensure(task.agentId === config.agentId && config.relayers.some(relayer => relayer.toLowerCase() === task.executor.toLowerCase()), 'This task does not match the configured demo agent.');
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
  // The daemon independently recovers both signatures and enforces current delegation before any charge.
  const response = await daemonRequest('/v1/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json', 'PAYMENT-SIGNATURE': header }, body: JSON.stringify({ ...task, authorization: body.authorization }) });
  const remote = await boundedJson(response);
  if ([200, 202, 502].includes(response.status) && object(remote).requestId) return { status: response.status, body: parseJob(remote) };
  return { status: response.status >= 400 && response.status <= 599 ? response.status : 502, body: { error: 'The task service did not confirm acceptance. Check the saved request status before making another payment.' } };
}
