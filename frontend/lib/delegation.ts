import { decodeEventLog, type Address, type Hash, type TransactionReceipt } from 'viem';
import { routerAbi } from './contracts';

export function executorAuthorityLabel(authorized: boolean, expiresAt: bigint, chainTime: bigint): string {
  if (authorized && expiresAt > chainTime) return expiresAt < chainTime + 600n ? 'Expires soon — renew before running' : 'Authorized';
  if (expiresAt === 0n) return 'Not authorized (not granted or revoked)';
  return expiresAt <= chainTime ? 'Authorization expired' : 'Authorization no longer valid';
}

export function requireDelegationTarget(owner: Address, signer: Address, executor: Address, revoke: boolean) {
  if (owner.toLowerCase() !== signer.toLowerCase()) throw new Error('Only the current agent identity owner can manage this delegation.');
  if (executor.toLowerCase() === owner.toLowerCase()) {
    throw new Error(revoke
      ? 'The agent owner always has task authority. Revoking a delegate cannot remove the owner\'s authority. Choose a different executor address.'
      : 'Your wallet owns this agent and already has task authority. Choose a different executor, or use guided setup to authorize the Aetheris task executor.');
  }
  if (/^0x0{40}$/i.test(executor)) throw new Error('Enter a non-zero executor address.');
}

export function verifyDelegationReceipt(receipt: Pick<TransactionReceipt, 'status' | 'transactionHash' | 'to' | 'from'> & Partial<Pick<TransactionReceipt, 'logs'>>, hash: Hash, router: Address, owner: Address, expected?: { agentId: bigint; executor: Address; expiresAt: bigint }) {
  if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) throw new Error('The delegation transaction was replaced or cancelled. Inspect the wallet activity before retrying.');
  if (receipt.status !== 'success' || receipt.to?.toLowerCase() !== router.toLowerCase() || receipt.from.toLowerCase() !== owner.toLowerCase()) throw new Error('The delegation receipt does not confirm the submitted owner/router transaction.');
  if (expected) {
    const grants = (receipt.logs ?? []).filter(log => log.address.toLowerCase() === router.toLowerCase()).flatMap(log => {
      try { const event = decodeEventLog({ abi: routerAbi, eventName: 'DelegateSet', data: log.data, topics: log.topics }); return [event.args]; }
      catch { return []; }
    });
    if (grants.length !== 1 || grants[0].agentId !== expected.agentId || grants[0].delegate.toLowerCase() !== expected.executor.toLowerCase()
      || grants[0].expiresAt !== expected.expiresAt || grants[0].owner.toLowerCase() !== owner.toLowerCase()) {
      throw new Error('The receipt does not contain the exact executor grant or revocation requested.');
    }
  }
}
