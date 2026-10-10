import type { Address, Hash, TransactionReceipt } from 'viem';

export function requireDelegationTarget(owner: Address, signer: Address, executor: Address, revoke: boolean) {
  if (owner.toLowerCase() !== signer.toLowerCase()) throw new Error('Only the current agent identity owner can manage this delegation.');
  if (executor.toLowerCase() === owner.toLowerCase()) {
    throw new Error(revoke
      ? 'The agent owner always has task authority. Revoking a delegate cannot remove the owner\'s authority. Choose a different executor address.'
      : 'Your wallet owns this agent and already has task authority. Choose a different executor, or use guided setup to authorize the Aetheris task executor.');
  }
  if (/^0x0{40}$/i.test(executor)) throw new Error('Enter a non-zero executor address.');
}

export function verifyDelegationReceipt(receipt: Pick<TransactionReceipt, 'status' | 'transactionHash' | 'to' | 'from'>, hash: Hash, router: Address, owner: Address) {
  if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) throw new Error('The delegation transaction was replaced or cancelled. Inspect the wallet activity before retrying.');
  if (receipt.status !== 'success' || receipt.to?.toLowerCase() !== router.toLowerCase() || receipt.from.toLowerCase() !== owner.toLowerCase()) throw new Error('The delegation receipt does not confirm the submitted owner/router transaction.');
}
