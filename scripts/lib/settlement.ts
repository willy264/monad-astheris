import { decodeEventLog, parseAbi, type Address, type Hex, type TransactionReceipt } from 'viem';
import { check, sameAddress } from './common.js';
const transferAbi = parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const authorizationAbi = parseAbi(['event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)']);
export function verifyPaymentTransfer(receipt: TransactionReceipt, asset: Address, payer: Address, receiver: Address, amount: bigint, nonce: Hex): void {
  check(receipt.status === 'success', 'Payment transaction reverted');
  const transfers = receipt.logs.filter(log => sameAddress(log.address, asset)).flatMap(log => {
    try { return [decodeEventLog({ abi: transferAbi, eventName: 'Transfer', data: log.data, topics: log.topics, strict: true }).args]; }
    catch { return []; }
  });
  check(transfers.some(transfer => sameAddress(transfer.from, payer) && sameAddress(transfer.to, receiver) && transfer.value === amount), 'Payment receipt lacks the expected token transfer');
  const uses = receipt.logs.filter(log => sameAddress(log.address, asset)).flatMap(log => {
    try { return [decodeEventLog({ abi: authorizationAbi, eventName: 'AuthorizationUsed', data: log.data, topics: log.topics, strict: true }).args]; }
    catch { return []; }
  });
  check(uses.some(use => sameAddress(use.authorizer, payer) && use.nonce === nonce), 'Payment receipt does not consume this exact EIP3009 authorization nonce');
}
