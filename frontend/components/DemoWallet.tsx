'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import type { Address, Hex } from 'viem';
import { explorerTx, truncate } from '@/lib/contracts';
import { address, type DemoConfig, type DemoJournal, type DemoRecord } from '@/lib/demo-protocol';
import { postDemo, readDemo, recoverDemo, saveDemo, signDemo, type DemoJournalContext } from '@/lib/demo-client';
import AgentOnboarding from './AgentOnboarding';
import styles from './InteractiveDemo.module.css';
import { useAccessSession } from './AccessContext';

const taskNames = ['Checksum task 1', 'Checksum task 2', 'Checksum task 3', 'Checksum task 4', 'Checksum task 5'];
const stageLabels: Record<DemoRecord['stage'], string> = { submitted: 'Submitted', accepted: 'On its own lane', verifying: 'Checking receipts', verified: 'Verified on Monad', unresolved: 'Check saved status' };
const stageProgress: Record<DemoRecord['stage'], number> = { submitted: 25, accepted: 55, verifying: 80, verified: 100, unresolved: 25 };

interface RunProps {
  config: DemoConfig;
  walletAddress: Address;
  ready: boolean;
  setupBusy: boolean;
  onBusy(busy: boolean): void;
  onSettledCount?: (count: number) => void;
}

