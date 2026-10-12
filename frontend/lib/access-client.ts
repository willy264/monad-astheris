import { type Address, type Hex } from 'viem';
import { boundedJson, ensure, hash, object, same } from './demo-protocol';
import { parseAccessConfig, parseAccessResponse, type AccessAction, type AccessAuth, type AccessConfig } from './access-protocol';
import { userErrorMessage } from './user-error';

export class AccessHttpError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function checkedResponse(response: Response) {
  const raw = await boundedJson(response, 512 * 1024);
  if (!response.ok) {
    const value = object(raw);
    throw new AccessHttpError(userErrorMessage(new Error(typeof value.error === 'string' ? value.error : ''), 'The access service could not complete this request.'), response.status);
  }
  return raw;
}
export async function fetchAccessConfig(signal?: AbortSignal) {
  return parseAccessConfig(await checkedResponse(await fetch('/api/access-requests/config', {
    method: 'GET', cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
  })));
}
export async function sendAccessAction(auth: AccessAuth, action: AccessAction, payload: Record<string, unknown>, signal?: AbortSignal) {
  const raw = await checkedResponse(await fetch('/api/access-requests', { method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auth, action, payload }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
  }));
  return parseAccessResponse(raw, auth.wallet);
}

export interface ApprovalJournal { id: Hex; transactionHash?: Hex; }
function journalKey(config: AccessConfig, wallet: string, id: string) { return `aetheris:access-approval:v1:${config.router.toLowerCase()}:${wallet.toLowerCase()}:${id.toLowerCase()}`; }
/** Public recovery hints only. An inbox signature is never written to browser storage. */
export function saveApproval(config: AccessConfig, wallet: string, journal: ApprovalJournal) {
  ensure(typeof localStorage !== 'undefined', 'Browser storage is required to recover approval transactions safely.');
  const key = journalKey(config, wallet, journal.id);
  const encoded = JSON.stringify({ id: hash(journal.id), ...(journal.transactionHash ? { transactionHash: hash(journal.transactionHash) } : {}) });
  localStorage.setItem(key, encoded);
  ensure(localStorage.getItem(key) === encoded, 'The approval recovery record could not be saved. Check browser storage before approving.');
}
export function readApproval(config: AccessConfig, wallet: string, id: Hex): ApprovalJournal | undefined {
  const raw = localStorage.getItem(journalKey(config, wallet, id)); if (!raw) return;
  ensure(raw.length < 1024, 'The saved approval is invalid. Recover it using its transaction hash.');
  const value = object(JSON.parse(raw)); ensure(same(hash(value.id), id), 'The saved approval belongs to another request.');
  return { id, ...(value.transactionHash == null ? {} : { transactionHash: hash(value.transactionHash) }) };
}
export function clearApproval(config: AccessConfig, wallet: Address, id: Hex) { localStorage.removeItem(journalKey(config, wallet, id)); }

const locks = new Set<string>();
/** Serialize approvals across tabs; browsers without exclusion must fail closed. */
export async function withApprovalLock<T>(wallet: string, action: () => Promise<T>): Promise<T> {
  const name = `aetheris:access-approval:${wallet.toLowerCase()}`;
  ensure(!locks.has(name), 'An approval is already in progress for this wallet.'); locks.add(name);
  try {
    if (typeof navigator !== 'undefined' && navigator.locks) return await navigator.locks.request(name, { ifAvailable: true }, async lock => {
      ensure(lock, 'An approval is already in progress in another tab.'); return action();
    });
    ensure(typeof window === 'undefined', 'This browser cannot safely coordinate approvals across tabs. Use a current browser over HTTPS.');
    return await action();
  } finally { locks.delete(name); }
}

export function isWalletRejection(cause: unknown): boolean {
  let current = cause; const visited = new Set<unknown>();
  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current); const value = current as { code?: unknown; name?: unknown; cause?: unknown };
    if (value.code === 4001 || value.code === '4001' || value.name === 'UserRejectedRequestError') return true;
    current = value.cause;
  }
  return false;
}
