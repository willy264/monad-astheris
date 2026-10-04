import { loadEnvFile } from 'node:process';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http, isAddress, type Address, type Hex } from 'viem';
import { monadTestnet } from 'viem/chains';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const manifestPath = resolve(root, 'contracts/deployments/10143.json');
export function loadEnvironment(component?: string) {
  for (const path of [resolve(root, 'scripts/.env'), ...(component ? [resolve(root, component, '.env')] : [])]) {
    if (existsSync(path)) loadEnvFile(path);
  }
}
export function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required; configure it in the local environment file`);
  return value;
}
export function address(value: unknown, label: string): Address {
  if (typeof value !== 'string' || !isAddress(value) || /^0x0{40}$/i.test(value)) throw new Error(`${label} must be a nonzero address`);
  return value;
}
export function hash(value: unknown, label: string): Hex {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} must be a 32-byte hash`);
  return value as Hex;
}
export function key(name: string): Hex { return hash(required(name), name); }
export function json<T = any>(path: string): T { return JSON.parse(readFileSync(path, 'utf8')); }
export function save(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  const descriptor = openSync(temporary, 'w', 0o600);
  try { writeFileSync(descriptor, JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item, 2) + '\n'); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  renameSync(temporary, path);
}
export function reserve(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const descriptor = openSync(path, 'wx', 0o600);
  try { writeFileSync(descriptor, JSON.stringify(value) + '\n'); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
}
export function publicRpc() {
  return createPublicClient({ chain: monadTestnet, transport: http(process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz', { timeout: 20_000, retryCount: 1 }) });
}
export async function checkChain(client: ReturnType<typeof publicRpc>) {
  if (await client.getChainId() !== 10143) throw new Error('Expected Monad Testnet chain 10143');
}
export function liveManifest() {
  if (!existsSync(manifestPath)) throw new Error('No live deployment manifest. Deploy and finalize receipts first.');
  const manifest = json(manifestPath);
  if (manifest.status !== 'live-verified' || manifest.chainId !== 10143) throw new Error('Manifest is not a verified Monad Testnet deployment');
  for (const field of ['identityRegistry', 'reputationRegistry', 'validationRegistry', 'router']) address(manifest[field], field);
  if (!manifest.deployments || Object.keys(manifest.deployments).length !== 4) throw new Error('Manifest must include all four deployment receipts');
  for (const field of ['identityRegistry', 'reputationRegistry', 'validationRegistry', 'router']) {
    const item = manifest.deployments[field];
    if (!item || address(item.address, field).toLowerCase() !== manifest[field].toLowerCase()) throw new Error('Manifest deployment addresses are inconsistent');
    hash(item.transactionHash, `${field} deployment transaction`);
    hash(item.runtimeCodeHash, `${field} runtime hash`);
  }
  return manifest;
}
export async function boundedResponse(response: Response, maximum = 1024 * 1024): Promise<string> {
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Remote service returned HTTP ${response.status}`);
  }
  if (!response.body) throw new Error('Remote service returned an empty body');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > maximum) throw new Error('Remote response exceeded size limit');
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { await reader.cancel().catch(() => {}); }
}
export function safeUrl(value: string, label: string, allowLocal = false): URL {
  const url = new URL(value);
  if (url.username || url.password || (url.protocol !== 'https:' && !(allowLocal && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error(`${label} requires HTTPS (or explicitly allowed localhost HTTP)`);
  return url;
}
export function publishedUrl(value: string, label: string): URL {
  const url = safeUrl(value, label);
  if (url.href.includes('?') || url.href.includes('#')) throw new Error(`${label} must not contain a query string or fragment; use a public URL without credentials`);
  return url;
}
export function main(run: () => Promise<unknown>) {
  run().catch((error: unknown) => {
    // SDK error strings can contain RPC credentials, signed transactions or request bodies.
    const name = error instanceof Error ? error.name : 'Error';
    const message = error instanceof Error && error.name === 'Error' ? error.message : 'Operation failed; inspect configuration and preserved journal. Provider detail is redacted.';
    console.error(`${name}: ${message}`);
    process.exitCode = 1;
  });
}