function TaskRun({ config, walletAddress, ready, setupBusy, onBusy, onSettledCount }: RunProps) {
  const { withWalletPrompt } = useAccessSession();
  const { primaryWallet } = useDynamicContext();
  const [journal, setJournal] = useState<DemoJournal>(); const current = useRef<DemoJournal>();
  const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const [journalUnreadable, setJournalUnreadable] = useState(false); const [loaded, setLoaded] = useState(false);
  const controller = useRef<AbortController>(); const mounted = useRef(true);
  const context = useMemo<DemoJournalContext>(() => ({ router: config.router, identity: config.identity, payer: walletAddress, agentId: config.agentId }), [config.router, config.identity, walletAddress, config.agentId]);
  const latest = useRef({ primaryWallet, config }); latest.current = { primaryWallet, config };
  const callbacks = useRef({ onBusy, onSettledCount }); callbacks.current = { onBusy, onSettledCount };
  useEffect(() => {
    mounted.current = true;
    try { const saved = readDemo('demo', context); current.current = saved; setJournal(saved); }
    catch { setJournalUnreadable(true); setError('The saved task journal could not be read. Preserve this browser data before starting another paid run.'); }
    setLoaded(true);
    return () => { mounted.current = false; controller.current?.abort(); callbacks.current.onBusy(false); callbacks.current.onSettledCount?.(0); };
  }, [context]);
  useEffect(() => { callbacks.current.onSettledCount?.(journal?.records.filter(record => record.stage === 'verified').length ?? 0); }, [journal]);

  function update(index: number, stage: DemoRecord['stage'], transactionHash?: Hex) {
    if (!mounted.current || !current.current) return;
    const next: DemoJournal = { ...current.current, records: current.current.records.map((record, position) => position === index ? { ...record, stage, ...(transactionHash ? { transactionHash } : {}) } : record) };
    current.current = next; setJournal(next);
    try { saveDemo(next, next.records[0].requestId, 'demo', context); }
    catch { setJournalUnreadable(true); setError('Browser storage could not save the latest status. Keep this page open; do not resubmit a payment.'); }
  }
  async function run(resume = false) {
    if (busyRef.current || setupBusy || (!resume && !ready)) return;
    if (!navigator.locks) { setError('Use a current browser on HTTPS or localhost to coordinate paid requests between tabs.'); return; }
    busyRef.current = true; setBusy(true); onBusy(true); setError('');
    const abort = new AbortController(); controller.current = abort;
    try {
      await navigator.locks.request('aetheris:judge-demo:paid-run', { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('Another tab is following a paid run. Finish or close that tab before continuing.');
        const saved = readDemo('demo', context);
        if (saved && saved.records[0].requestId !== current.current?.records[0].requestId) { current.current = saved; setJournal(saved); }
        if (!saved && current.current) throw new Error('The saved journal was removed in another tab. Preserve this page for reconciliation.');
        let active = current.current; let submissions: Awaited<ReturnType<typeof signDemo>>['signed'] | undefined;
        const isCurrent = () => mounted.current && !abort.signal.aborted && latest.current.primaryWallet?.address.toLowerCase() === walletAddress.toLowerCase() && latest.current.config.agentId === config.agentId;
        if (!resume) {
          if (!primaryWallet || !isEthereumWallet(primaryWallet)) throw new Error('Connect the wallet that owns this agent.');
          if (active?.records.some(record => record.stage !== 'verified')) throw new Error('Recover the previous requests before starting another paid run.');
          setMessage('Approve five task authorizations and five testnet payments. The tasks dispatch together after signing.');
          const prepared = await withWalletPrompt(async () => {
            const wallet = await primaryWallet.getWalletClient();
            return signDemo(config, wallet, walletAddress, (index, kind) => {
              if (mounted.current) setMessage(`Task ${index + 1} of 5: approve ${kind}.`);
            }, abort.signal, { journalContext: context, isCurrent });
          });
          active = prepared.journal; submissions = prepared.signed;
          if (!isCurrent()) throw new Error('Signing was interrupted. Recover the saved status before starting another run.');
          current.current = active; setJournal(active);
        }
        if (!active) throw new Error('There are no saved requests for this wallet and agent.');
        setMessage(resume ? 'Checking saved requests. No task or payment is submitted again.' : 'Following five independent lanes and their payment receipts.');
        const signed = submissions; const savedRun = active;
        const outcomes = await Promise.allSettled(savedRun.records.map(async (_record, index) => {
          let initial: unknown;
          if (signed) {
            if (!isCurrent()) throw new Error('Wallet or agent changed before dispatch.');
            try { initial = await postDemo(signed[index].task, signed[index].paymentHeader, abort.signal); }
            catch { /* An ambiguous POST is followed only by GET status requests. */ }
          }
          await recoverDemo(savedRun, index, abort.signal, (stage, transactionHash) => update(index, stage, transactionHash), initial);
        }));
        if (!mounted.current) return;
        const unresolved = outcomes.flatMap((result, index) => result.status === 'rejected' ? [index] : []);
        unresolved.forEach(index => update(index, 'unresolved'));
        if (unresolved.length) { setError(`${unresolved.length} task${unresolved.length === 1 ? '' : 's'} still need confirmation. Use “Recover saved status”; no payment is automatically retried.`); setMessage('Verified lanes retain their explorer receipts. Other lanes stay unconfirmed.'); }
        else setMessage('All five tasks and their payments are verified on Monad Testnet. Open a receipt to inspect the evidence.');
      });
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message.slice(0, 280) : 'The run could not continue. No payment was automatically retried.'); }
    finally { busyRef.current = false; if (mounted.current) { setBusy(false); onBusy(false); } }
  }
  const unresolved = journal?.records.some(record => record.stage !== 'verified');
  return <div className={styles.liveRun} data-testid="personal-agent-run">
    <div className={styles.runSteps}>
      <div className={styles.step}><span className={styles.stepNumber}>05</span><h3>Run your agent’s tasks</h3><p>Agent #{config.agentId} · {truncate(walletAddress)}<br />Five browser checksum workloads, each in its own storage shard.</p>
        <button type="button" className={styles.primaryButton} disabled={!loaded || busy || setupBusy || !ready || Boolean(unresolved) || journalUnreadable} onClick={() => void run()}>{busy ? 'Following your tasks…' : 'Spawn 5 Autonomous Tasks'}</button>
        {!ready && <p className={styles.note}>Complete the setup checks above to start a new run. Saved requests can still be checked here.</p>}
        <p className={styles.note}>Five payments of {config.challenge.accepts[0].amount} token base units each. Token {truncate(config.policy.asset)}. Recipient {truncate(config.policy.receiver)}. Your wallet approves each task and payment.</p>
        {journal && <button type="button" className={styles.textButton} disabled={busy || setupBusy} onClick={() => void run(true)}>Recover saved status</button>}
      </div>
      <div className={styles.step}><h3>Live completion stream</h3><p>Progress follows service status and independent receipt checks.</p><div className={styles.stream}>{taskNames.map((name, index) => {
        const record = journal?.records[index]; const value = record ? stageProgress[record.stage] : 0;
        return <div key={name} className={styles.task}><div className={styles.taskHeading}><span><i className={styles.dot} />{name}</span><span>{record ? stageLabels[record.stage] : 'Waiting'}</span></div><div className={`${styles.track} ${record?.stage === 'unresolved' ? styles.pendingTrack : ''}`} role="progressbar" aria-label={`${name} live progress`} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${value}%` }} /></div>{record?.stage === 'verified' && record.transactionHash && <a className={styles.receipt} href={explorerTx(record.transactionHash)} target="_blank" rel="noreferrer">{truncate(record.transactionHash, 7)} ↗</a>}{record && <details className={styles.requestDetails}><summary>Request ID</summary><code>{record.requestId}</code></details>}</div>;
      })}</div></div>
    </div>
    <p className={styles.footerNote} role="status">{message || 'This run commits deterministic browser checksums. It does not invoke an external AI model or hardware proof.'}</p>{error && <p className={styles.error} role="alert">{error}</p>}
    <p className={styles.note}>A verified lane means both router events and its exact payment authorization were checked on-chain with two confirmations.</p>
  </div>;
}

function WalletSession({ config, walletAddress, onSettledCount }: { config: DemoConfig; walletAddress?: Address; onSettledCount?: (count: number) => void }) {
  const [ready, setReady] = useState<DemoConfig>(); const [selected, setSelected] = useState<DemoConfig>();
  const [setupBusy, setSetupBusy] = useState(false); const [runBusy, setRunBusy] = useState(false);
  const onReady = useCallback((value: DemoConfig | undefined) => setReady(value), []);
  const onSelection = useCallback((value: DemoConfig | undefined) => setSelected(value), []);
  return <>
    <AgentOnboarding config={config} onReady={onReady} onSelection={onSelection} onBusy={setSetupBusy} disabled={runBusy} />
    {walletAddress && selected && <TaskRun key={`${selected.identity}:${selected.router}:${walletAddress}:${selected.agentId}`} config={selected} walletAddress={walletAddress} ready={ready?.agentId === selected.agentId} setupBusy={setupBusy} onBusy={setRunBusy} onSettledCount={onSettledCount} />}
  </>;
}

export default function DemoWallet({ config, onSettledCount }: { config: DemoConfig; onSettledCount?: (count: number) => void }) {
  const { primaryWallet, network } = useDynamicContext();
  const walletAddress = primaryWallet && isEthereumWallet(primaryWallet) ? address(primaryWallet.address) : undefined;
  return <WalletSession key={`${walletAddress?.toLowerCase() ?? 'disconnected'}:${String(network)}`} config={config} walletAddress={walletAddress} onSettledCount={onSettledCount} />;
}
