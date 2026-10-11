'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { explorerTx, truncate } from '@/lib/contracts';
import { useAccessRequests } from './AccessRequestsContext';
import { openAccessNotifications } from './AccessNotifications';
import { Icon } from './Icon';
import styles from './AccessRequests.module.css';

const durations = [[3600, '1 hour'], [21600, '6 hours'], [86400, '24 hours'], [604800, '7 days']] as const;

export default function AccessRequestPanel({ owner, agentId = '1' }: { owner: string; agentId?: string }) {
  const access = useAccessRequests();
  const fieldId = useId();
  const [duration, setDuration] = useState(3600);
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  useEffect(() => { setReason(''); setDuration(3600); setSent(false); }, [access.address]);
  const ownAgent = Boolean(access.address && access.address.toLowerCase() === owner.toLowerCase());
  const latest = access.requests.filter(request => request.agentId === agentId && request.requester.toLowerCase() === access.address?.toLowerCase()).sort((a, b) => b.createdAt - a.createdAt)[0];
  const pending = latest?.status === 'pending' || latest?.status === 'approving';
  const active = latest?.status === 'approved' && latest.currentAuthority === true;
  const incoming = access.requests.filter(request => request.agentId === agentId && request.owner.toLowerCase() === access.address?.toLowerCase() && request.status === 'pending').length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim() || access.busy) return;
    try { await access.requestAccess(duration, reason.trim()); setSent(true); setReason(''); }
    catch { /* The shared context displays the request error. */ }
  }

  return <section className={styles.requestPanel} aria-labelledby={`${fieldId}-title`}>
    <div className={styles.sectionHeading}><Icon name="shield" size={18} /><h3 id={`${fieldId}-title`}>{ownAgent ? 'Access requests for your agent' : 'Request Observer access'}</h3></div>
    {ownAgent ? <>
      <p>Review who wants to run tasks for Observer #{agentId}. Each request includes the wallet, duration and reason, ready for your decision.</p>
      <button type="button" className={styles.secondary} onClick={openAccessNotifications}>Review requests {access.authenticated && incoming > 0 && <span className={styles.inlineCount}>{incoming}</span>}</button>
    </> : <>
      <p>Ask the owner for permission to run this agent’s paid tasks. The decision appears in your notifications.</p>
      {!access.authenticated ? <>
        <button type="button" className={styles.secondary} disabled={!access.ready || access.busy} onClick={() => { void access.connect().catch(() => {}); }}>{access.busy ? 'Opening wallet…' : !access.address ? 'Connect wallet to request access' : 'Unlock access requests'}</button>
        <p className={styles.hint}>{access.address ? 'Sign a message to open your private inbox. This does not send a transaction.' : 'Your connected wallet will be included in the request automatically.'}</p>
      </> : <>
        {latest && <div className={styles.requestState} data-status={latest.status} role="status">
          <strong>{latest.status === 'approving' ? 'Approval started · awaiting confirmation' : pending ? 'Request sent · awaiting owner review' : latest.status === 'approved' ? active ? 'Access approved' : 'Approval recorded' : latest.status === 'denied' ? 'Access request denied' : latest.status === 'invalidated' ? 'Request no longer valid' : 'Request expired'}</strong>
          {pending ? <p>{latest.status === 'approving' ? 'The delegation has not been confirmed yet. Follow notifications for its transaction status.' : 'The owner can see your wallet, requested duration and reason. No access has been granted yet.'}</p> : latest.status === 'approved' ? <p>{active ? 'Your wallet has task authority. Check access above to refresh the task controls.' : latest.currentAuthority === false ? 'This wallet no longer has active task authority. The grant may have expired or been revoked.' : 'Check notifications for the latest on-chain access status.'}</p> : <p>{latest.decisionNote || (latest.status === 'denied' ? 'The owner declined this request. You can send another request with more context.' : 'You can send a new request to the current agent owner.')}</p>}
          {latest.transactionHash && <a className={styles.textButton} href={explorerTx(latest.transactionHash)} target="_blank" rel="noreferrer">View approval transaction <Icon name="external" size={13} /></a>}
          <button type="button" className={styles.textButton} onClick={openAccessNotifications}>Open notifications</button>
        </div>}
        {!pending && !active && <form className={styles.requestForm} onSubmit={submit}>
          <div className={styles.requestWallet}><span>Requesting wallet</span><code title={access.address}>{access.address && truncate(access.address, 7)}</code></div>
          <label htmlFor={`${fieldId}-duration`}>Requested access duration</label>
          <select id={`${fieldId}-duration`} value={duration} onChange={event => setDuration(Number(event.target.value))} disabled={access.busy}>{durations.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <label htmlFor={`${fieldId}-reason`}>Why would you like access?</label>
          <textarea id={`${fieldId}-reason`} value={reason} onChange={event => { setReason(event.target.value); setSent(false); }} required maxLength={500} rows={3} placeholder="For example, I’m reviewing the app and would like to try the Monad Observer." disabled={access.busy} aria-describedby={`${fieldId}-privacy`} />
          <p id={`${fieldId}-privacy`} className={styles.hint}>Your wallet address, reason and duration are shared with the owner. Keep private keys and other secrets out of your message.</p>
          <button className={styles.primary} type="submit" disabled={access.busy || !reason.trim() || !access.config}>{access.busy ? 'Sending request…' : 'Send access request'}<Icon name="arrow" size={16} /></button>
          {sent && !latest && <p className={styles.hint} role="status">Request sent. Open notifications to follow the owner’s decision.</p>}
        </form>}
      </>}
      <p className={styles.hint}>The owner approves on Monad Testnet. Access expires after the approved duration; task payments still come from your wallet.</p>
    </>}
    {access.error && <p className={styles.error} role="alert">{access.error}</p>}
  </section>;
}
