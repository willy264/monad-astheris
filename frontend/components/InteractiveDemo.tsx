'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { boundedJson, parseConfig, type DemoConfig } from '@/lib/demo-protocol';
import styles from './InteractiveDemo.module.css';
import { dynamicEnvironmentId } from '@/lib/dynamic-config';

const DemoWallet = dynamic(() => import('./DemoWallet'), { ssr: false, loading: () => <p className={styles.note}>Preparing secure wallet access…</p> });
const taskNames = ['Research agent', 'Market analyst', 'Data curator', 'Risk observer', 'Report writer'];
export { taskNames };

function Preview() {
  const [signedIn, setSignedIn] = useState(false); const [progress, setProgress] = useState(0); const [running, setRunning] = useState(false);
  const started = useRef(0);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => { const next = Math.min(100, (Date.now() - started.current) / 45); setProgress(next); if (next === 100) setRunning(false); }, 90);
    return () => window.clearInterval(timer);
  }, [running]);
  return <><p className={styles.previewNotice}><span aria-hidden="true">✦</span> Preview · simulated progress, no wallet, payment or blockchain transaction.</p>
    <div className={styles.steps}>
      <div className={styles.step}><span className={styles.stepNumber}>01</span><h3>Your identity, unlocked</h3><p>Use a familiar device sign-in to access your agent wallet.</p><button type="button" className={styles.secondaryButton} disabled={signedIn} onClick={() => setSignedIn(true)}>{signedIn ? '✓ Preview identity ready' : 'Preview passkey sign-in'}</button></div>
      <div className={styles.step}><span className={styles.stepNumber}>02</span><h3>Five tasks. Five lanes.</h3><p>Each task gets its own workspace, so their results stay independent.</p><button type="button" className={styles.primaryButton} disabled={!signedIn || running} onClick={() => { started.current = Date.now(); setProgress(0); setRunning(true); }}>{running ? 'Tasks moving in parallel…' : progress === 100 ? 'Replay five-task preview' : 'Preview 5 Autonomous Tasks'} <span aria-hidden="true">↗</span></button></div>
      <div className={`${styles.step} ${styles.streamStep}`}><span className={styles.stepNumber}>03</span><h3>Watch them move together</h3><p>In live mode, every completed lane links to a verified testnet receipt.</p><div className={styles.stream}>{taskNames.map((name, index) => {
        const value = progress === 100 ? 100 : Math.min(98, Math.max(0, progress - index * 2));
        return <div key={name} className={styles.task}><div className={styles.taskHeading}><span><i className={styles.dot} />{name}</span><span>{value === 100 ? 'Simulated ✓' : value > 0 ? `${Math.round(value)}%` : 'Ready'}</span></div><div className={styles.track} role="progressbar" aria-label={`${name} simulated progress`} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${value}%` }} /></div></div>;
      })}</div></div>
    </div><p className={styles.footerNote} aria-live="polite">{progress === 100 ? 'Preview complete. Five independent lanes, one shared settlement network.' : 'The traffic-jam story in a few seconds. Switch to live mode to run the real testnet workflow.'}</p></>;
}

export default function InteractiveDemo({ onSettledCount }: { onSettledCount?: (count: number) => void }) {
  const [mode, setMode] = useState<'preview' | 'live'>('preview'); const [config, setConfig] = useState<DemoConfig>(); const [message, setMessage] = useState('Checking live demo availability…'); const [refresh, setRefresh] = useState(0);
  useEffect(() => { const controller = new AbortController();
    void fetch('/api/demo/config', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) }).then(async response => {
      if (!response.ok) throw new Error('Live testnet setup is not complete. The operator needs a deployed agent, delegated executor and payment service.');
      return parseConfig(await boundedJson(response));
    }).then(value => { if (!controller.signal.aborted) { setConfig(value); setMessage('Live Monad Testnet connection available.'); } }).catch(() => { if (!controller.signal.aborted) { setConfig(undefined); setMessage('Live testnet setup is not complete or the service is offline. Connect the deployed agent, delegated executor and payment service to enable it.'); } });
    return () => controller.abort();
  }, [refresh]);
  return <section className={`panel ${styles.demo}`} id="interactive-demo" aria-labelledby="demo-title"><div className={styles.heading}><div><span className={styles.eyebrow}>TRY THE IDEA</span><h2 id="demo-title">From sign-in to settlement.</h2><p>Follow five agents as they work side by side.</p></div><div className={styles.modeToggle} role="group" aria-label="Demo environment"><button type="button" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>Guided preview</button><button type="button" aria-pressed={mode === 'live'} onClick={() => setMode('live')}>Live testnet</button></div></div>
    {mode === 'preview' ? <Preview /> : <div><p className={styles.liveNotice}>Monad Testnet · real signatures, real testnet token payments.</p>{!dynamicEnvironmentId ? <div className={styles.unavailable}><h3>Wallet sign-in is awaiting setup</h3><p>Configure the project’s Dynamic environment to enable passkey wallet access. The guided preview is ready now.</p><button type="button" className={styles.secondaryButton} onClick={() => setMode('preview')}>Explore the preview</button></div> : config ? <DemoWallet config={config} onSettledCount={onSettledCount} /> : <div className={styles.unavailable}><h3>Live demo is not available yet</h3><p>{message}</p><button type="button" className={styles.secondaryButton} onClick={() => { setMessage('Checking live demo availability…'); setRefresh(value => value + 1); }}>Check connection again</button></div>}</div>}
  </section>;
}
