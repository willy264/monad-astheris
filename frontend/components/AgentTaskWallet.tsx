'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import type { Address, Hex } from 'viem';
import { address, type DemoConfig, type DemoJournal, type DemoRecord } from '@/lib/demo-protocol';
import { postDemo, readDemo, recoverDemo, saveDemo, signDemo, type DemoJournalContext } from '@/lib/demo-client';
import { checkObserverAccess, observeAgentTask, type ObserverAccess } from '@/lib/observer-task';
import { explorerTx, truncate } from '@/lib/contracts';
import { userErrorMessage } from '@/lib/user-error';
import { Icon } from './Icon';
import { useAccessSession } from './AccessContext';
import styles from './FeaturedAgent.module.css';

const progress = { submitted: 25, accepted: 50, verifying: 80, verified: 100, unresolved: 25 };
const stageNames = { submitted: 'Submitted', accepted: 'Task in progress', verifying: 'Checking task and payment receipts', verified: 'Verified on Monad Testnet', unresolved: 'Confirmation pending' };
interface TaskProps { config: DemoConfig; mcpEndpoint: string }

function ObserverSession({ config, mcpEndpoint, walletAddress }: TaskProps & { walletAddress?: Address }) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext();
  const { withWalletPrompt } = useAccessSession();
  const [journal, setJournal] = useState<DemoJournal>(); const current = useRef<DemoJournal>();
  const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [ready, setReady] = useState(false); const [unreadable, setUnreadable] = useState(false);
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const [access, setAccess] = useState<ObserverAccess>(); const [checking, setChecking] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const mounted = useRef(true); const controller = useRef<AbortController>();
  const latestWallet = useRef(primaryWallet); latestWallet.current = primaryWallet;
  const context = useMemo<DemoJournalContext | undefined>(() => walletAddress ? { router: config.router, identity: config.identity, payer: walletAddress, agentId: config.agentId } : undefined, [config.router, config.identity, config.agentId, walletAddress]);
  useEffect(() => {
    mounted.current = true;
    if (context) {
      try { const saved = readDemo('agent-task', context); current.current = saved; setJournal(saved); }
      catch { setUnreadable(true); setError('The saved task journal cannot be read. Preserve this browser data and ask the operator to reconcile it before another payment.'); }
    }
    setReady(true);
    return () => { mounted.current = false; controller.current?.abort(); };
  }, [context]);
  useEffect(() => {
    if (!walletAddress) return;
    const abort = new AbortController(); setChecking(true); setAccess(undefined);
    void checkObserverAccess(config, walletAddress, abort.signal).then(result => {
      if (!abort.signal.aborted) setAccess(result);
    }).catch(cause => {
      if (!abort.signal.aborted) setAccess({ allowed: false, message: userErrorMessage(cause, 'Observer access could not be checked. Check access again when Monad Testnet responds.') });
    }).finally(() => { if (!abort.signal.aborted) setChecking(false); });
    return () => abort.abort();
  }, [config, walletAddress, refresh]);
  function update(stage: DemoRecord['stage'], transactionHash?: Hex) {
    if (!mounted.current || !current.current || !context) return;
    const next = { ...current.current, records: [{ ...current.current.records[0], stage, ...(transactionHash ? { transactionHash } : {}) }] };
    current.current = next; setJournal(next);
    try { saveDemo(next, next.records[0].requestId, 'agent-task', context); }
    catch { setUnreadable(true); setError('Browser storage could not save this status. Keep the page open and preserve the request ID for reconciliation.'); }
  }
  async function run(resume = false) {
    if (busyRef.current || !context || (!resume && (!access?.allowed || checking))) return;
    if (!navigator.locks) { setError('Use a current browser on HTTPS to coordinate paid requests safely between tabs.'); return; }
    busyRef.current = true; setBusy(true); setError('');
    const abort = new AbortController(); controller.current = abort;
    const isCurrent = () => mounted.current && !abort.signal.aborted && latestWallet.current?.address.toLowerCase() === walletAddress?.toLowerCase();
    try {
      await navigator.locks.request('aetheris:agent-task:paid-run', { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('Another tab is following this task. Finish or close that tab before continuing.');
        const saved = readDemo('agent-task', context);
        if (saved && saved.records[0].requestId !== current.current?.records[0].requestId) { current.current = saved; setJournal(saved); }
        if (!saved && current.current) throw new Error('The saved task was removed in another tab. Preserve this page for operator reconciliation.');
        let active = current.current; let initial: unknown;
        if (!resume) {
          if (active?.records.some(record => record.stage !== 'verified')) throw new Error('Recover the previous request before starting another paid task.');
          if (!primaryWallet || !walletAddress || !isEthereumWallet(primaryWallet)) throw new Error('Connect an EVM wallet to authorize this task.');
          if (mcpEndpoint !== new URL('/api/mcp', window.location.origin).href) throw new Error('Open the dashboard at the Agent Card’s registered MCP origin to run this task. This preview cannot authorize a different service.');
          setMessage('Checking this wallet’s current Observer #1 authority. No payment has been submitted.');
          const freshAccess = await checkObserverAccess(config, walletAddress, abort.signal);
          if (!isCurrent()) return;
          setAccess(freshAccess);
          if (!freshAccess.allowed) throw new Error(freshAccess.message);
          setMessage('Asking the observer for the latest Monad block. No payment has been submitted.');
          const workload = await observeAgentTask(window.location.origin, abort.signal);
          if (!isCurrent()) return;
          const prepared = await withWalletPrompt(async () => {
            const wallet = await primaryWallet.getWalletClient();
            return signDemo(config, wallet, walletAddress, (_index, kind) => {
              if (isCurrent()) setMessage(`Observed block ${workload.observation.blockNumber}. Approve ${kind} in your wallet.`);
            }, abort.signal, { scope: 'agent-task', workload, journalContext: context, isCurrent });
          });
          if (!isCurrent()) throw new Error('Signing was interrupted. Recover the saved request before starting again.');
          active = prepared.journal; current.current = active; setJournal(active);
          setMessage('Task signed. Following its private execution lane and payment settlement.');
          try { initial = await postDemo(prepared.signed[0].task, prepared.signed[0].paymentHeader, abort.signal); }
          catch { /* An ambiguous POST is recovered with status reads only. */ }
        } else setMessage('Checking saved status. The task and payment will not be submitted again.');
        if (!active) throw new Error('There is no saved task to recover.');
        await recoverDemo(active, 0, abort.signal, update, initial);
        if (isCurrent()) setMessage('The observation commitment and its exact payment are verified with two confirmations.');
      });
    } catch (cause) {
      if (isCurrent()) {
        if (current.current && current.current.records[0].stage !== 'verified') update('unresolved');
        setMessage('');
        setError(userErrorMessage(cause, 'The request could not be confirmed. Check saved status before starting another payment.'));
      }
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  const record = journal?.records[0]; const unresolved = record && record.stage !== 'verified';
  const allowed = !walletAddress || access?.allowed;
  return <>
    <button type="button" className={styles.taskButton} disabled={busy || !ready || unreadable || Boolean(unresolved) || checking || !allowed} onClick={() => walletAddress ? void run() : setShowAuthFlow(true)}><Icon name="arrow" size={17} />{busy ? 'Following your task…' : checking ? 'Checking observer access…' : walletAddress ? 'Trigger paid x402 task' : 'Connect wallet to trigger task'}</button>
    {walletAddress && <p className={styles.note} role="status">{checking ? 'Checking current permissions on Monad Testnet.' : access?.message} {!checking && !busy && <button type="button" className={styles.textButton} onClick={() => setRefresh(value => value + 1)}>Check access again</button>}</p>}
    {walletAddress && !access?.allowed && <p className={styles.note}><Link className={styles.textButton} href="/#interactive-demo">Continue with your own agent →</Link></p>}
    <p className={styles.note}>One payment of {config.challenge.accepts[0].amount} token base units · token {truncate(config.policy.asset)} · recipient {truncate(config.policy.receiver)}. Your wallet asks you to approve the task and payment separately.</p>
    {record && <div className={styles.taskProgress}>
      <div><span>{stageNames[record.stage]}</span><button type="button" className={styles.textButton} disabled={busy} onClick={() => void run(true)}>Recover saved status</button></div>
      <div className={styles.progressTrack} role="progressbar" aria-label="Observer task progress" aria-valuenow={progress[record.stage]} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress[record.stage]}%` }} /></div>
      <p className={styles.note}>Request <code>{record.requestId}</code></p>
      {record.stage === 'verified' && record.transactionHash && <a className={styles.receipt} href={explorerTx(record.transactionHash)} target="_blank" rel="noreferrer">View verified execution {truncate(record.transactionHash)} <Icon name="external" size={14} /></a>}
    </div>}
    {message && <p className={styles.note} role="status">{message}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
    <p className={styles.note}>This read-only MCP tool observes a mined block; it does not claim finality or AI inference. The paid task commits that observation’s hashes on-chain.</p>
  </>;
}

export default function AgentTaskWallet(props: TaskProps) {
  const { primaryWallet, network } = useDynamicContext();
  const walletAddress = primaryWallet && isEthereumWallet(primaryWallet) ? address(primaryWallet.address) : undefined;
  return <ObserverSession key={`${props.config.identity}:${props.config.router}:${props.config.agentId}:${walletAddress?.toLowerCase() ?? 'disconnected'}:${String(network)}`} {...props} walletAddress={walletAddress} />;
}
