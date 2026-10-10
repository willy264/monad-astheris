import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ContractFunctionExecutionError, HttpRequestError, TimeoutError, UserRejectedRequestError } from 'viem';
import { userErrorMessage } from '../lib/user-error';

const fallback = 'The request could not finish. Check its saved status.';
test('nested wallet rejections have useful text without request arguments or calldata', () => {
  const rejection = new UserRejectedRequestError(new Error('secret provider details'));
  const wrapped = new ContractFunctionExecutionError(rejection, { abi: [], functionName: 'setDelegate', args: [2n, `0x${'ab'.repeat(20)}`] });
  assert.equal(userErrorMessage(wrapped, fallback), 'The wallet request was cancelled. You can try again when you are ready.');
  assert.equal(userErrorMessage({ cause: { code: 4001, message: 'private data' } }, fallback), userErrorMessage(wrapped, fallback));
});
test('timeouts and network errors preserve uncertainty and omit RPC URLs and payloads', () => {
  const timeout = new TimeoutError({ url: 'https://rpc.example/private-api-key', body: { method: 'eth_sendRawTransaction', params: ['private-payload'] } });
  const message = userErrorMessage(timeout, fallback);
  assert.match(message, /taking too long/); assert.match(message, /saved transaction or task status/);
  assert.doesNotMatch(message, /private|eth_send|not submitted|not charged/);
  const http = new HttpRequestError({ url: 'https://rpc.example/private-key', status: 503 });
  assert.match(userErrorMessage(http, fallback), /connection is unavailable/);
});
test('application ownership and recovery guidance survives but raw details do not', () => {
  const message = 'Only the current agent identity owner can manage this delegation.';
  assert.equal(userErrorMessage(new Error(message), fallback), message);
  for (const unsafe of ['Request arguments: chain 10143', 'Failed https://rpc.example/secret', `Payload 0x${'ab'.repeat(50)}`, 'Failure\nDetails: credential', 'Authorization: secret', 'Bearer secret', 'data: secret']) {
    assert.equal(userErrorMessage(new Error(unsafe), fallback), fallback);
  }
  assert.equal(userErrorMessage(new Error('Outer error', { cause: new Error('private') }), fallback), fallback);
  assert.equal(userErrorMessage('arbitrary upstream string', fallback), fallback);
  assert.equal(userErrorMessage(new TypeError('secret SDK details'), fallback), fallback);
});
test('cyclic provider errors are bounded and pending prompts are not reported as cancellations', () => {
  const cyclic: { code: number; cause?: unknown } = { code: -32002 }; cyclic.cause = cyclic;
  assert.match(userErrorMessage(cyclic, fallback), /already waiting in your wallet/);
  assert.match(userErrorMessage({ name: 'InsufficientFundsError' }, fallback), /more testnet MON/);
  assert.match(userErrorMessage({ name: 'AbortError' }, fallback), /check was interrupted/);
});
