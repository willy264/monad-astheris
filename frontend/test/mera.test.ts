import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { recoverMessageAddress } from 'viem';
import { openMeraSession } from '../lib/mera-account';

test('Mera account derivation is reproducible, clears input entropy and ends signing capability', async () => {
  const entropy = new Uint8Array(32).fill(7);
  const first = openMeraSession(entropy);
  assert.ok(entropy.every(byte => byte === 0));
  const signature = await first.account.signMessage({ message: 'Aetheris local SDK interoperability check' });
  assert.equal(await recoverMessageAddress({ message: 'Aetheris local SDK interoperability check', signature }), first.account.address);
  first.session.end();
  await assert.rejects(first.account.signMessage({ message: 'session ended' }));
  const second = openMeraSession(new Uint8Array(32).fill(7));
  try { assert.equal(second.account.address, first.account.address); }
  finally { second.session.end(); }
});
