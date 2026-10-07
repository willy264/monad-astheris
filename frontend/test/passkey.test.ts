import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { passkeyErrorMessage, registerAccountPasskey, requirePasskeyVerification } from '../lib/passkey';

test('enrollment obtains required account verification before creating a credential', async () => {
  const calls: string[] = [];
  await registerAccountPasskey({
    needsVerification: async () => { calls.push('check'); return true; },
    verifyAccount: async () => { calls.push('verify'); },
    register: async () => { calls.push('register'); return { user: { userId: 'user-1' } }; },
    status: () => {},
  });
  assert.deepEqual(calls, ['check', 'verify', 'register']);
});

test('cancelled account verification never starts passkey enrollment', async () => {
  let registrations = 0;
  await assert.rejects(registerAccountPasskey({
    needsVerification: async () => true,
    verifyAccount: async () => { throw new DOMException('User cancelled', 'NotAllowedError'); },
    register: async () => { registrations++; return { user: {} }; },
    status: () => {},
  }), { name: 'NotAllowedError' });
  assert.equal(registrations, 0);
});

test('a swallowed Dynamic registration failure cannot become a success message', async () => {
  await assert.rejects(registerAccountPasskey({
    needsVerification: async () => false,
    verifyAccount: async () => { assert.fail('Verification is unnecessary for this session'); },
    register: async () => undefined,
    status: () => {},
  }), /Dynamic did not confirm/);
  for (const response of [undefined, null, {}, { user: null }, { user: false }]) {
    assert.throws(() => requirePasskeyVerification(response), /did not confirm/);
  }
  assert.doesNotThrow(() => requirePasskeyVerification({ user: { userId: 'user-1' } }));
});

test('browser cancellation, duplicate credentials and origin errors have actionable feedback', () => {
  assert.match(passkeyErrorMessage(new DOMException('cancelled', 'NotAllowedError')), /cancelled, timed out, or was blocked/);
  assert.match(passkeyErrorMessage({ name: 'InvalidStateError' }), /already registered/);
  assert.match(passkeyErrorMessage({ name: 'SecurityError' }), /monad-astheris.vercel.app/);
  assert.match(passkeyErrorMessage({ name: 'NotSupportedError' }), /another supported authenticator/);
  assert.match(passkeyErrorMessage(undefined), /Account & Security/);
});
