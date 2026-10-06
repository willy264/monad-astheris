'use client';
import { useEffect, useRef, useState } from 'react';
import { useDynamicContext, useSignInWithPasskey } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import type { Hex } from 'viem';
import { explorerTx, truncate } from '@/lib/contracts';
import { address, type DemoConfig, type DemoJournal, type DemoRecord } from '@/lib/demo-protocol';
import { postDemo, readDemo, recoverDemo, saveDemo, signDemo } from '@/lib/demo-client';
import styles from './InteractiveDemo.module.css';
import { useAccessSession } from './AccessContext';

const taskNames = ['Research agent', 'Market analyst', 'Data curator', 'Risk observer', 'Report writer'];
const stageLabels: Record<DemoRecord['stage'], string> = { submitted: 'Submitted', accepted: 'On its own lane', verifying: 'Checking receipts', verified: 'Verified on Monad', unresolved: 'Check saved status' };
const stageProgress: Record<DemoRecord['stage'], number> = { submitted: 25, accepted: 55, verifying: 80, verified: 100, unresolved: 25 };

function LiveDemo({ config, onSettledCount }: { config: DemoConfig; onSettledCount?: (count: number) => void }) {
  const { withWalletPrompt } = useAccessSession();
  const { primaryWallet, setShowAuthFlow, user } = useDynamicContext(); const signInWithPasskey = useSignInWithPasskey();
  const [journal, setJournal] = useState<DemoJournal>(); const current = useRef<DemoJournal>();
  const [busy, setBusy] = useState(false); const [authBusy, setAuthBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const [journalUnreadable, setJournalUnreadable] = useState(false);
  const controller = useRef<AbortController>(); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; try { const saved = readDemo(); current.current = saved; setJournal(saved); } catch { setJournalUnreadable(true); setError('The saved demo journal could not be read. Preserve this browser data and ask the operator to reconcile it before starting another paid run.'); }
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  useEffect(() => { onSettledCount?.(journal?.records.filter(record => record.stage === 'verified').length ?? 0); }, [journal, onSettledCount]);

  function update(index: number, stage: DemoRecord['stage'], transactionHash?: Hex) {
    if (!mounted.current || !current.current) return;
    const next: DemoJournal = { ...current.current, records: current.current.records.map((record, position) => position === index ? { ...record, stage, ...(transactionHash ? { transactionHash } : {}) } : record) };
    current.current = next; setJournal(next);
    try { saveDemo(next, next.records[0].requestId); } catch { setError('Browser storage could not save the latest status. Keep this page open; do not resubmit a payment.'); }
  }
  async function authenticate() {
    setError(''); setAuthBusy(true);
    try { if (!window.isSecureContext || !window.PublicKeyCredential) throw new Error('Passkey sign-in needs HTTPS or localhost and a supported browser.'); await signInWithPasskey(); }
    catch { setMessage('Choose your configured passkey wallet in the secure sign-in dialog. First-time users may need to create an account.'); setShowAuthFlow(true); }
    finally { setAuthBusy(false); }
  }
  async function run(resume = false) {
    if (busy) return;
    if (!navigator.locks) { setError('This browser cannot coordinate saved paid requests between tabs. Use a current browser on HTTPS or localhost.'); return; }
    try {
      await navigator.locks.request('aetheris:judge-demo:paid-run', { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('Another tab is following this demo. Finish or close that tab before recovering or starting a run here.');
        const saved = readDemo();
        if (saved && (!current.current || saved.records.some((record, index) => record.requestId !== current.current?.records[index]?.requestId))) { current.current = saved; setJournal(saved); }
        if (!saved && current.current) throw new Error('The saved journal was removed in another tab. Preserve the current page and ask the operator to reconcile it.');
        await execute(resume);
      });
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message.slice(0, 280) : 'The saved demo could not be coordinated.'); }
  }
  async function execute(resume = false) {
    if (busy) return; setBusy(true); setError(''); setMessage(resume ? 'Recovering saved requests. No task or payment is submitted again.' : 'Approve five task authorizations and five testnet payments in your wallet.');
    const abort = new AbortController(); controller.current = abort;
    try {
      let active = current.current; let submissions: Awaited<ReturnType<typeof signDemo>>['signed'] | undefined;
      if (!resume) {
        if (!primaryWallet || !isEthereumWallet(primaryWallet)) throw new Error('Connect an EVM wallet to run the live demo.');
        if (active && active.records.some(record => record.stage !== 'verified')) throw new Error('Recover the previous five requests before starting another paid run.');
        const prepared = await withWalletPrompt(async () => {
          const wallet = await primaryWallet.getWalletClient();
          return signDemo(config, wallet, address(primaryWallet.address), (index, kind) => { if (mounted.current) setMessage(`Task ${index + 1} of 5: approve ${kind}. All tasks will dispatch together after signing.`); }, abort.signal);
        });
        active = prepared.journal; submissions = prepared.signed;
        if (!mounted.current || abort.signal.aborted) throw new Error('Signing was interrupted. No requests were submitted; the saved status must be reconciled.');
        current.current = active; setJournal(active);
      }
      if (!active) throw new Error('There are no saved requests to recover.');
      setMessage('Five independent workspaces. Each green lane requires matching task and payment receipts.');
      const saved = active; const signed = submissions;
      const outcomes = await Promise.allSettled(saved.records.map(async (_record, index) => {
        let initial: unknown;
        if (signed) { try { initial = await postDemo(signed[index].task, signed[index].paymentHeader, abort.signal); } catch { /* An ambiguous POST is followed only by GET status requests. */ } }
        await recoverDemo(saved, index, abort.signal, (stage, transactionHash) => update(index, stage, transactionHash), initial);
      }));
      if (!mounted.current) return;
      const unresolved = outcomes.flatMap((result, index) => result.status === 'rejected' ? [index] : []);
      unresolved.forEach(index => update(index, 'unresolved'));
      if (unresolved.length) { setError(`${unresolved.length} task${unresolved.length === 1 ? '' : 's'} still need confirmation or operator reconciliation. Use “Recover saved status”; no payment is automatically retried.`); setMessage('Verified lanes retain their explorer receipts. Other lanes stay unconfirmed.'); }
      else setMessage('All five tasks and their payments are verified on Monad Testnet. Open a receipt to inspect the evidence.');
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message.slice(0, 280) : 'The demo could not continue. No request is automatically retried.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  const unresolved = journal?.records.some(record => record.stage !== 'verified');
  return <><div className={styles.steps}>
    <div className={styles.step}><span className={styles.stepNumber}>01</span><h3>Unlock your agent wallet</h3><p>Sign in with your configured passkey. Your device handles the secret.</p><button type="button" className={styles.secondaryButton} disabled={busy || authBusy} onClick={() => void authenticate()}>{authBusy ? 'Waiting for your device…' : primaryWallet ? '✓ Wallet connected' : '1-Tap Sign In with Passkey'}</button><p className={styles.note}>{primaryWallet ? truncate(primaryWallet.address) : 'Passkey availability depends on your Dynamic wallet setup.'}</p>{user && !primaryWallet && <button type="button" className={styles.textButton} onClick={() => setShowAuthFlow(true)}>Connect an EVM wallet</button>}</div>
    <div className={styles.step}><span className={styles.stepNumber}>02</span><h3>Launch independent tasks</h3><p>Run five checksum workloads for Agent #{config.agentId}, each in its own storage shard.</p><button type="button" className={styles.primaryButton} disabled={busy || !primaryWallet || Boolean(unresolved) || journalUnreadable} onClick={() => void run()}>{busy ? 'Following your tasks…' : 'Spawn 5 Autonomous Tasks'}</button><p className={styles.note}>Five payments of {config.challenge.accepts[0].amount} token base units each. Token {truncate(config.policy.asset)}. Recipient {truncate(config.policy.receiver)}. Wallet approval required.</p>{journal && <button type="button" className={styles.textButton} disabled={busy} onClick={() => void run(true)}>Recover saved status</button>}</div>
    <div className={`${styles.step} ${styles.streamStep}`}><span className={styles.stepNumber}>03</span><h3>Live completion stream</h3><p>Progress follows real service status and independent receipt checks.</p><div className={styles.stream}>{taskNames.map((name, index) => {
      const record = journal?.records[index]; const value = record ? stageProgress[record.stage] : 0;
      return <div key={name} className={styles.task}><div className={styles.taskHeading}><span><i className={styles.dot} />{name}</span><span>{record ? stageLabels[record.stage] : 'Waiting'}</span></div><div className={`${styles.track} ${record?.stage === 'unresolved' ? styles.pendingTrack : ''}`} role="progressbar" aria-label={`${name} live progress`} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${value}%` }} /></div>{record?.stage === 'verified' && record.transactionHash && <a className={styles.receipt} href={explorerTx(record.transactionHash)} target="_blank" rel="noreferrer">{truncate(record.transactionHash, 7)} <span aria-label="opens explorer">↗</span></a>}</div>;
    })}</div></div>
  </div><p className={styles.footerNote} role="status">{message || 'This live demo commits deterministic checksum results. It demonstrates routing and settlement; no external AI model or hardware proof is invoked.'}</p>{error && <p className={styles.error} role="alert">{error}</p>}<p className={styles.note}>Live workload: deterministic document checksums computed in this browser. A “verified” lane means both router events and its exact payment authorization were checked on-chain with two confirmations.</p></>;
}

export default function DemoWallet(props: { config: DemoConfig; onSettledCount?: (count: number) => void }) {
  return <LiveDemo {...props} />;
}
