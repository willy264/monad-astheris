import type { Address, Hash, TransactionReceipt } from 'viem';

export function verifyDelegationReceipt(receipt: Pick<TransactionReceipt, 'status' | 'transactionHash' | 'to' | 'from'>, hash: Hash, router: Address, owner: Address) {
  if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) throw new Error('The delegation transaction was replaced or cancelled. Inspect the wallet activity before retrying.');
  if (receipt.status !== 'success' || receipt.to?.toLowerCase() !== router.toLowerCase() || receipt.from.toLowerCase() !== owner.toLowerCase()) throw new Error('The delegation receipt does not confirm the submitted owner/router transaction.');
}
