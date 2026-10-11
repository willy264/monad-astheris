import 'server-only';
import { recoverTypedDataAddress } from 'viem';
import { contracts } from './contracts';
import { boundedJson, ensure, same } from './demo-protocol';
import { accessSessionData, parseAccessConfig, parseAccessEnvelope, parseAccessResponse, type AccessConfig } from './access-protocol';
import { userErrorMessage } from './user-error';

export class AccessServiceError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}
export function accessOrigin(raw = process.env.DAEMON_URL): URL {
  ensure(raw, 'The access request service is not configured.'); const url = new URL(raw);
  ensure(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)), 'The access request service requires HTTPS.');
  ensure(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'The access service address must be an origin.');
  return url;
}
async function upstream(path: string, body?: unknown) {
  const response = await fetch(new URL(path, accessOrigin()), { method: body ? 'POST' : 'GET',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(body ? 25000 : 12000) });
  const raw = await boundedJson(response, 512 * 1024);
  if (!response.ok) {
    const message = raw && typeof raw === 'object' && 'error' in raw && typeof raw.error === 'string'
      ? userErrorMessage(new Error(raw.error), 'The access service could not complete this request.') : 'The access service could not complete this request.';
    throw new AccessServiceError(response.status === 404 ? 'Access requests are not available yet. The task service needs the access inbox update.' : message, [400, 401, 403, 409, 429].includes(response.status) ? response.status : 503);
  }
  return raw;
}
export async function accessConfig(): Promise<AccessConfig> {
  const config = parseAccessConfig(await upstream('/v1/access-requests/config'));
  ensure(contracts.router && contracts.identity && same(config.router, contracts.router) && same(config.identity, contracts.identity), 'The dashboard and access service use different contracts.');
  return config;
}
export async function accessAction(request: Request) {
  ensure(request.headers.get('origin') === new URL(request.url).origin && [null, 'same-origin'].includes(request.headers.get('sec-fetch-site')), 'Submit access requests from this dashboard.');
  ensure(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'application/json', 'Send JSON access details.');
  const envelope = parseAccessEnvelope(await boundedJson(new Response(request.body), 8192));
  const config = await accessConfig();
  const signer = await recoverTypedDataAddress({ ...accessSessionData(config, envelope.auth.wallet, envelope.auth.expiresAt), signature: envelope.auth.signature });
  ensure(same(signer, envelope.auth.wallet), 'This inbox session belongs to another wallet.');
  return parseAccessResponse(await upstream('/v1/access-requests', envelope), envelope.auth.wallet);
}
