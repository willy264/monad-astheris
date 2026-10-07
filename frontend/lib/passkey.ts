export const unconfirmedPasskeyMessage = 'Dynamic did not confirm this passkey request. Open your wallet profile and choose Account & Security to check your passkeys, or sign out and reconnect your account before trying again.';

// Dynamic 5.9.2 can resolve undefined after handling an API error internally.
// Only a verification response establishes completion; a resolved promise does not.
export function requirePasskeyVerification(response: unknown): void {
  if (!response || typeof response !== 'object' || !('user' in response)
    || !response.user || typeof response.user !== 'object') {
    throw new Error(unconfirmedPasskeyMessage);
  }
}

export async function registerAccountPasskey(actions: {
  needsVerification(): Promise<boolean>;
  verifyAccount(): Promise<unknown>;
  register(): Promise<unknown>;
  status(message: string): void;
}): Promise<void> {
  actions.status('Checking your account before adding a passkey...');
  if (await actions.needsVerification()) {
    actions.status('Confirm your account in the Dynamic prompt, then create your passkey.');
    await actions.verifyAccount();
  }
  actions.status('Waiting for your device. Complete the passkey prompt in your browser.');
  requirePasskeyVerification(await actions.register());
}

export function passkeyErrorMessage(cause: unknown): string {
  const error = cause && typeof cause === 'object' ? cause as { name?: unknown; message?: unknown; code?: unknown } : undefined;
  if (error?.name === 'NotAllowedError') return 'The passkey prompt was cancelled, timed out, or was blocked by your browser. Keep this page focused and try again; use your device or a supported password manager when prompted.';
  if (error?.name === 'InvalidStateError' || error?.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') return 'This passkey is already registered. Open Account & Security to check it, then sign out and use Sign in with passkey.';
  if (error?.name === 'SecurityError') return 'This browser could not use a passkey for this website. Open https://monad-astheris.vercel.app directly in a supported browser and try again.';
  if (error?.name === 'NotSupportedError') return 'This device or password manager does not support the requested passkey. Choose another supported authenticator.';
  return typeof error?.message === 'string' && error.message.trim() ? error.message.slice(0, 300) : 'The passkey request could not be completed. Open Account & Security to check your account and try again.';
}
