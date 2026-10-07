import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { passkeyErrorMessage, registerAccountPasskey, requirePasskeyVerification } from '../lib/passkey';

test('enrollment obtains required account verification before creating a credential', async () => {
  const calls: string[] = [];
  let checks = 0;
  await registerAccountPasskey({
    getAccountId: () => 'user-1',
    needsVerification: async () => { calls.push('check'); return ++checks === 1; },
    verifyAccount: async () => { calls.push('verify'); },
    register: async () => { calls.push('register'); return { user: { userId: 'user-1' } }; },
    status: () => {},
  });
  assert.deepEqual(calls, ['check', 'verify', 'check', 'register']);
});

test('an SDK success-close enrolls only after a fresh permission check confirms account verification', async () => {
  const calls: string[] = [];
  let checks = 0;
  await registerAccountPasskey({
    getAccountId: () => 'user-1',
    needsVerification: async () => { calls.push('check'); return ++checks === 1; },
    verifyAccount: async () => {
      calls.push('verify');
      throw new Error('Reauthentication flow closed');
    },
    register: async () => { calls.push('register'); return { user: { userId: 'user-1' } }; },
    status: () => {},
  });
  assert.deepEqual(calls, ['check', 'verify', 'check', 'register']);
});

test('an SDK close with account verification still required never starts enrollment', async () => {
  const calls: string[] = [];
  await assert.rejects(registerAccountPasskey({
    getAccountId: () => 'user-1',
    needsVerification: async () => { calls.push('check'); return true; },
    verifyAccount: async () => { calls.push('verify'); throw new Error('Reauthentication flow closed'); },
    register: async () => { calls.push('register'); return { user: {} }; },
    status: () => {},
  }), /Account verification was not confirmed/);
  assert.deepEqual(calls, ['check', 'verify', 'check']);
});

test('resolved verification without elevated permission never starts enrollment', async () => {
  const calls: string[] = [];
  await assert.rejects(registerAccountPasskey({
    getAccountId: () => 'user-1',
    needsVerification: async () => { calls.push('check'); return true; },
    verifyAccount: async () => { calls.push('verify'); },
    register: async () => { calls.push('register'); return { user: {} }; },
    status: () => {},
  }), /Account verification was not confirmed/);
  assert.deepEqual(calls, ['check', 'verify', 'check']);
});

for (const [name, verificationError] of [
  ['user cancellation', new DOMException('User cancelled', 'NotAllowedError')],
  ['an unrelated SDK failure', new Error('Wallet verification failed')],
  ['a different flow-close message', new Error('Reauthentication flow closed unexpectedly')],
  ['an untyped flow-close object', { message: 'Reauthentication flow closed' }],
] as const) {
  test(`${name} never retries verification or starts enrollment`, async () => {
    const calls: string[] = [];
    await assert.rejects(registerAccountPasskey({
      getAccountId: () => 'user-1',
      needsVerification: async () => { calls.push('check'); return true; },
      verifyAccount: async () => { calls.push('verify'); throw verificationError; },
      register: async () => { calls.push('register'); return { user: {} }; },
      status: () => {},
    }), (cause: unknown) => cause === verificationError);
    assert.deepEqual(calls, ['check', 'verify']);
  });
}

for (const sdkClosesFlow of [false, true]) {
  test(`a failed permission recheck blocks enrollment after ${sdkClosesFlow ? 'an SDK close' : 'verification resolves'}`, async () => {
    const calls: string[] = [];
    const checkError = new Error('Permission service unavailable');
    let checks = 0;
    await assert.rejects(registerAccountPasskey({
      getAccountId: () => 'user-1',
      needsVerification: async () => {
        calls.push('check');
        if (++checks > 1) throw checkError;
        return true;
      },
      verifyAccount: async () => {
        calls.push('verify');
        if (sdkClosesFlow) throw new Error('Reauthentication flow closed');
      },
      register: async () => { calls.push('register'); return { user: {} }; },
      status: () => {},
    }), (cause: unknown) => cause === checkError);
    assert.deepEqual(calls, ['check', 'verify', 'check']);
  });
}

test('an account with existing permission enrolls without a verification prompt', async () => {
  const calls: string[] = [];
  await registerAccountPasskey({
    getAccountId: () => 'user-1',
    needsVerification: async () => { calls.push('check'); return false; },
    verifyAccount: async () => { calls.push('verify'); },
    register: async () => { calls.push('register'); return { user: { userId: 'user-1' } }; },
    status: () => {},
  });
  assert.deepEqual(calls, ['check', 'register']);
});

