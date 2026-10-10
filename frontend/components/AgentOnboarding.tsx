'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import { formatEther, formatUnits, type Hex } from 'viem';
import { explorerAddress, explorerTx, truncate } from '@/lib/contracts';
import { address, type DemoConfig } from '@/lib/demo-protocol';
import { authorizeExecutors, getSetupState, persistVerifiedSelection, recoverSetup, registerOwnedAgent } from '@/lib/onboarding-client';
import { useAccessSession } from './AccessContext';
import { userErrorMessage } from '@/lib/user-error';
import { Icon } from './Icon';
import styles from './AgentOnboarding.module.css';

// The faucet and six-decimal display apply only to this documented Circle asset.
// https://docs.monad.xyz/guides/x402
const circleTestnetUsdc = '0x534b2f3a21130d7a60830c2df862319e593943a3';
const stepNames = ['Connect', 'Register', 'Authorize', 'Fund', 'Run'];

interface Props {
  config: DemoConfig;
  onReady(config: DemoConfig | undefined): void;
  onSelection?(config: DemoConfig | undefined): void;
  onBusy?(busy: boolean): void;
  onSettled?(): void;
  disabled?: boolean;
}

export default function AgentOnboarding({ config, onReady, onSelection, onBusy, onSettled, disabled = false }: Props) {
  const { primaryWallet, network, setShowAuthFlow, setShowDynamicUserProfile } = useDynamicContext();
  const { withWalletPrompt } = useAccessSession();
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<{ identity: string; agentId: string }>();
  const [existingId, setExistingId] = useState('');
  const [recoveryHash, setRecoveryHash] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const callbacks = useRef({ onReady, onSelection, onBusy, onSettled });
  callbacks.current = { onReady, onSelection, onBusy, onSettled };

  const walletAddress = primaryWallet && isEthereumWallet(primaryWallet) ? address(primaryWallet.address) : undefined;
  const identity = JSON.stringify([walletAddress?.toLowerCase(), config.chainId, config.router.toLowerCase(), config.identity.toLowerCase(), config.relayers.map(value => value.toLowerCase()), config.policy, config.challenge]);
  const selectedAgentId = selection?.identity === identity ? selection.agentId : undefined;
  const scope = `${identity}:${String(network)}:${selectedAgentId ?? ''}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const queryKey = ['agent-onboarding', scope] as const;
  const setup = useQuery({
    queryKey,
    enabled: Boolean(walletAddress),
    retry: false,
    staleTime: 0,
    refetchInterval: busy || disabled ? false : 15000,
    refetchOnWindowFocus: !busy && !disabled,
    queryFn: async () => {
      if (!primaryWallet || !isEthereumWallet(primaryWallet) || !walletAddress) throw new Error('Connect an EVM wallet to set up your agent.');
      const wallet = await primaryWallet.getWalletClient();
      const [state, chainId] = await Promise.all([getSetupState(config, walletAddress, selectedAgentId), wallet.getChainId()]);
      return { state, chainId };
    },
  });
  const state = setup.data?.state;
  const onMonad = setup.data?.chainId === 10143 && (network === undefined || Number(network) === 10143);
  const ownerVerified = Boolean(state?.agentId && state.owner?.toLowerCase() === walletAddress?.toLowerCase());
  const executorsReady = Boolean(state && state.executors.length > 0 && state.executors.every(executor => executor.validForDemo));
  const paymentReady = Boolean(state && state.paymentBalance >= state.paymentRequired);
  const pending = state?.pending;
  const signerIsRelayer = Boolean(walletAddress && config.relayers.some(relayer => relayer.toLowerCase() === walletAddress.toLowerCase()));
  const locked = busy || disabled;
  const ready = Boolean(state?.ready && ownerVerified && onMonad && !signerIsRelayer && !locked && !setup.isFetching && !setup.isError);
  const readyConfig = useMemo(() => ready && state?.agentId ? { ...config, agentId: state.agentId } : undefined, [ready, state?.agentId, config]);
  const selectionConfig = useMemo(() => ownerVerified && onMonad && !signerIsRelayer && !setup.isError && state?.agentId ? { ...config, agentId: state.agentId } : undefined, [ownerVerified, onMonad, signerIsRelayer, setup.isError, state?.agentId, config]);

  useLayoutEffect(() => { callbacks.current.onReady(readyConfig); }, [scope, readyConfig]);
  useLayoutEffect(() => { callbacks.current.onSelection?.(selectionConfig); }, [scope, selectionConfig]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; callbacks.current.onReady(undefined); callbacks.current.onSelection?.(undefined); callbacks.current.onBusy?.(false); };
  }, []);
  useEffect(() => { setMessage(''); setError(''); setCopied(false); setRecoveryHash(''); setExistingId(''); }, [identity]);
  useEffect(() => { callbacks.current.onBusy?.(busy); }, [busy]);

  async function act(kind: 'register' | 'authorize' | 'recover' | 'switch') {
    if (busyRef.current || disabled || !walletAddress || !primaryWallet || !isEthereumWallet(primaryWallet)) return;
    const origin = scope;
    const isCurrent = () => mounted.current && currentScope.current === origin;
    const options = { isCurrent, onUpdate: (value: string) => { if (isCurrent()) setMessage(value); } };
    busyRef.current = true;
    setBusy(true); setError(''); setMessage('');
    callbacks.current.onReady(undefined);
    try {
      if (kind === 'recover') {
        const hash = recoveryHash.trim();
        if (hash && !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('Enter the transaction hash from your wallet or explorer.');
        const result = await recoverSetup(config, walletAddress, hash ? hash as Hex : undefined, options);
        if (isCurrent()) { queryClient.setQueryData(queryKey, { state: result, chainId: setup.data?.chainId }); setMessage('Saved setup status checked. No transaction was sent again.'); }
      } else {
        const wallet = await primaryWallet.getWalletClient();
        if (!isCurrent()) return;
        if (kind === 'switch') {
          await withWalletPrompt(() => wallet.switchChain({ id: 10143 }));
          if (isCurrent()) await setup.refetch();
          return;
        }
        if (signerIsRelayer) throw new Error('Choose a separate wallet to own and sign tasks for your agent. This wallet is already a daemon relayer.');
        if (await wallet.getChainId() !== 10143) throw new Error('Switch this wallet to Monad Testnet before continuing.');
        if (!isCurrent()) return;
        const result = await withWalletPrompt(() => kind === 'register'
          ? registerOwnedAgent(config, wallet, walletAddress, options)
          : authorizeExecutors(config, wallet, walletAddress, state?.agentId ?? '', options));
        if (isCurrent()) {
          queryClient.setQueryData(queryKey, { state: result, chainId: 10143 });
          setMessage(kind === 'register' ? `Agent #${result.agentId} belongs to your wallet. Authorize its executor next.` : 'Executor permissions confirmed. Check your payment balance before running.');
          callbacks.current.onSettled?.();
          void queryClient.invalidateQueries({ queryKey: ['agents'] });
          void queryClient.invalidateQueries({ queryKey: ['snapshot'] });
        }
      }
    } catch (cause) {
      if (isCurrent()) { setError(userErrorMessage(cause, 'This step could not finish. Check the saved status before trying again.')); await setup.refetch(); }
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function selectExisting(event: FormEvent) {
    event.preventDefault();
    if (locked || busyRef.current || pending || !walletAddress) return;
    const value = existingId.trim();
    if (!/^[1-9][0-9]{0,77}$/.test(value) || BigInt(value) >= 2n ** 256n) { setError('Enter a positive agent token ID. Ownership will be checked on Monad Testnet.'); return; }
    const origin = scope;
    const isCurrent = () => mounted.current && currentScope.current === origin;
    busyRef.current = true;
    setBusy(true); setError(''); setMessage('Checking that this wallet owns the selected agent…');
    callbacks.current.onReady(undefined);
    try {
      const result = await persistVerifiedSelection(config, walletAddress, value, {
        isCurrent,
        onUpdate: update => { if (isCurrent()) setMessage(update); },
      });
      if (!isCurrent()) return;
      if (selectedAgentId === value) queryClient.setQueryData(queryKey, { state: result, chainId: setup.data?.chainId });
      setSelection({ identity, agentId: value });
      setMessage(`Agent #${value} is owned by this wallet and saved for your next visit.`);
    } catch (cause) {
      if (isCurrent()) setError(userErrorMessage(cause, 'Ownership could not be verified. Your saved agent selection was not changed.'));
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function copyWallet() {
    if (!walletAddress) return;
    try { await navigator.clipboard.writeText(walletAddress); if (mounted.current) setCopied(true); }
    catch { setError('Clipboard access is unavailable. Select and copy the wallet address shown above.'); }
  }

  const circleAsset = config.policy.asset.toLowerCase() === circleTestnetUsdc;
  const tokenAmount = (value: bigint) => circleAsset ? `${formatUnits(value, 6)} USDC` : `${value.toString()} base units`;
  const currentStep = !walletAddress || !onMonad ? 0 : !ownerVerified ? 1 : !executorsReady ? 2 : !paymentReady ? 3 : 4;
  const canWrite = Boolean(walletAddress && onMonad && state && state.monBalance > 0n && !signerIsRelayer && !pending && !locked && !setup.isFetching && !setup.isError);

  return <section className={styles.card} aria-labelledby="agent-setup-title" data-testid="agent-onboarding">
    <div className={styles.heading}><div><span className={styles.eyebrow}>YOUR WALLET · YOUR AGENT</span><h3 id="agent-setup-title">Get ready for a live run</h3></div><span className={ready ? styles.ready : styles.status}>{ready ? 'Ready to run' : busy ? 'Wallet step in progress' : 'One-time setup'}</span></div>
    <ol className={styles.steps} aria-label="Agent setup progress">{stepNames.map((label, index) => <li key={label} data-complete={index < currentStep} aria-current={index === currentStep ? 'step' : undefined}><span>{index < currentStep ? '✓' : index + 1}</span><div>{label}<small>{index < currentStep ? 'Complete' : index === currentStep ? 'Current step' : 'Next'}</small></div></li>)}</ol>

    {!primaryWallet ? <div className={styles.current}><h4>Connect the wallet that will own your agent.</h4><p>Choose email, a wallet, or an existing passkey in the sign-in window. Registration and executor approval happen after you connect.</p><button type="button" className={styles.primary} disabled={locked} onClick={() => setShowAuthFlow(true)}>Connect wallet to begin <Icon name="arrow" size={16} /></button></div> : !walletAddress ? <div className={styles.current}><h4>Select an EVM wallet.</h4><p>Monad Testnet uses an Ethereum-compatible wallet. Open your wallet profile to choose one.</p><button type="button" className={styles.primary} disabled={locked} onClick={() => setShowDynamicUserProfile(true)}>Choose an EVM wallet</button></div> : <>
      <div className={styles.account}><div><span>Connected wallet</span><a href={explorerAddress(walletAddress)} target="_blank" rel="noreferrer">{walletAddress}<Icon name="external" size={13} /></a></div><div className={styles.actions}><button type="button" className={styles.smallButton} onClick={() => void copyWallet()}>{copied ? 'Address copied' : 'Copy address'}</button><button type="button" className={styles.textButton} disabled={locked} onClick={() => setShowDynamicUserProfile(true)}>Change wallet</button></div></div>
      {signerIsRelayer ? <div className={styles.notice}><strong>Use a separate task wallet.</strong><p>This wallet already submits transactions for the daemon. Connect another wallet, then register an agent that it owns. You will authorize the daemon to work for that agent.</p></div> : !state && setup.isPending ? <p className={styles.note} role="status">Checking your saved agent, network, and balances…</p> : <>
        {setup.data && !onMonad && <div className={styles.notice}><strong>Switch to Monad Testnet · 10143</strong><p>Registration, executor permissions, and test tokens all use the same testnet.</p><button type="button" className={styles.secondary} disabled={locked} onClick={() => void act('switch')}>Switch network in wallet</button></div>}
        {state && <>
          <div className={styles.balances}><div><span>MON for setup gas</span><strong>{formatEther(state.monBalance)} <small>MON</small></strong></div><div><span>Testnet payment balance</span><strong>{tokenAmount(state.paymentBalance)}</strong><small>{tokenAmount(state.paymentRequired)} needed for five tasks</small></div></div>
          {state.agentId && !ownerVerified && <div className={styles.notice}><strong>Agent #{state.agentId} belongs to another wallet.</strong><p>Enter an ID this wallet owns, or clear this selection to register your own agent.</p><button type="button" className={styles.textButton} disabled={locked} onClick={() => { setSelection(undefined); setExistingId(''); setError(''); }}>Use my saved setup</button></div>}{state.monBalance === 0n && (!ownerVerified || !executorsReady) && <div className={styles.notice}><strong>Add testnet MON before approving setup.</strong><p>This wallet has 0 MON. Registering an agent and granting execution permission each use real testnet gas. Claim MON for the connected address, then check balances.</p><a className={styles.link} href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">Get testnet MON <Icon name="external" size={13} /></a></div>}
          {pending ? <div className={styles.current}><h4>Recover the saved {pending.kind === 'register' ? 'registration' : 'executor approval'}.</h4><p>{pending.transactionHash ? 'Check the submitted transaction before starting another setup action.' : 'A wallet request was saved without a transaction hash. If your wallet submitted it, paste its hash below so the exact receipt can be checked.'}</p>{pending.transactionHash ? <a className={styles.link} href={explorerTx(pending.transactionHash)} target="_blank" rel="noreferrer">View submitted transaction <Icon name="external" size={13} /></a> : <label className={styles.field}>Transaction hash from your wallet<input value={recoveryHash} onChange={event => setRecoveryHash(event.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} disabled={locked} /></label>}<button type="button" className={styles.secondary} disabled={locked} onClick={() => void act('recover')}>Check saved transaction</button><p className={styles.note}>Recovery only reads receipts. It does not send the transaction again.</p></div> : !ownerVerified ? <div className={styles.current}><h4>Register an agent owned by this wallet.</h4><p>Your agent card describes the browser’s checksum demo. Your wallet will approve the registration transaction.</p><button type="button" className={styles.primary} disabled={!canWrite} onClick={() => void act('register')}>Register my agent <Icon name="arrow" size={16} /></button></div> : !executorsReady ? <div className={styles.current}><h4>Authorize the daemon for Agent #{state.agentId}.</h4><p>Grant each listed executor permission for one hour. Your wallet approves each transaction; your agent stays yours.</p><ul className={styles.executors}>{state.executors.map(executor => <li key={executor.address}><a href={explorerAddress(executor.address)} target="_blank" rel="noreferrer">{truncate(executor.address, 8)}</a><span>{executor.validForDemo ? 'Authorized' : 'Approval needed'}</span></li>)}</ul><button type="button" className={styles.primary} disabled={!canWrite} onClick={() => void act('authorize')}>Authorize for 1 hour <Icon name="shield" size={16} /></button></div> : <div className={styles.current}><h4>{ready ? `Agent #${state.agentId} is ready for five tasks.` : `Fund Agent #${state.agentId}’s task wallet.`}</h4><p>{ready ? 'Your ownership, executor permissions, and payment balance have been checked. Continue to the task controls below; each task still needs your signatures.' : `Your identity and executor permissions are set. Add ${tokenAmount(state.paymentRequired)} or more to the connected wallet for the five-task payment.`}</p></div>}
          <div className={styles.funding}><div><strong>Fund this wallet on Monad Testnet · 10143</strong><p>Payment token: <a href={explorerAddress(config.policy.asset)} target="_blank" rel="noreferrer">{config.policy.name} · {config.policy.asset}</a></p>{circleAsset ? <p>In Circle’s faucet, select USDC and Monad Testnet, then paste your connected wallet address.</p> : <p>Use this exact testnet token address when funding your wallet.</p>}</div><div className={styles.actions}><a className={styles.smallButton} href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">MON faucet ↗</a>{circleAsset && <a className={styles.smallButton} href="https://faucet.circle.com" target="_blank" rel="noreferrer">USDC faucet ↗</a>}<button type="button" className={styles.smallButton} disabled={locked || setup.isFetching} onClick={() => void setup.refetch()}>{setup.isFetching ? 'Checking…' : 'Check balances & status'}</button></div></div>
          <div className={styles.receipts}>{state.registrationTx && <a className={styles.link} href={explorerTx(state.registrationTx)} target="_blank" rel="noreferrer">Agent #{state.agentId} registration receipt <Icon name="external" size={13} /></a>}{state.executors.filter(executor => executor.transactionHash).map(executor => <a key={executor.address} className={styles.link} href={explorerTx(executor.transactionHash!)} target="_blank" rel="noreferrer">Executor {truncate(executor.address, 4)} approval receipt <Icon name="external" size={13} /></a>)}</div>
        </>}
        {!pending && <details className={styles.existing}><summary>Already own an agent? Use its token ID.</summary><form onSubmit={selectExisting}><label className={styles.field}>Your agent’s token ID<input inputMode="numeric" value={existingId} onChange={event => setExistingId(event.target.value)} placeholder="Agent token ID" disabled={locked} /></label><button type="submit" className={styles.secondary} disabled={locked}>Check ownership</button></form>{selectedAgentId && <button type="button" className={styles.textButton} disabled={locked} onClick={() => { setSelection(undefined); setExistingId(''); setError(''); }}>Clear selected ID and use my saved setup</button>}<p className={styles.note}>Only an agent owned by this connected wallet can be selected.</p></details>}
      </>}
    </>}
    {message && <p className={styles.note} role="status">{message}</p>}
    {(error || setup.error) && <div className={styles.error} role="alert"><p>{error || userErrorMessage(setup.error, 'Setup could not be checked. Try checking its status again.')}</p><button type="button" className={styles.textButton} disabled={locked || setup.isFetching} onClick={() => { setError(''); void setup.refetch(); }}>Check setup again</button></div>}
  </section>;
}
