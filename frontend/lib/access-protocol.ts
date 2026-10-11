import { type Address, type Hex } from 'viem';
import { address, ensure, hash, object, same, uint } from './demo-protocol';

export const accessPurpose = 'Manage agent access requests and notifications';
export const accessDurations = [3600, 21600, 86400, 604800] as const;
export interface AccessConfig { chainId: 10143; router: Address; identity: Address; relayers: Address[]; sessionTtlSeconds: number; }
export interface AccessAuth { wallet: Address; expiresAt: number; signature: Hex; }
export interface AccessRequest {
  id: Hex; agentId: string; owner: Address; requester: Address; durationSeconds: number;
  reason: string; createdAt: number; requestExpiresAt: number;
  status: 'pending' | 'approving' | 'approved' | 'denied' | 'expired' | 'invalidated';
  decisionAt?: number; decisionNote?: string; transactionHash?: Hex; grantExpiresAt?: number;
  unread: boolean; revision: number; currentAuthority?: boolean; approvalError?: string;
}
export interface AccessApproval { id: Hex; expiresAt: number; deadline: number; ownershipEpoch: string; relayed: boolean; }
export interface AccessResponse { requests: AccessRequest[]; approval?: AccessApproval; nextCursor?: string; }
export type AccessAction = 'list' | 'request' | 'prepare' | 'grant' | 'approve' | 'deny' | 'seen' | 'cancel';

function seconds(raw: unknown): number {
  ensure(Number.isSafeInteger(raw) && Number(raw) > 0, 'Invalid access timestamp.'); return Number(raw);
}
function limitedText(raw: unknown, allowEmpty = true): string {
  ensure(typeof raw === 'string' && Array.from(raw).length <= 500 && (allowEmpty || raw.trim().length > 0), 'Use a message of at most 500 characters.');
  return raw;
}
export function parseAccessConfig(raw: unknown): AccessConfig {
  const value = object(raw);
  ensure(value.chainId === 10143 && value.sessionTtlSeconds === 900, 'The access service uses an unsupported network or session.');
  ensure(Array.isArray(value.relayers) && value.relayers.length <= 32, 'Invalid access service configuration.');
  return { chainId: 10143, router: address(value.router), identity: address(value.identity), relayers: value.relayers.map(address), sessionTtlSeconds: 900 };
}
export function accessSessionData(config: AccessConfig, wallet: Address, expiresAt: number) {
  return {
    domain: { name: 'AetherisAccess', version: '1', chainId: 10143, verifyingContract: config.router },
    types: { AccessSession: [{ name: 'wallet', type: 'address' }, { name: 'purpose', type: 'string' }, { name: 'expiresAt', type: 'uint64' }] },
    primaryType: 'AccessSession' as const,
    message: { wallet, purpose: accessPurpose, expiresAt: BigInt(seconds(expiresAt)) },
  } as const;
}
export function accessApprovalData(config: AccessConfig, request: AccessRequest, approval: AccessApproval) {
  ensure(same(request.id, approval.id), 'Approval belongs to another request.');
  return {
    domain: { name: 'AetherisAccess', version: '1', chainId: 10143, verifyingContract: config.router },
    types: { AccessApproval: [
      { name: 'requestId', type: 'bytes32' }, { name: 'agentId', type: 'uint256' }, { name: 'requester', type: 'address' },
      { name: 'ownershipEpoch', type: 'uint256' }, { name: 'expiresAt', type: 'uint64' }, { name: 'deadline', type: 'uint64' },
    ] },
    primaryType: 'AccessApproval' as const,
    message: { requestId: request.id, agentId: uint(request.agentId), requester: request.requester,
      ownershipEpoch: uint(approval.ownershipEpoch), expiresAt: BigInt(seconds(approval.expiresAt)), deadline: BigInt(seconds(approval.deadline)) },
  } as const;
}
export function parseAccessResponse(raw: unknown, actor: string): AccessResponse {
  const value = object(raw);
  ensure(Array.isArray(value.requests) && value.requests.length <= 100, 'Invalid access inbox.');
  const requests = value.requests.map((rawRequest): AccessRequest => {
    const item = object(rawRequest); const owner = address(item.owner), requester = address(item.requester);
    ensure(same(owner, actor) || same(requester, actor), 'The inbox contains a request for another wallet.');
    ensure(['pending', 'approving', 'approved', 'denied', 'expired', 'invalidated'].includes(String(item.status)), 'Invalid access request status.');
    ensure(accessDurations.includes(item.durationSeconds as typeof accessDurations[number]), 'Invalid access duration.');
    ensure(typeof item.unread === 'boolean' && (item.currentAuthority === undefined || item.currentAuthority === null || typeof item.currentAuthority === 'boolean'), 'Invalid access notification.');
    ensure(Number.isSafeInteger(item.revision) && Number(item.revision) > 0, 'Invalid notification revision.');
    ensure(uint(item.agentId) > 0n, 'Invalid agent identity.');
    return { id: hash(item.id), agentId: uint(item.agentId).toString(), owner, requester, durationSeconds: Number(item.durationSeconds),
      reason: limitedText(item.reason, false), createdAt: seconds(item.createdAt), requestExpiresAt: seconds(item.requestExpiresAt),
      status: item.status as AccessRequest['status'], unread: item.unread, revision: Number(item.revision),
      ...(item.currentAuthority == null ? {} : { currentAuthority: item.currentAuthority as boolean }),
      ...(item.decisionAt == null ? {} : { decisionAt: seconds(item.decisionAt) }),
      ...(item.decisionNote == null ? {} : { decisionNote: limitedText(item.decisionNote) }),
      ...(item.transactionHash == null ? {} : { transactionHash: hash(item.transactionHash) }),
      ...(item.grantExpiresAt == null ? {} : { grantExpiresAt: seconds(item.grantExpiresAt) }),
      ...(item.approvalError == null ? {} : { approvalError: limitedText(item.approvalError) }),
    };
  });
  ensure(new Set(requests.map(item => item.id.toLowerCase())).size === requests.length, 'Duplicate access request IDs.');
  let approval: AccessApproval | undefined;
  if (value.approval != null) {
    const item = object(value.approval); ensure(typeof item.relayed === 'boolean', 'Invalid approval mode.');
    approval = { id: hash(item.id), expiresAt: seconds(item.expiresAt), deadline: seconds(item.deadline), ownershipEpoch: uint(item.ownershipEpoch).toString(), relayed: item.relayed };
  }
  const nextCursor = value.nextCursor;
  ensure(nextCursor == null || (typeof nextCursor === 'string' && nextCursor.length <= 160), 'Invalid inbox page.');
  return { requests, ...(approval ? { approval } : {}), ...(nextCursor ? { nextCursor: nextCursor as string } : {}) };
}