test('recovered account verification still requires a confirmed passkey registration response', async () => {
  const calls: string[] = [];
  let checks = 0;
  await assert.rejects(registerAccountPasskey({
    getAccountId: () => 'user-1',
    needsVerification: async () => { calls.push('check'); return ++checks === 1; },
    verifyAccount: async () => { calls.push('verify'); throw new Error('Reauthentication flow closed'); },
    register: async () => { calls.push('register'); return undefined; },
    status: () => {},
  }), /Dynamic did not confirm/);
  assert.deepEqual(calls, ['check', 'verify', 'check', 'register']);
});

test('a swallowed Dynamic registration failure cannot become a success message', async () => {
  await assert.rejects(registerAccountPasskey({
    getAccountId: () => 'user-1',
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

test('an absent account cannot start permission checks or passkey enrollment', async () => {
  const calls: string[] = [];
  await assert.rejects(registerAccountPasskey({
    getAccountId: () => undefined,
    needsVerification: async () => { calls.push('check'); return false; },
    verifyAccount: async () => { calls.push('verify'); },
    register: async () => { calls.push('register'); return { user: {} }; },
    status: () => {},
  }), /account|session/i);
  assert.deepEqual(calls, []);
});

for (const nextAccountId of ['user-2', undefined]) {
  for (const phase of ['initial-check-authorized', 'initial-check-required', 'verification', 'verification-close', 'permission-recheck'] as const) {
    test(`${nextAccountId ? 'switching accounts' : 'signing out'} during ${phase} stops before enrollment`, async () => {
      const calls: string[] = [];
      let accountId: string | undefined = 'user-1';
      let checks = 0;
      await assert.rejects(registerAccountPasskey({
        getAccountId: () => accountId,
        needsVerification: async () => {
          calls.push('check');
          checks++;
          if (checks === 1) {
            if (phase.startsWith('initial-check')) accountId = nextAccountId;
            return phase !== 'initial-check-authorized';
          }
          if (phase === 'permission-recheck') accountId = nextAccountId;
          return false;
        },
        verifyAccount: async () => {
          calls.push('verify');
          if (phase === 'verification' || phase === 'verification-close') accountId = nextAccountId;
          if (phase === 'verification-close') throw new Error('Reauthentication flow closed');
        },
        register: async () => { calls.push('register'); return { user: {} }; },
        status: () => {},
      }), /account|session/i);
      assert.deepEqual(calls, phase.startsWith('initial-check')
        ? ['check']
        : phase === 'permission-recheck' ? ['check', 'verify', 'check'] : ['check', 'verify']);
    });
  }
  test(`${nextAccountId ? 'switching accounts' : 'signing out'} during registration cannot report success for another account`, async () => {
    const calls: string[] = [];
    let accountId: string | undefined = 'user-1';
    await assert.rejects(registerAccountPasskey({
      getAccountId: () => accountId,
      needsVerification: async () => { calls.push('check'); return false; },
      verifyAccount: async () => { calls.push('verify'); },
      register: async () => {
        calls.push('register');
        accountId = nextAccountId;
        return { user: { userId: 'user-1' } };
      },
      status: () => {},
    }), /account|session/i);
    assert.deepEqual(calls, ['check', 'register']);
  });
}

for (const sdkClosesFlow of [false, true]) {
  test(`an undefined permission recheck cannot authorize enrollment after ${sdkClosesFlow ? 'an SDK close' : 'verification resolves'}`, async () => {
    const calls: string[] = [];
    let checks = 0;
    await assert.rejects(registerAccountPasskey({
      getAccountId: () => 'user-1',
      needsVerification: async () => {
        calls.push('check');
        // Simulate a runtime SDK contract violation despite its boolean type.
        return ++checks === 1 ? true : undefined as unknown as boolean;
      },
      verifyAccount: async () => {
        calls.push('verify');
        if (sdkClosesFlow) throw new Error('Reauthentication flow closed');
      },
      register: async () => { calls.push('register'); return { user: {} }; },
      status: () => {},
    }), /Account verification was not confirmed/);
    assert.deepEqual(calls, ['check', 'verify', 'check']);
  });
}

test('browser cancellation, duplicate credentials and origin errors have actionable feedback', () => {
  assert.match(passkeyErrorMessage(new DOMException('cancelled', 'NotAllowedError')), /cancelled, timed out, or was blocked/);
  assert.match(passkeyErrorMessage({ name: 'InvalidStateError' }), /already registered/);
  assert.match(passkeyErrorMessage({ name: 'SecurityError' }), /monad-astheris.vercel.app/);
  assert.match(passkeyErrorMessage({ name: 'NotSupportedError' }), /another supported authenticator/);
  assert.match(passkeyErrorMessage(undefined), /Account & Security/);
});
