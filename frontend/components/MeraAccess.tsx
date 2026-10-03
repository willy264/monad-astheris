'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPasskeyWithPrfOutput, getPasskeyPrfOutput, isMeraError, type PasskeyCredentialMetadata, type Secp256k1SigningSession } from '@category-labs/mera';
import { createWalletClient, http, isAddress, type Address, type Hash } from 'viem';
import { openMeraSession } from '@/lib/mera-account';
import { verifyDelegationReceipt } from '@/lib/delegation';
import { contracts, explorerAddress, explorerTx, identityAbi, monadTestnet, routerAbi, walletPublicClient } from '@/lib/contracts';
import { Notice } from './Shared';

function relyingParty() {
  if (!window.isSecureContext || !window.PublicKeyCredential) throw new Error('Mera requires HTTPS or localhost and a browser with passkey support.');
  const rpId = process.env.NEXT_PUBLIC_MERA_RP_ID || window.location.hostname;
  if (rpId !== window.location.hostname && !window.location.hostname.endsWith(`.${rpId}`)) throw new Error('The Mera relying party does not match this website.');
  return rpId;
}
function displayError(error: unknown) {
  if (isMeraError(error)) return error.code === 'PRF_UNAVAILABLE' ? 'This authenticator does not support passkey PRF. Choose a supported passkey provider.' : `Mera ${error.code}: the passkey operation did not complete.`;
  return error instanceof Error ? error.message.slice(0, 300) : 'The Mera request could not be completed.';
}
export default function MeraAccess() {
  const [identity, setIdentity] = useState<{ address: Address; credential: PasskeyCredentialMetadata }>();
  const [label, setLabel] = useState('Aetheris agent owner');
  const [agentId, setAgentId] = useState('');
  const [executor, setExecutor] = useState('');
  const [hours, setHours] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hash, setHash] = useState<Hash>();
  const [confirmed, setConfirmed] = useState(false);
  const sessionRef = useRef<Secp256k1SigningSession>();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const end = () => { sessionRef.current?.end(); sessionRef.current = undefined; };
    window.addEventListener('pagehide', end);
    return () => { mounted.current = false; end(); window.removeEventListener('pagehide', end); };
  }, []);
  async function connect(create: boolean) {
    setBusy(true); setError('');
    try {
      const rpId = relyingParty();
      const result = create ? await createPasskeyWithPrfOutput({ rp: { id: rpId, name: 'Aetheris' }, user: { name: label.trim() || 'Aetheris owner', displayName: label.trim() || 'Aetheris owner' }, timeout: 60000 }) : await getPasskeyPrfOutput({ rpId, timeout: 60000 });
      try {
        if (!mounted.current) return;
        const { session, account } = openMeraSession(result.prfOutput);
        try { setIdentity({ address: account.address, credential: { credentialId: result.credentialId } }); }
        finally { session.end(); }
      } finally { result.prfOutput.fill(0); }
    } catch (cause) { if (mounted.current) setError(displayError(cause)); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function authorize(event: FormEvent) {
    event.preventDefault(); setError(''); setHash(undefined); setConfirmed(false);
    if (!identity || !contracts.router || !contracts.identity) { setError('Connect a Mera owner account and configure the deployed contracts.'); return; }
    if (!/^\d{1,78}$/.test(agentId) || BigInt(agentId) < 1n || BigInt(agentId) >= 2n ** 256n || !isAddress(executor) || !['0', '1', '6', '24'].includes(hours)) { setError('Enter a valid agent ID, executor address and duration.'); return; }
    setBusy(true);
    try {
      const rpId = relyingParty();
      const [chainId, owner, registry] = await Promise.all([
        walletPublicClient.getChainId(),
        walletPublicClient.readContract({ address: contracts.identity, abi: identityAbi, functionName: 'ownerOf', args: [BigInt(agentId)] }),
        walletPublicClient.readContract({ address: contracts.router, abi: routerAbi, functionName: 'identityRegistry' }),
      ]);
      if (chainId !== monadTestnet.id || registry.toLowerCase() !== contracts.identity.toLowerCase()) throw new Error('The RPC and registry must match the configured Monad Testnet deployment.');
      if (owner.toLowerCase() !== identity.address.toLowerCase()) throw new Error('This Mera account must own the agent identity to manage executor access.');
      const expiresAt = hours === '0' ? 0n : BigInt(Math.floor(Date.now() / 1000) + Number(hours) * 3600);
      const { request } = await walletPublicClient.simulateContract({ address: contracts.router, abi: routerAbi, functionName: 'setDelegate', args: [BigInt(agentId), executor, expiresAt], account: identity.address });
      if (!mounted.current) return;
      const result = await getPasskeyPrfOutput({ rpId, credential: identity.credential, timeout: 60000 });
      let transaction: Hash;
      try {
        if (!mounted.current) return;
        const { session, account } = openMeraSession(result.prfOutput); sessionRef.current = session;
        if (account.address.toLowerCase() !== identity.address.toLowerCase()) throw new Error('This passkey derives a different account. Sign in again.');
        const client = createWalletClient({ account, chain: monadTestnet, transport: http(undefined, { timeout: 12000, retryCount: 0 }) });
        transaction = await client.writeContract({ ...request, account, chain: monadTestnet });
      } finally { result.prfOutput.fill(0); sessionRef.current?.end(); sessionRef.current = undefined; }
      if (!mounted.current) return;
      setHash(transaction);
      const receipt = await walletPublicClient.waitForTransactionReceipt({ hash: transaction, timeout: 120000 });
      verifyDelegationReceipt(receipt, transaction, contracts.router, identity.address);
      if (mounted.current) setConfirmed(true);
    } catch (cause) { if (mounted.current) setError(displayError(cause)); }
    finally { sessionRef.current?.end(); sessionRef.current = undefined; if (mounted.current) setBusy(false); }
  }
  return <div className="wallet-access mera-access"><div className="wallet-login"><div><h3>Monad account from your passkey</h3><p>Mera creates a standard EVM account using your passkey. Use the same passkey and website to recover the same address.</p></div><span className="tag tag-cyan">MERA · PREVIEW</span></div>
    {!identity ? <><div className="form-field"><label htmlFor="mera-label">Account label</label><input id="mera-label" value={label} onChange={event => setLabel(event.target.value)} maxLength={80} disabled={busy} /></div><div className="passkey-actions"><button className="button button-primary" disabled={busy} onClick={() => void connect(true)}>Create Mera passkey</button><button className="button" disabled={busy} onClick={() => void connect(false)}>Sign in with Mera</button></div></> : <><Notice>Mera owner: <a className="text-link mono" href={explorerAddress(identity.address)} target="_blank" rel="noreferrer">{identity.address}</a><br />Fund this address with testnet MON and register or transfer an agent identity to it before authorizing an executor.</Notice><button className="button button-small" disabled={busy} onClick={() => setIdentity(undefined)}>Disconnect Mera</button>
    <form className="delegate-form" onSubmit={authorize}><div className="form-field"><label htmlFor="mera-agent">Agent ID</label><input id="mera-agent" inputMode="numeric" required disabled={busy} value={agentId} onChange={event => setAgentId(event.target.value)} /></div><div className="form-field executor-field"><label htmlFor="mera-executor">Executor wallet</label><input id="mera-executor" required autoComplete="off" disabled={busy} value={executor} onChange={event => setExecutor(event.target.value)} placeholder="0x…" /></div><div className="form-field"><label htmlFor="mera-duration">Authorization</label><select id="mera-duration" disabled={busy} value={hours} onChange={event => setHours(event.target.value)}><option value="1">1 hour</option><option value="6">6 hours</option><option value="24">24 hours</option><option value="0">Revoke access</option></select></div><button className="button button-primary" disabled={busy} type="submit">{busy ? 'Confirming…' : hours === '0' ? 'Revoke with passkey' : 'Authorize with passkey'}</button></form></>}
    <p className="form-note">Each delegation asks for your passkey again and sends the displayed router permission. Keep access to your passkey provider and this website: no account recovery service is included. Mera is separate from Dynamic.</p>
    {busy && <p role="status" className="muted-text">Waiting for your device or network…</p>}{error && <Notice error>{error}</Notice>}{hash && <Notice>{confirmed ? 'Delegation confirmed.' : 'Submitted; waiting for confirmation.'} <a className="text-link" href={explorerTx(hash)} target="_blank" rel="noreferrer">View transaction ↗</a></Notice>}
  </div>;
}
