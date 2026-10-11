import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { encodeAbiParameters, encodeEventTopics, type TransactionReceipt } from 'viem';
import { routerAbi } from '../lib/contracts';
import { executorAuthorityLabel, requireDelegationTarget, verifyDelegationReceipt } from '../lib/delegation';

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

test('executor states distinguish active, soon-expiring, expired and cleared grants without inventing a revocation', () => {
  assert.equal(executorAuthorityLabel(true, 4600n, 1000n), 'Authorized');
  assert.match(executorAuthorityLabel(true, 1100n, 1000n), /Expires soon/);
  assert.equal(executorAuthorityLabel(false, 1000n, 1000n), 'Authorization expired');
  assert.equal(executorAuthorityLabel(false, 4600n, 1000n), 'Authorization no longer valid');
  assert.equal(executorAuthorityLabel(false, 0n, 1000n), 'Not authorized (not granted or revoked)');
  assert.equal(executorAuthorityLabel(true, 8200n, 4600n), 'Authorized', 'renewal restores current permission');
});

test('grant and revocation confirmation require the exact router event and requested expiry', () => {
  const owner = `0x${'11'.repeat(20)}` as const, router = `0x${'22'.repeat(20)}` as const;
  const executor = `0x${'33'.repeat(20)}` as const, hash = `0x${'44'.repeat(32)}` as const;
  for (const expiresAt of [4600n, 0n]) {
    const expected = { agentId: 2n, executor, expiresAt };
    const receipt = { status: 'success' as const, transactionHash: hash, from: owner, to: router, logs: [{ address: router,
      topics: encodeEventTopics({ abi: routerAbi, eventName: 'DelegateSet', args: { agentId: 2n, delegate: executor } }),
      data: encodeAbiParameters([{ type: 'uint64' }, { type: 'address' }], [expiresAt, owner]),
    }] } as unknown as TransactionReceipt;
    assert.doesNotThrow(() => verifyDelegationReceipt(receipt, hash, router, owner, expected));
    for (const changed of [{ ...expected, agentId: 1n }, { ...expected, executor: owner }, { ...expected, expiresAt: expiresAt + 1n }]) {
      assert.throws(() => verifyDelegationReceipt(receipt, hash, router, owner, changed), /exact executor grant or revocation/);
    }
    assert.throws(() => verifyDelegationReceipt({ ...receipt, logs: [] }, hash, router, owner, expected), /exact executor/);
    assert.throws(() => verifyDelegationReceipt({ ...receipt, logs: [receipt.logs[0], receipt.logs[0]] }, hash, router, owner, expected), /exact executor/);
    assert.throws(() => verifyDelegationReceipt({ ...receipt, logs: [{ ...receipt.logs[0], address: executor }] }, hash, router, owner, expected), /exact executor/);
  }
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
