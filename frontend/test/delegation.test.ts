import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { verifyDelegationReceipt } from '../lib/delegation';

test('successful cancellation/replacement receipts cannot confirm a delegation', () => {
  const owner = `0x${'11'.repeat(20)}` as const, router = `0x${'22'.repeat(20)}` as const;
  const hash = `0x${'33'.repeat(32)}` as const;
  const receipt = { status: 'success' as const, transactionHash: hash, from: owner, to: router };
  assert.doesNotThrow(() => verifyDelegationReceipt(receipt, hash, router, owner));
  assert.throws(() => verifyDelegationReceipt({ ...receipt, transactionHash: `0x${'44'.repeat(32)}`, to: owner }, hash, router, owner), /replaced or cancelled/);
  assert.throws(() => verifyDelegationReceipt({ ...receipt, status: 'reverted' }, hash, router, owner), /does not confirm/);
  assert.throws(() => verifyDelegationReceipt({ ...receipt, from: router }, hash, router, owner), /does not confirm/);
});
