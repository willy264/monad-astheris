import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { requireDelegationTarget, verifyDelegationReceipt } from '../lib/delegation';

test('only an owner can grant or revoke a separate executor, including case-insensitive wallet addresses', () => {
  const owner = `0x${'ab'.repeat(20)}` as const, executor = `0x${'cd'.repeat(20)}` as const;
  const ownerMixedCase = `0x${'AB'.repeat(20)}` as const;
  assert.doesNotThrow(() => requireDelegationTarget(owner, ownerMixedCase, executor, false));
  assert.doesNotThrow(() => requireDelegationTarget(owner, ownerMixedCase, executor, true));
  assert.throws(() => requireDelegationTarget(owner, executor, owner, false), /Only the current agent identity owner/);
  assert.throws(() => requireDelegationTarget(owner, executor, executor, true), /Only the current agent identity owner/);
  assert.throws(() => requireDelegationTarget(owner, ownerMixedCase, ownerMixedCase, false), /already has task authority/);
  assert.throws(() => requireDelegationTarget(owner, ownerMixedCase, ownerMixedCase, true), /cannot remove the owner's authority/);
  assert.throws(() => requireDelegationTarget(owner, owner, `0x${'00'.repeat(20)}`, false), /non-zero/);
});

test('successful cancellation/replacement receipts cannot confirm a delegation', () => {
  const owner = `0x${'11'.repeat(20)}` as const, router = `0x${'22'.repeat(20)}` as const;
  const hash = `0x${'33'.repeat(32)}` as const;
  const receipt = { status: 'success' as const, transactionHash: hash, from: owner, to: router };
  assert.doesNotThrow(() => verifyDelegationReceipt(receipt, hash, router, owner));
  assert.throws(() => verifyDelegationReceipt({ ...receipt, transactionHash: `0x${'44'.repeat(32)}`, to: owner }, hash, router, owner), /replaced or cancelled/);
  assert.throws(() => verifyDelegationReceipt({ ...receipt, status: 'reverted' }, hash, router, owner), /does not confirm/);
  assert.throws(() => verifyDelegationReceipt({ ...receipt, from: router }, hash, router, owner), /does not confirm/);
});
