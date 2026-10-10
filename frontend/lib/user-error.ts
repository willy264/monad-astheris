/** UI messages only: provider errors can contain RPC credentials, calldata and signed payloads. */
export function userErrorMessage(cause: unknown, fallback: string): string {
  const errors: { name?: unknown; code?: unknown; message?: unknown; cause?: unknown }[] = [];
  const visited = new Set<unknown>();
  let current = cause;
  while (current && typeof current === 'object' && !visited.has(current) && errors.length < 12) {
    visited.add(current);
    const error = current as (typeof errors)[number];
    errors.push(error); current = error.cause;
  }
  if (errors.some(error => error.code === 4001 || error.code === '4001' || error.name === 'UserRejectedRequestError')) {
    return 'The wallet request was cancelled. You can try again when you are ready.';
  }
  if (errors.some(error => error.code === -32002 || error.name === 'ResourceUnavailableRpcError')) {
    return 'A request is already waiting in your wallet. Open the wallet to finish or cancel it before trying again.';
  }
  if (errors.some(error => error.name === 'TimeoutError' || error.name === 'WaitForTransactionReceiptTimeoutError')) {
    return 'Monad Testnet is taking too long to respond. Check any saved transaction or task status before trying again.';
  }
  if (errors.some(error => error.name === 'HttpRequestError' || error.name === 'WebSocketRequestError' || error.name === 'SocketClosedError' || error.code === 4900 || error.code === 4901)) {
    return 'The wallet or Monad Testnet connection is unavailable. Reconnect and check any saved transaction or task status.';
  }
  if (errors.some(error => error.name === 'InsufficientFundsError')) {
    return 'This wallet needs more testnet MON to pay the transaction fee. Check its balance before trying again.';
  }
  if (errors.some(error => error.name === 'AbortError')) {
    return 'The check was interrupted. Check any saved transaction or task status before continuing.';
  }
  // Plain errors created by the application provide useful ownership/recovery
  // instructions. SDK subclasses, nested provider errors and request details do not.
  if (cause instanceof Error && cause.name === 'Error' && !cause.cause) {
    const message = cause.message.trim();
    if (message && message.length <= 500 && !/[\r\n]|https?:\/\/|0x[\da-f]{16}|request (?:body|arguments)|calldata|\b(?:details|version|url|data|authorization|cookie)\s*:|\bbearer\s|"(?:params|method|signature)"/i.test(message)) return message;
  }
  return fallback;
}
