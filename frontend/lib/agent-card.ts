const DEFAULT_GATEWAY = 'https://ipfs.io/ipfs/';
const FALLBACK_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';
const MAX_BYTES = 256 * 1024;
const TOTAL_TIMEOUT_MS = 12_000;
const PRIMARY_TIMEOUT_MS = 2_000;

export type AgentCard = {
  name?: string;
  description?: string;
  services?: { name?: string; endpoint?: string; skills?: string[] }[];
  capabilities?: string[];
};

type Options = {
  gateway?: string;
  fetch?: typeof fetch;
  // Tests can shorten deadlines; callers cannot increase the production bounds.
  totalTimeoutMs?: number;
  primaryTimeoutMs?: number;
};

class TransientGatewayError extends Error {}

function timeout(value: number | undefined, maximum: number): number {
  if (value === undefined) return maximum;
  if (!Number.isInteger(value) || value <= 0 || value > maximum) throw new Error('Invalid Agent Card timeout.');
  return value;
}

async function readCard(url: URL, signal: AbortSignal, request: typeof fetch): Promise<AgentCard> {
  let response: Response;
  try { response = await request(url, { signal, redirect: 'error', cache: 'no-store' }); }
  catch { throw new TransientGatewayError('IPFS gateway request failed.'); }
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    const message = `IPFS gateway returned ${response.status}.`;
    if (response.status === 429 || (response.status >= 500 && response.status < 600)) throw new TransientGatewayError(message);
    throw new Error(message);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Agent Card is empty.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try { chunk = await reader.read(); }
      catch { throw new TransientGatewayError('IPFS gateway response was interrupted.'); }
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > MAX_BYTES) throw new Error('Agent Card exceeds 256 KiB.');
      chunks.push(chunk.value);
    }
  } finally { void reader.cancel().catch(() => {}); }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  const value: unknown = JSON.parse(new TextDecoder().decode(body));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Agent Card is not an object.');
  return value;
}

async function attempt(url: URL, duration: number, request: typeof fetch): Promise<AgentCard> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TransientGatewayError('Agent Card request timed out.'));
      controller.abort();
    }, duration);
  });
  try { return await Promise.race([readCard(url, controller.signal, request), deadline]); }
  finally { clearTimeout(timer); controller.abort(); }
}

// NFT owners control only an immutable IPFS path, never the gateway or request origin.
// A custom operator gateway stays exclusive; the default has one fixed public fallback.
export async function agentCard(uri: string, options: Options = {}): Promise<AgentCard> {
  const match = /^ipfs:\/\/(?:ipfs\/)?([a-zA-Z0-9]+)(\/[a-zA-Z0-9_.\/-]*)?$/.exec(uri);
  if (!match || (match[2] || '').split('/').some(segment => segment === '..' || segment === '.')) throw new Error('Agent Card requires an ipfs:// URI.');
  const gateway = new URL(options.gateway || DEFAULT_GATEWAY);
  if (gateway.protocol !== 'https:' || gateway.username || gateway.password || gateway.href.includes('?') || gateway.href.includes('#')) throw new Error('IPFS gateway requires HTTPS without user information, a query or a fragment.');
  const base = `${gateway.href.replace(/\/$/, '')}/`;
  const gateways = base === DEFAULT_GATEWAY ? [base, FALLBACK_GATEWAY] : [base];
  const totalTimeout = timeout(options.totalTimeoutMs, TOTAL_TIMEOUT_MS);
  const primaryTimeout = timeout(options.primaryTimeoutMs, PRIMARY_TIMEOUT_MS);
  const expires = Date.now() + totalTimeout;
  const request = options.fetch || fetch;
  for (let index = 0; index < gateways.length; index++) {
    const remaining = expires - Date.now();
    if (remaining <= 0) throw new TransientGatewayError('Agent Card request timed out.');
    const duration = gateways.length > 1 && index === 0 ? Math.min(primaryTimeout, remaining) : remaining;
    try { return await attempt(new URL(`${gateways[index]}${match[1]}${match[2] || ''}`), duration, request); }
    catch (error) {
      if (!(error instanceof TransientGatewayError) || index === gateways.length - 1) throw error;
    }
  }
  throw new Error('Agent Card unavailable.');
}
