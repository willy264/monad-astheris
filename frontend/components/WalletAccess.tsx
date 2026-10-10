'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DynamicWidget, useDynamicClient, useDynamicContext, useProjectSettings, useRegisterPasskey, useSignInWithPasskey, useStepUpAuthentication } from '@dynamic-labs/sdk-react-core';
import { TokenScope } from '@dynamic-labs/sdk-api-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import { isAddress, type Address, type Hash } from 'viem';
import { contracts, explorerAddress, explorerTx, identityAbi, monadTestnet, routerAbi, truncate, walletPublicClient } from '@/lib/contracts';
import { Notice } from './Shared';
import { requireDelegationTarget, verifyDelegationReceipt } from '@/lib/delegation';
import { userErrorMessage } from '@/lib/user-error';
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
  const isConnectedExecutor = Boolean(primaryWallet && isAddress(delegate) && delegate.toLowerCase() === primaryWallet.address.toLowerCase());
  const [hours, setHours] = useState('1');
  const [busy, setBusy] = useState(false);
  const validAgentId = /^\d{1,78}$/.test(agentId) && BigInt(agentId) > 0n && BigInt(agentId) < 2n ** 256n;
  const walletAddress = primaryWallet?.address.toLowerCase();
  const ownership = useQuery({
    queryKey: ['delegation-owner', contracts.identity, agentId, walletAddress],
    enabled: Boolean(primaryWallet && contracts.identity && validAgentId),
    retry: false,
    staleTime: 10000,
    refetchInterval: busy ? false : 30000,
    queryFn: () => walletPublicClient.readContract({ address: contracts.identity!, abi: identityAbi, functionName: 'ownerOf', args: [BigInt(agentId)] }),
  });
  const ownsAgent = Boolean(ownership.data && ownership.data.toLowerCase() === walletAddress);
  const canManage = ownsAgent && !ownership.isError && !ownership.isFetching;
  const session = `${walletAddress}:${agentId}`;
  const currentSession = useRef(session);
  currentSession.current = session;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const appliedAgentId = useRef(initialAgentId);
  useEffect(() => { if (!busy && appliedAgentId.current !== initialAgentId) { setAgentId(initialAgentId); appliedAgentId.current = initialAgentId; } }, [initialAgentId, busy]);
  const [error, setError] = useState('');
  const [hash, setHash] = useState<Hash>();
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => { setError(''); setHash(undefined); setConfirmed(false); }, [session]);
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
    if (!/^\d{1,78}$/.test(agentId) || BigInt(agentId) < 1n || BigInt(agentId) >= 2n ** 256n || !isAddress(delegate)) { setError('Enter a positive agent ID and a valid executor address.'); return; }
    if (!['0', '1', '6', '24', '168'].includes(hours)) { setError('Choose a supported authorization duration.'); return; }
    if (!canManage) { setError('Only this agent\'s current owner can manage executor permissions. Use guided setup for an agent owned by your wallet.'); return; }
    const origin = session;
    const signer = primaryWallet.address as Address;
    const assertCurrent = () => { if (!mounted.current || currentSession.current !== origin) throw new Error('The selected wallet or agent changed. Check ownership again before continuing.'); };
    setBusy(true);
    try {
      // Ownership is a read-only preflight: an unrelated wallet should never
      // receive a network switch or signing prompt for this agent.
      const [owner, routerIdentity, chainId] = await Promise.all([
        walletPublicClient.readContract({ address: contracts.identity, abi: identityAbi, functionName: 'ownerOf', args: [BigInt(agentId)] }),
        walletPublicClient.readContract({ address: contracts.router, abi: routerAbi, functionName: 'identityRegistry' }),
        walletPublicClient.getChainId(),
      ]);
      assertCurrent();
      if (chainId !== monadTestnet.id) throw new Error('The RPC is not on Monad Testnet.');
      if (routerIdentity.toLowerCase() !== contracts.identity.toLowerCase()) throw new Error('The router belongs to a different identity registry. Correct the deployment configuration before authorizing an executor.');
      requireDelegationTarget(owner, signer, delegate, hours === '0');
      const client = await withWalletPrompt(async () => {
        const wallet = await primaryWallet.getWalletClient();
        assertCurrent();
        if (await wallet.getChainId() !== monadTestnet.id) await wallet.switchChain({ id: monadTestnet.id });
        return wallet;
      });
      assertCurrent();
      const expiresAt = hours === '0' ? 0n : BigInt(Math.floor(Date.now() / 1000) + Number(hours) * 3600);
      const { request } = await walletPublicClient.simulateContract({ address: contracts.router, abi: routerAbi, functionName: 'setDelegate', args: [BigInt(agentId), delegate, expiresAt], account: signer });
      const transaction = await withWalletPrompt(async () => {
        const [accounts, walletChain] = await Promise.all([client.getAddresses(), client.getChainId()]);
        assertCurrent();
        if (accounts[0]?.toLowerCase() !== signer.toLowerCase() || client.account?.address.toLowerCase() !== signer.toLowerCase() || walletChain !== monadTestnet.id) throw new Error('The selected wallet or network changed. Return to the agent owner on Monad Testnet.');
        return client.writeContract({ ...request, account: signer, chain: monadTestnet });
      });
      if (mounted.current && currentSession.current === origin) setHash(transaction);
      const receipt = await walletPublicClient.waitForTransactionReceipt({ hash: transaction, confirmations: 1, timeout: 120000 });
      verifyDelegationReceipt(receipt, transaction, contracts.router, owner);
      if (mounted.current && currentSession.current === origin) setConfirmed(true);
    } catch (cause) { if (mounted.current && currentSession.current === origin) setError(userErrorMessage(cause, 'The delegation request could not be confirmed. Check your wallet activity before trying again.')); }
    finally { setBusy(false); }
  }
  return <div className="wallet-access"><div className="wallet-login"><div><h3>Your wallet. Your agents.</h3><p>Sign in with email or a wallet, then manage your agent's execution permissions.</p></div><DynamicWidget /></div><div className="passkey-actions"><button className="button" type="button" disabled={passkeyBusy || busy || (!user && !passkeyLoginEnabled)} onClick={() => void authenticatePasskey()}>{passkeyBusy ? 'Waiting for your device…' : user ? 'Register a passkey' : 'Sign in with passkey'}</button><span className="muted-text">{!projectSettings ? 'Loading sign-in options…' : !user && !passkeyLoginEnabled ? 'Passkey sign-in is not enabled yet. Use email or a wallet to get started.' : user ? 'Add device authentication to this account.' : 'Use a passkey previously registered on this site. New here? Sign in with email or a wallet first.'}</span>{user && <button className="button button-small" type="button" disabled={passkeyBusy || busy} onClick={() => setShowDynamicUserProfile(true)}>Open wallet profile</button>}</div>
    {passkeyMessage && <Notice>{passkeyMessage}</Notice>}{passkeyError && <Notice error>{passkeyError}</Notice>}{passkeySlow && <Notice>Still waiting. Check your browser or password manager for a passkey prompt. On Windows, Windows Hello may ask for your PIN. If you cancel the prompt, you can retry here.</Notice>}
    {primaryWallet && validAgentId && contracts.identity && <div aria-live="polite">
      {ownership.isPending ? <Notice>Checking who owns Agent #{agentId}...</Notice> : ownership.isError ? <Notice error>Ownership could not be checked. <button className="text-link" type="button" disabled={ownership.isFetching || busy} onClick={() => void ownership.refetch()}>Check ownership again</button></Notice> : ownsAgent ? <Notice>Your connected wallet owns Agent #{agentId}. For the live task demo, <a className="text-link" href="/#interactive-demo">authorize its executor in guided setup</a>. Use this form to manage a different executor.</Notice> : ownership.data ? <Notice>Agent #{agentId} belongs to <a className="text-link" href={explorerAddress(ownership.data)} target="_blank" rel="noreferrer">{truncate(ownership.data)}</a>. Only that owner can change its executor permissions. <a className="text-link" href="/#interactive-demo">Continue with your own agent</a>.</Notice> : null}
    </div>}
    <form className="delegate-form" onSubmit={authorize}><div className="form-field"><label htmlFor="agent-id">Agent ID</label><input id="agent-id" value={agentId} onChange={(event) => setAgentId(event.target.value)} placeholder="e.g. 1" inputMode="numeric" required disabled={busy} /></div><div className="form-field executor-field"><label htmlFor="executor">Executor wallet</label><input id="executor" value={delegate} onChange={(event) => setDelegate(event.target.value)} placeholder="0x…" autoComplete="off" required disabled={busy} /></div><div className="form-field"><label htmlFor="duration">Authorization</label><select id="duration" value={hours} onChange={(event) => setHours(event.target.value)} disabled={busy}><option value="1">1 hour</option><option value="6">6 hours</option><option value="24">24 hours</option><option value="168">7 days</option><option value="0">Revoke access</option></select></div><button className="button button-primary" type="submit" disabled={busy || !primaryWallet || !canManage || isConnectedExecutor}>{busy ? 'Confirming…' : hours === '0' ? 'Revoke executor' : 'Authorize executor'}</button></form>
    {canManage && isConnectedExecutor && <Notice>You entered your connected wallet. Agent owners already have task authority, which cannot be revoked here. Enter a different executor address. For Aetheris tasks, <a className="text-link" href="/#interactive-demo">use guided setup to authorize the task executor</a>.</Notice>}
    <p className="form-note">The executor may create and execute tasks for this agent until expiry. This permission does not transfer the agent identity or grant access to wallet funds.</p>
    {error && <Notice error>{error}</Notice>}{hash && <Notice>{confirmed ? 'Delegation confirmed.' : 'Transaction submitted; awaiting confirmation.'} <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="text-link">View transaction ↗</a></Notice>}
  </div>;
}
