import { randomBytes } from 'node:crypto';
import { recoverTypedDataAddress, type Address, type Hex } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import { address, canonical, check, hash, object, sameAddress, uint } from './common.js';

export interface PaymentPolicy {
  resource: string; asset: Address; receiver: Address; maxAmount: bigint;
  name: string; version: string; maxTimeoutSeconds: number;
}
export interface ExactRequirements {
  scheme: 'exact'; network: 'eip155:10143'; amount: string; asset: Address; payTo: Address;
  maxTimeoutSeconds: number; extra: { name: string; version: string };
}
export interface PaymentCredential { header: 'PAYMENT-SIGNATURE'; value: string; mode: 'x402'; payer: Address; amount: string; asset: Address; receiver: Address; nonce: Hex; validBefore: number; }
export function validateChallenge(raw: unknown, policy: PaymentPolicy): ExactRequirements {
  const challenge = object(raw);
  check(challenge.x402Version === 2, 'Unsupported x402 version');
  check(object(challenge.resource).url === policy.resource, 'Payment resource does not match the pinned task URL');
  check(Array.isArray(challenge.accepts) && challenge.accepts.length === 1, 'Expected exactly one payment requirement');
  check(!challenge.extensions || Object.keys(object(challenge.extensions)).length === 0, 'Payment extensions are not supported');
  const item = object(challenge.accepts[0]);
  check(item.scheme === 'exact' && item.network === 'eip155:10143', 'Only exact EIP3009 on Monad Testnet is allowed');
  check(sameAddress(item.asset, policy.asset) && sameAddress(item.payTo, policy.receiver), 'Payment asset or receiver does not match local policy');
  const amount = uint(item.amount, 'payment amount', 128);
  check(amount > 0n && amount <= policy.maxAmount, 'Payment exceeds the configured amount limit');
  check(Number.isSafeInteger(item.maxTimeoutSeconds) && (item.maxTimeoutSeconds as number) > 0 && (item.maxTimeoutSeconds as number) <= policy.maxTimeoutSeconds, 'Payment validity exceeds the configured limit');
  const extra = object(item.extra);
  check(extra.name === policy.name && extra.version === policy.version, 'Payment token domain does not match local policy');
  check(Object.keys(extra).every(key => ['name', 'version'].includes(key)), 'Additional payment mechanisms are not permitted');
  check(Object.keys(item).every(key => ['scheme', 'network', 'amount', 'asset', 'payTo', 'maxTimeoutSeconds', 'extra'].includes(key)), 'Unknown payment requirement fields');
  return item as unknown as ExactRequirements;
}
export const authorizationTypes = { TransferWithAuthorization: [
  { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
] } as const;
export async function signPayment(challenge: unknown, policy: PaymentPolicy, signer: PrivateKeyAccount, now = Math.floor(Date.now() / 1000)): Promise<PaymentCredential> {
  const accepted = validateChallenge(challenge, policy);
  const validBefore = now + accepted.maxTimeoutSeconds;
  const authorization = { from: signer.address, to: address(accepted.payTo), value: accepted.amount, validAfter: '0', validBefore: String(validBefore), nonce: `0x${randomBytes(32).toString('hex')}` as Hex };
  const signature = await signer.signTypedData({
    domain: { name: policy.name, version: policy.version, chainId: 10143, verifyingContract: policy.asset },
    types: authorizationTypes, primaryType: 'TransferWithAuthorization',
    message: { ...authorization, value: BigInt(authorization.value), validAfter: 0n, validBefore: BigInt(validBefore) },
  });
  const payload = { x402Version: 2, resource: object(challenge).resource, accepted, payload: { signature, authorization } };
  return { header: 'PAYMENT-SIGNATURE', value: Buffer.from(canonical(payload)).toString('base64'), mode: 'x402', payer: signer.address, amount: accepted.amount, asset: policy.asset, receiver: policy.receiver, nonce: authorization.nonce, validBefore };
}
export function decodeChallenge(value: string | null): unknown {
  check(value && value.length <= 16_384 && /^[A-Za-z0-9+/]+={0,2}$/.test(value), 'Invalid PAYMENT-REQUIRED header');
  try { return JSON.parse(Buffer.from(value, 'base64').toString('utf8')); }
  catch { throw new Error('Invalid payment challenge JSON'); }
}
export async function verifyCredential(credential: PaymentCredential, policy: PaymentPolicy, payer: Address): Promise<void> {
  const payload = object(decodeChallenge(credential.value));
  const accepted = validateChallenge({ x402Version: payload.x402Version, resource: payload.resource, accepts: [payload.accepted] }, policy);
  const authorization = object(object(payload.payload).authorization);
  check(credential.header === 'PAYMENT-SIGNATURE' && credential.mode === 'x402' && credential.amount === accepted.amount
    && sameAddress(credential.payer, payer) && sameAddress(credential.asset, policy.asset) && sameAddress(credential.receiver, policy.receiver), 'Saved payment metadata mismatch');
  check(hash(authorization.nonce) === credential.nonce, 'Saved payment nonce mismatch');
  check(sameAddress(authorization.from, payer) && sameAddress(authorization.to, policy.receiver), 'Saved payment payer/receiver mismatch');
  check(authorization.value === accepted.amount && authorization.validAfter === '0', 'Saved payment amount/validity mismatch');
  check(uint(authorization.validBefore) === BigInt(credential.validBefore), 'Saved payment deadline mismatch');
  const recovered = await recoverTypedDataAddress({
    domain: { name: policy.name, version: policy.version, chainId: 10143, verifyingContract: policy.asset },
    types: authorizationTypes, primaryType: 'TransferWithAuthorization',
    message: { from: payer, to: policy.receiver, value: uint(authorization.value), validAfter: 0n, validBefore: uint(authorization.validBefore), nonce: hash(authorization.nonce) },
    signature: object(payload.payload).signature as Hex,
  });
  check(sameAddress(recovered, payer), 'Saved payment signature is invalid');
}
