import { createWalletClient, http, keccak256, parseTransaction, recoverTransactionAddress, type Address, type Hex, type TransactionReceipt, type TransactionSerialized } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import { chain, check, sameAddress, type Rpc } from './common.js';
import { Journal } from './journal.js';

export interface SignedOperation { raw: Hex; hash: Hex; from: Address; to: Address; data: Hex; nonce: number; }
interface SignerState { owner: string; pending?: SignedOperation; resolvedHash?: Hex; }
export type SignerAction = <T>(signer: Address, action: (pending: SignedOperation | undefined, reserve: (operation: SignedOperation) => Promise<void>) => Promise<T>) => Promise<T>;

async function confirmedReceipt(rpc: Rpc, hash: Hex, confirmations: number): Promise<TransactionReceipt | undefined> {
  const receipt = await rpc.getTransactionReceipt({ hash });
  if (receipt.transactionHash !== hash || !['success', 'reverted'].includes(receipt.status)) return undefined;
  const [head, block] = await Promise.all([rpc.getBlockNumber(), rpc.getBlock({ blockNumber: receipt.blockNumber })]);
  return head >= receipt.blockNumber + BigInt(confirmations - 1) && block.hash === receipt.blockHash ? receipt : undefined;
}
export async function withSignerJournal<T>(directory: string, owner: string, rpc: Rpc, confirmations: number,
  action: (pending: SignedOperation | undefined, reserve: (operation: SignedOperation) => Promise<void>) => Promise<T>): Promise<T> {
  const journal = await Journal.acquire<SignerState>(directory);
  let state: SignerState | undefined;
  try {
    state = await journal.load();
    if (state?.pending && state.owner !== owner) {
      check(await confirmedReceipt(rpc, state.pending.hash, confirmations).catch(() => undefined), 'Signer has an unresolved operation in another task journal; resume that task before using this signer');
      state = { owner, resolvedHash: state.pending.hash }; await journal.save(state);
    }
    return await action(state?.pending, async operation => {
      if (state?.pending && state.pending.hash !== operation.hash) {
        check(await confirmedReceipt(rpc, state.pending.hash, confirmations).catch(() => undefined), 'Signer already has a different unresolved operation');
      }
      state = { owner, pending: operation };
      // This global signer journal is persisted before the per-task save and
      // broadcast. The same owning task can recover its raw bytes after a crash.
      await journal.save(state);
    });
  } finally {
    try {
      if (state?.pending && await confirmedReceipt(rpc, state.pending.hash, confirmations).catch(() => undefined)) {
        await journal.save({ owner: state.owner, resolvedHash: state.pending.hash });
      }
    } finally { await journal.release(); }
  }
}
export async function verifySignedOperation(operation: SignedOperation, signer: Address, to: Address, data: Hex): Promise<void> {
  check(keccak256(operation.raw) === operation.hash, 'Saved transaction hash mismatch');
  const parsed = parseTransaction(operation.raw);
  check(parsed.chainId === 10143 && parsed.to && sameAddress(parsed.to, to) && parsed.data === data && (parsed.value ?? 0n) === 0n, 'Saved transaction intent mismatch');
  check(parsed.nonce === operation.nonce && sameAddress(operation.from, signer) && sameAddress(operation.to, to) && operation.data === data, 'Saved transaction metadata mismatch');
  check(sameAddress(await recoverTransactionAddress({ serializedTransaction: operation.raw as TransactionSerialized }), signer), 'Saved transaction signer mismatch');
}
export async function sendOperation(options: {
  rpc: Rpc; rpcUrl: string; signer: PrivateKeyAccount; to: Address; data: Hex;
  saved?: SignedOperation; save: (operation: SignedOperation) => Promise<void>; confirmations: number;
  allowReverted?: boolean;
}): Promise<TransactionReceipt> {
  const { rpc, signer, to, data } = options;
  let operation = options.saved;
  if (!operation) {
    await rpc.call({ account: signer.address, to, data });
    const wallet = createWalletClient({ account: signer, chain, transport: http(options.rpcUrl, { retryCount: 0, timeout: 30_000 }) });
    const prepared = await wallet.prepareTransactionRequest({ account: signer, chain, to, data, value: 0n, nonce: await rpc.getTransactionCount({ address: signer.address, blockTag: 'pending' }) });
    const raw = await wallet.signTransaction(prepared);
    operation = { raw, hash: keccak256(raw), from: signer.address, to, data, nonce: prepared.nonce };
  }
  await verifySignedOperation(operation, signer.address, to, data);
  // Also materialize a recovered global signer operation into the task journal.
  // Both journals must be durable before the first (or identical) broadcast.
  await options.save(operation);
  const mined = await rpc.getTransactionReceipt({ hash: operation.hash }).catch(() => undefined);
  if (!mined) {
    const known = await rpc.getTransaction({ hash: operation.hash }).catch(() => undefined);
    if (!known) {
      const nonce = await rpc.getTransactionCount({ address: signer.address, blockTag: 'pending' });
      check(nonce <= operation.nonce, 'Signer nonce has advanced without this transaction; reconcile before continuing');
      // Re-sending identical signed bytes is idempotent; never create a replacement.
      const sent = await rpc.sendRawTransaction({ serializedTransaction: operation.raw });
      check(sent === operation.hash, 'RPC returned an unexpected transaction hash');
    }
  }
  const receipt = await rpc.waitForTransactionReceipt({ hash: operation.hash, confirmations: options.confirmations, timeout: 180_000 });
  check(receipt.transactionHash === operation.hash && (receipt.status === 'success' || options.allowReverted === true), 'Post-execution transaction failed or was replaced');
  const block = await rpc.getBlock({ blockNumber: receipt.blockNumber });
  check(block.hash === receipt.blockHash, 'Post-execution receipt is no longer canonical');
  return receipt;
}
