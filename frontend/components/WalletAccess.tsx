'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DynamicWidget, useDynamicClient, useDynamicContext, useProjectSettings, useRegisterPasskey, useSignInWithPasskey, useStepUpAuthentication } from '@dynamic-labs/sdk-react-core';
import { TokenScope } from '@dynamic-labs/sdk-api-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import { isAddress, type Hash } from 'viem';
import { contracts, explorerTx, identityAbi, monadTestnet, routerAbi, walletPublicClient } from '@/lib/contracts';
import { Notice } from './Shared';
import { verifyDelegationReceipt } from '@/lib/delegation';
import { useAccessSession } from './AccessContext';
import { passkeyErrorMessage, registerAccountPasskey, requirePasskeyVerification } from '@/lib/passkey';

export default function WalletAccess({ initialAgentId = '1' }: { initialAgentId?: string }) {
  const { withWalletPrompt } = useAccessSession();
  const { primaryWallet, user, setShowDynamicUserProfile } = useDynamicContext();
  const dynamicClient = useDynamicClient();
  const projectSettings = useProjectSettings();
  const passkeyLoginEnabled = projectSettings?.providers?.some(provider => provider.provider === 'passkey' && Boolean(provider.enabledAt)) ?? false;
  const signInWithPasskey = useSignInWithPasskey();
  const registerPasskey = useRegisterPasskey();
  const { isStepUpRequired, promptStepUpAuth, resetState } = useStepUpAuthentication();
  const [agentId, setAgentId] = useState(initialAgentId);
  const [delegate, setDelegate] = useState('');
  const [hours, setHours] = useState('1');
  const [busy, setBusy] = useState(false);
  const appliedAgentId = useRef(initialAgentId);
  useEffect(() => { if (!busy && appliedAgentId.current !== initialAgentId) { setAgentId(initialAgentId); appliedAgentId.current = initialAgentId; } }, [initialAgentId, busy]);
  const [error, setError] = useState('');
  const [hash, setHash] = useState<Hash>();
  const [confirmed, setConfirmed] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyMessage, setPasskeyMessage] = useState('');
  const [passkeyError, setPasskeyError] = useState('');
  const [passkeySlow, setPasskeySlow] = useState(false);
  const passkeyInFlight = useRef(false);
  useEffect(() => {
    if (!passkeyBusy) { setPasskeySlow(false); return; }
    const timer = window.setTimeout(() => setPasskeySlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, [passkeyBusy]);
  async function authenticatePasskey() {
    if (passkeyInFlight.current) return;
    setPasskeyError(''); setPasskeyMessage(''); resetState();
    if (!user && !passkeyLoginEnabled) { setPasskeyError('Passkey sign-in is not enabled. Sign in with a wallet or email first.'); return; }
    if (!window.isSecureContext || !window.PublicKeyCredential) { setPasskeyError('Passkeys require a supported browser on HTTPS or localhost.'); return; }
    passkeyInFlight.current = true;
    setPasskeyBusy(true);
    try {
      if (user) {
        await registerAccountPasskey({
          getAccountId: () => dynamicClient.user?.id,
          needsVerification: () => isStepUpRequired({ scope: TokenScope.Credentiallink }),
          verifyAccount: () => withWalletPrompt(() => promptStepUpAuth({ requestedScopes: [TokenScope.Credentiallink] })),
          // Native WebAuthn prompts work above the dialog. Keep progress visible;
          // only Dynamic's portal-based reauthentication needs to close it.
          register: registerPasskey,
          status: setPasskeyMessage,
        });
        setPasskeyMessage('Passkey registered for this account. To verify sign-in, sign out through the wallet menu, then choose Sign in with passkey.');
      } else {
        setPasskeyMessage('Waiting for your device. Use a passkey previously registered on this website.');
        requirePasskeyVerification(await signInWithPasskey());
        setPasskeyMessage('Passkey sign-in completed.');
      }
    } catch (cause) { setPasskeyMessage(''); setPasskeyError(passkeyErrorMessage(cause)); }
    finally { passkeyInFlight.current = false; setPasskeyBusy(false); }
  }
  async function authorize(event: FormEvent) {
    event.preventDefault(); setError(''); setHash(undefined); setConfirmed(false);
    if (!contracts.router || !contracts.identity) { setError('The router and identity registry must be configured.'); return; }
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) { setError('Connect an EVM wallet to continue.'); return; }
    if (!/^\d+$/.test(agentId) || BigInt(agentId) < 1n || BigInt(agentId) >= 2n ** 256n || !isAddress(delegate)) { setError('Enter a positive agent ID and a valid executor address.'); return; }
    if (!['0', '1', '6', '24', '168'].includes(hours)) { setError('Choose a supported authorization duration.'); return; }
    setBusy(true);
    try {
      const client = await withWalletPrompt(async () => {
        const wallet = await primaryWallet.getWalletClient();
        if (await wallet.getChainId() !== monadTestnet.id) await wallet.switchChain({ id: monadTestnet.id });
        return wallet;
      });
      const [owner, routerIdentity] = await Promise.all([
        walletPublicClient.readContract({ address: contracts.identity, abi: identityAbi, functionName: 'ownerOf', args: [BigInt(agentId)] }),
        walletPublicClient.readContract({ address: contracts.router, abi: routerAbi, functionName: 'identityRegistry' }),
      ]);
      if (routerIdentity.toLowerCase() !== contracts.identity.toLowerCase()) throw new Error('The router belongs to a different identity registry. Correct the deployment configuration before authorizing an executor.');
      if (owner.toLowerCase() !== primaryWallet.address.toLowerCase()) throw new Error('Only the current agent identity owner can manage this delegation.');
      const expiresAt = hours === '0' ? 0n : BigInt(Math.floor(Date.now() / 1000) + Number(hours) * 3600);
      const { request } = await walletPublicClient.simulateContract({ address: contracts.router, abi: routerAbi, functionName: 'setDelegate', args: [BigInt(agentId), delegate, expiresAt], account: client.account });
      const transaction = await withWalletPrompt(() => client.writeContract({ ...request, chain: monadTestnet }));
      setHash(transaction);
      const receipt = await walletPublicClient.waitForTransactionReceipt({ hash: transaction, confirmations: 1, timeout: 120000 });
      verifyDelegationReceipt(receipt, transaction, contracts.router, owner);
      setConfirmed(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message.slice(0, 300) : 'Wallet request failed.'); }
    finally { setBusy(false); }
  }
  return <div className="wallet-access"><div className="wallet-login"><div><h3>Your wallet. Your agents.</h3><p>Sign in with email or a wallet, then manage your agent's execution permissions.</p></div><DynamicWidget /></div><div className="passkey-actions"><button className="button" type="button" disabled={passkeyBusy || busy || (!user && !passkeyLoginEnabled)} onClick={() => void authenticatePasskey()}>{passkeyBusy ? 'Waiting for your device…' : user ? 'Register a passkey' : 'Sign in with passkey'}</button><span className="muted-text">{!projectSettings ? 'Loading sign-in options…' : !user && !passkeyLoginEnabled ? 'Passkey sign-in is not enabled yet. Use email or a wallet to get started.' : user ? 'Add device authentication to this account.' : 'Use a passkey previously registered on this site. New here? Sign in with email or a wallet first.'}</span>{user && <button className="button button-small" type="button" disabled={passkeyBusy || busy} onClick={() => setShowDynamicUserProfile(true)}>Open wallet profile</button>}</div>
    {passkeyMessage && <Notice>{passkeyMessage}</Notice>}{passkeyError && <Notice error>{passkeyError}</Notice>}{passkeySlow && <Notice>Still waiting. Check your browser or password manager for a passkey prompt. On Windows, Windows Hello may ask for your PIN. If you cancel the prompt, you can retry here.</Notice>}
    <form className="delegate-form" onSubmit={authorize}><div className="form-field"><label htmlFor="agent-id">Agent ID</label><input id="agent-id" value={agentId} onChange={(event) => setAgentId(event.target.value)} placeholder="e.g. 1" inputMode="numeric" required disabled={busy} /></div><div className="form-field executor-field"><label htmlFor="executor">Executor wallet</label><input id="executor" value={delegate} onChange={(event) => setDelegate(event.target.value)} placeholder="0x…" autoComplete="off" required disabled={busy} /></div><div className="form-field"><label htmlFor="duration">Authorization</label><select id="duration" value={hours} onChange={(event) => setHours(event.target.value)} disabled={busy}><option value="1">1 hour</option><option value="6">6 hours</option><option value="24">24 hours</option><option value="168">7 days</option><option value="0">Revoke access</option></select></div><button className="button button-primary" type="submit" disabled={busy || !primaryWallet}>{busy ? 'Confirming…' : hours === '0' ? 'Revoke executor' : 'Authorize executor'}</button></form>
    <p className="form-note">The executor may create and execute tasks for this agent until expiry. This permission does not transfer the agent identity or grant access to wallet funds.</p>
    {error && <Notice error>{error}</Notice>}{hash && <Notice>{confirmed ? 'Delegation confirmed.' : 'Transaction submitted; awaiting confirmation.'} <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="text-link">View transaction ↗</a></Notice>}
  </div>;
}
