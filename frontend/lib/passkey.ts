export const unconfirmedPasskeyMessage = 'Dynamic did not confirm this passkey request. Open your wallet profile and choose Account & Security to check your passkeys, or sign out and reconnect your account before trying again.';
const unconfirmedAccountMessage = 'Account verification was not confirmed, so passkey registration was stopped.';

// Dynamic 5.9.2 can resolve undefined after handling an API error internally.
// Only a verification response establishes completion; a resolved promise does not.
export function requirePasskeyVerification(response: unknown): void {
  if (!response || typeof response !== 'object' || !('user' in response)
    || !response.user || typeof response.user !== 'object') {
    throw new Error(unconfirmedPasskeyMessage);
  }
}

export async function registerAccountPasskey(actions: {
  getAccountId(): string | undefined;
  needsVerification(): Promise<boolean>;
  verifyAccount(): Promise<unknown>;
  register(): Promise<unknown>;
  status(message: string): void;
}): Promise<void> {
  const accountId = actions.getAccountId();
  const checkAccount = () => {
    if (!accountId || actions.getAccountId() !== accountId) {
      throw new Error('The signed-in account changed. Passkey registration cannot be confirmed for this account.');
    }
  };
  checkAccount();
  actions.status('Checking your account before adding a passkey...');
  const needsVerification = await actions.needsVerification();
  checkAccount();
  if (needsVerification !== false) {
    actions.status('Confirm your account in the Dynamic prompt, then create your passkey.');
    try {
      await actions.verifyAccount();
    } catch (cause) {
      // Dynamic 5.9.2 emits authFlowClose during successful wallet sign-in,
      // before its reauthentication view can resolve. A close alone is not
      // success: require the SDK's credential-link permission check below.
      if (!(cause instanceof Error) || cause.message !== 'Reauthentication flow closed') throw cause;
    }
    checkAccount();
    actions.status('Confirming permission to add a passkey...');
    // Also check after an ordinary resolution: SDK methods can handle errors
    // internally. Never start enrollment just because a promise resolved.
    if (await actions.needsVerification() !== false) throw new Error(unconfirmedAccountMessage);
    checkAccount();
  }
  actions.status('Waiting for your device. Complete the passkey prompt in your browser.');
  requirePasskeyVerification(await actions.register());
  checkAccount();
}

export function passkeyErrorMessage(cause: unknown): string {
  const error = cause && typeof cause === 'object' ? cause as { name?: unknown; message?: unknown; code?: unknown } : undefined;
  if (error?.message === 'Reauthentication flow closed') return unconfirmedAccountMessage;
  if (error?.name === 'NotAllowedError') return 'The passkey prompt was cancelled, timed out, or was blocked by your browser. Keep this page focused and try again; use your device or a supported password manager when prompted.';
  if (error?.name === 'InvalidStateError' || error?.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') return 'This passkey is already registered. Open Account & Security to check it, then sign out and use Sign in with passkey.';
  if (error?.name === 'SecurityError') return 'This browser could not use a passkey for this website. Open https://monad-astheris.vercel.app directly in a supported browser and try again.';
  if (error?.name === 'NotSupportedError') return 'This device or password manager does not support the requested passkey. Choose another supported authenticator.';
  return typeof error?.message === 'string' && error.message.trim() ? error.message.slice(0, 300) : 'The passkey request could not be completed. Open Account & Security to check your account and try again.';
}
