import type { Snapshot } from './types';
export function networkStatus(snapshot: Snapshot | undefined, failed: boolean, now: number) {
  if (failed) return { label: 'RPC unavailable', state: 'offline' as const };
  if (!snapshot) return { label: 'Connecting to RPC', state: 'loading' as const };
  if (snapshot.chainId !== 10143 || !/^\d+$/.test(snapshot.blockNumber) || BigInt(snapshot.blockNumber) === 0n) return { label: 'RPC unavailable', state: 'offline' as const };
  const age = now - Date.parse(snapshot.sampledAt);
  if (!Number.isFinite(age) || age > 60000 || age < -30000) return { label: 'RPC sample stale', state: 'stale' as const };
  return { label: 'RPC Active', state: 'active' as const };
}
