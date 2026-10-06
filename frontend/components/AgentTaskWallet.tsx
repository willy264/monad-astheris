'use client';
import { useEffect, useRef, useState } from 'react';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import type { Hex } from 'viem';
import { address, type DemoConfig, type DemoJournal, type DemoRecord } from '@/lib/demo-protocol';
import { postDemo, readDemo, recoverDemo, saveDemo, signDemo } from '@/lib/demo-client';
import { observeAgentTask } from '@/lib/observer-task';
import { explorerTx, truncate } from '@/lib/contracts';
import { Icon } from './Icon';
import { useAccessSession } from './AccessContext';
import styles from './FeaturedAgent.module.css';

const progress = { submitted: 25, accepted: 50, verifying: 80, verified: 100, unresolved: 25 };
const stageNames = { submitted: 'Submitted', accepted: 'Task in progress', verifying: 'Checking task and payment receipts', verified: 'Verified on Monad Testnet', unresolved: 'Confirmation pending' };

export default function AgentTaskWallet({ config, mcpEndpoint }: { config: DemoConfig; mcpEndpoint: string }) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext();
  const { withWalletPrompt } = useAccessSession();
  const [journal, setJournal] = useState<DemoJournal>(); const current = useRef<DemoJournal>();
  const [busy, setBusy] = useState(false); const [ready, setReady] = useState(false); const [unreadable, setUnreadable] = useState(false);
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const mounted = useRef(true); const controller = useRef<AbortController>();
  useEffect(() => {
    mounted.current = true;
    try { const saved = readDemo('agent-task'); current.current = saved; setJournal(saved); }
    catch { setUnreadable(true); setError('The saved task journal cannot be read. Preserve this browser data and ask the operator to reconcile it before another payment.'); }
    setReady(true);
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  function update(stage: DemoRecord['stage'], transactionHash?: Hex) {
    if (!mounted.current || !current.current) return;
    const next = { ...current.current, records: [{ ...current.current.records[0], stage, ...(transactionHash ? { transactionHash } : {}) }] };
    current.current = next; setJournal(next);
    try { saveDemo(next, next.records[0].requestId, 'agent-task'); }
    catch { setUnreadable(true); setError('Browser storage could not save this status. Keep the page open and preserve the request ID for reconciliation.'); }
  }
  async function run(resume = false) {
    if (busy) return;
    if (!navigator.locks) { setError('Use a current browser on HTTPS to coordinate paid requests safely between tabs.'); return; }
    try {
      await navigator.locks.request('aetheris:agent-task:paid-run', { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('Another tab is following this task. Finish or close that tab before continuing.');
        const saved = readDemo('agent-task');
        if (saved && saved.records[0].requestId !== current.current?.records[0].requestId) { current.current = saved; setJournal(saved); }
        if (!saved && current.current) throw new Error('The saved task was removed in another tab. Preserve this page for operator reconciliation.');
        await execute(resume);
      });
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message.slice(0, 280) : 'Task recovery could not be coordinated.'); }
  }
  async function execute(resume: boolean) {
    setBusy(true); setError(''); const abort = new AbortController(); controller.current = abort;
    try {
      let active = current.current; let initial: unknown;
      if (!resume) {
        if (active?.records.some(record => record.stage !== 'verified')) throw new Error('Recover the previous request before starting another paid task.');
        if (!primaryWallet || !isEthereumWallet(primaryWallet)) throw new Error('Connect an EVM wallet to authorize this task.');
        if (config.agentId !== '1') throw new Error('The observer task service must be configured for Agent #1.');
        if (mcpEndpoint !== new URL('/api/mcp', window.location.origin).href) throw new Error('Open the dashboard at the Agent Card’s registered MCP origin to run this task. This preview cannot authorize a different service.');
        setMessage('Asking the observer for the latest Monad block. No payment has been submitted.');
        const workload = await observeAgentTask(window.location.origin, abort.signal);
        const prepared = await withWalletPrompt(async () => {
          const wallet = await primaryWallet.getWalletClient();
          return signDemo(config, wallet, address(primaryWallet.address), (_index, kind) => {
            if (mounted.current) setMessage(`Observed block ${workload.observation.blockNumber}. Approve ${kind} in your wallet.`);
          }, abort.signal, { scope: 'agent-task', workload });
        });
        if (!mounted.current || abort.signal.aborted) throw new Error('Signing was interrupted. Recover the saved request before starting again.');
        active = prepared.journal; current.current = active; setJournal(active);
        setMessage('Task signed. Following its private execution lane and payment settlement.');
        try { initial = await postDemo(prepared.signed[0].task, prepared.signed[0].paymentHeader, abort.signal); }
        catch { /* An ambiguous POST is recovered with status reads only. */ }
      } else setMessage('Checking saved status. The task and payment will not be submitted again.');
      if (!active) throw new Error('There is no saved task to recover.');
      await recoverDemo(active, 0, abort.signal, update, initial);
      if (mounted.current) setMessage('The observation commitment and its exact payment are verified with two confirmations.');
    } catch (cause) {
      if (mounted.current) { if (current.current && current.current.records[0].stage !== 'verified') update('unresolved'); setError(cause instanceof Error ? cause.message.slice(0, 280) : 'The request needs confirmation. No payment is automatically retried.'); }
    } finally { if (mounted.current) setBusy(false); }
  }
  const record = journal?.records[0]; const unresolved = record && record.stage !== 'verified';
  return <>
    <button type="button" className={styles.taskButton} disabled={busy || !ready || unreadable || Boolean(unresolved)} onClick={() => primaryWallet ? void run() : setShowAuthFlow(true)}><Icon name="arrow" size={17} />{busy ? 'Following your task…' : primaryWallet ? 'Trigger paid x402 task' : 'Connect wallet to trigger task'}</button>
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