/** Validate at the public proxy before forwarding private inbox messages. */
export function parseAccessEnvelope(raw: unknown, now = Math.floor(Date.now() / 1000)) {
  const value = object(raw), session = object(value.auth), payload = object(value.payload);
  ensure(Object.keys(value).every(key => ['auth', 'action', 'payload'].includes(key)), 'Unexpected access request fields.');
  ensure(['list', 'request', 'prepare', 'grant', 'approve', 'deny', 'seen', 'cancel'].includes(String(value.action)), 'Unsupported access action.');
  const auth: AccessAuth = { wallet: address(session.wallet), expiresAt: seconds(session.expiresAt), signature: session.signature as Hex };
  ensure(/^0x[0-9a-fA-F]{130}$/.test(auth.signature || ''), 'Sign in to your access inbox.');
  ensure(auth.expiresAt > now && auth.expiresAt <= now + 900, 'Your access inbox session expired. Unlock it again.');
  const action = value.action as AccessAction;
  const fields: Record<AccessAction, string[]> = { list: ['cursor'], request: ['id', 'agentId', 'owner', 'durationSeconds', 'reason'], prepare: ['id'], grant: ['id', 'expiresAt', 'deadline', 'authorization'], approve: ['id', 'transactionHash'], deny: ['id', 'note'], seen: ['items'], cancel: ['id'] };
  ensure(Object.keys(payload).every(key => fields[action].includes(key)), 'Unexpected access action details.');
  if (action === 'list' && payload.cursor !== undefined) ensure(typeof payload.cursor === 'string' && payload.cursor.length > 0 && payload.cursor.length <= 160, 'Invalid inbox page.');
  if (action !== 'list' && action !== 'seen') hash(payload.id);
  if (action === 'request') {
    ensure(payload.agentId === '1', 'Access requests are currently available for Observer #1.'); address(payload.owner);
    ensure(accessDurations.includes(payload.durationSeconds as typeof accessDurations[number]), 'Choose an available access duration.'); limitedText(payload.reason, false);
  }
  if (action === 'approve') hash(payload.transactionHash);
  if (action === 'deny') limitedText(payload.note);
  if (action === 'grant') { seconds(payload.expiresAt); seconds(payload.deadline); ensure(typeof payload.authorization === 'string' && /^0x[0-9a-fA-F]{130}$/.test(payload.authorization), 'Sign this specific access approval with the owner wallet.'); }
  if (action === 'seen') {
    ensure(Array.isArray(payload.items) && payload.items.length <= 100, 'Invalid notification selection.');
    payload.items.forEach(raw => { const item = object(raw); hash(item.id); ensure(Number.isSafeInteger(item.revision) && Number(item.revision) > 0, 'Invalid notification revision.'); });
  }
  return { auth, action, payload };
}
