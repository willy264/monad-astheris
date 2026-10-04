import { createPublicClient, defineChain, getAddress, http, isAddress, isHex, keccak256, toHex, type Address, type Hex } from 'viem';

export class ClientError extends Error {}
export function check(value: unknown, message: string): asserts value {
  if (!value) throw new ClientError(message);
}
export function object(value: unknown): Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected a JSON object');
  return value as Record<string, unknown>;
}
export function address(value: unknown, label = 'address'): Address {
  check(typeof value === 'string' && isAddress(value), `Invalid ${label}`);
  return getAddress(value);
}
export function hash(value: unknown, label = 'hash'): Hex {
  check(typeof value === 'string' && isHex(value) && value.length === 66, `Invalid ${label}`);
  return value.toLowerCase() as Hex;
}
export function uint(value: unknown, label = 'integer', bits = 256): bigint {
  check(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value), `Invalid ${label}`);
  const result = BigInt(value);
  check(result < 2n ** BigInt(bits), `${label} out of range`);
  return result;
}
export function sameAddress(a: unknown, b: unknown): boolean { return address(a) === address(b); }
export function required(name: string): string {
  const value = process.env[name]?.trim();
  check(value, `Set ${name}`);
  return value;
}
export function endpoint(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new ClientError('Invalid endpoint URL'); }
  check(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)), 'Endpoints require HTTPS except localhost');
  check(!url.username && !url.password && !url.search && !url.hash, 'Endpoint credentials, query parameters and fragments are not allowed; use bearer-token settings');
  return url.href;
}

// Deterministic JSON for this client: sorted object keys, JSON number/string encoding,
// preserved array order, UTF-8, no whitespace/newline. Unsupported values fail closed.
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') { check(Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)), 'Unsafe JSON number; encode large integers as strings'); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  check(typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype, 'Unsupported canonical JSON value');
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
}
export const bytesHash = (value: string | Uint8Array): Hex => keccak256(typeof value === 'string' ? toHex(value) : value);
export const zeroHash = `0x${'00'.repeat(32)}` as Hex;
export const chain = defineChain({ id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } } });
export function rpcClient(url: string) {
  return createPublicClient({ chain, transport: http(url, { timeout: 30_000, retryCount: 0 }) });
}
export type Rpc = ReturnType<typeof rpcClient>;

export async function readJsonResponse(response: Response, maxBytes = 1024 * 1024): Promise<unknown> {
  check(response.body, 'Response body missing');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      check(length <= maxBytes, 'Response exceeds size limit');
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ClientError('Invalid JSON response'); }
}
export async function request(url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
  try { return await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(init.signal ? [init.signal] : [])]) }); }
  catch { throw new ClientError('HTTP request failed or timed out; inspect the saved operation state before retrying'); }
}
