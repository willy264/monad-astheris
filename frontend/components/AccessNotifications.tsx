'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { AccessRequest } from '@/lib/access-protocol';
import { explorerAddress, explorerTx, truncate } from '@/lib/contracts';
import { useAccessRequests } from './AccessRequestsContext';
import AccessServiceStatus from './AccessServiceStatus';
import { Icon } from './Icon';
import styles from './AccessRequests.module.css';

const openEvent = 'aetheris:open-access-notifications';
export function openAccessNotifications() { window.dispatchEvent(new Event(openEvent)); }
function durationLabel(seconds: number) { return seconds >= 86400 ? `${seconds / 86400} ${seconds === 86400 ? 'day' : 'days'}` : `${seconds / 3600} ${seconds === 3600 ? 'hour' : 'hours'}`; }
function dateLabel(seconds?: number) { return seconds ? new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded'; }

function RequestCard({ request, incoming, onAction }: { request: AccessRequest; incoming: boolean; onAction: (action: () => Promise<void>) => void }) {
  const access = useAccessRequests();
  const unavailable = access.availability !== 'ready';
  const reviewUnavailable = unavailable || access.needsInboxRefresh;
  const noteId = useId();
  const [denying, setDenying] = useState(false);
  const [note, setNote] = useState('');
  const [recoveryHash, setRecoveryHash] = useState('');
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const approvalPending = access.pendingApproval?.id === request.id;
  const approvalHash = request.transactionHash ?? (approvalPending ? access.pendingApproval?.hash : undefined);
  const relayerOwner = Boolean(access.config?.relayers.some(address => address.toLowerCase() === access.address?.toLowerCase()));
  const recoverable = incoming && access.config && !relayerOwner && (request.status === 'approving' || (request.status === 'invalidated' && request.grantExpiresAt !== undefined && request.decisionAt === undefined));
  const state = request.status === 'approving' ? 'Confirming approval' : request.status === 'approved' && request.currentAuthority === false ? 'Access ended' : request.status === 'approved' ? 'Approved' : request.status === 'denied' ? 'Denied' : request.status === 'expired' ? 'Expired' : request.status === 'invalidated' ? 'No longer valid' : 'Awaiting review';
  return <article className={styles.requestCard} data-unread={request.unread}>
    <div className={styles.cardHeading}><div><span className={styles.eyebrow}>{incoming ? 'Incoming request' : 'Your request'} · Agent #{request.agentId}</span><h3>{incoming ? 'Observer task access requested' : request.status === 'pending' ? 'Waiting for the owner' : `Your access request: ${state.toLowerCase()}`}</h3></div><span className={styles.status} data-status={request.status}>{state}</span></div>
    <dl className={styles.requestDetails}>
      <div><dt>{incoming ? 'Requesting wallet' : 'Your wallet'}</dt><dd><a href={explorerAddress(request.requester)} target="_blank" rel="noreferrer"><code>{request.requester}</code><Icon name="external" size={13} /></a></dd></div>
      <div><dt>Requested duration</dt><dd>{durationLabel(request.durationSeconds)}</dd></div>
      <div><dt>Requested</dt><dd><time dateTime={new Date(request.createdAt * 1000).toISOString()}>{dateLabel(request.createdAt)}</time></dd></div>
      {request.status === 'pending' && <div><dt>Request expires</dt><dd>{dateLabel(request.requestExpiresAt)}</dd></div>}
      <div className={styles.reason}><dt>Reason</dt><dd>{request.reason}</dd></div>
      {request.decisionAt && <div><dt>Decision recorded</dt><dd>{dateLabel(request.decisionAt)}</dd></div>}
      {request.grantExpiresAt && <div><dt>Access expires</dt><dd>{dateLabel(request.grantExpiresAt)}</dd></div>}
      {request.decisionNote && <div className={styles.reason}><dt>Owner’s note</dt><dd>{request.decisionNote}</dd></div>}
    </dl>
    {request.status === 'approved' && <p className={styles.hint}>{request.currentAuthority === true ? 'Task authority is active on Monad Testnet.' : request.currentAuthority === false ? 'The grant has expired, was revoked, or the agent changed owner. Approval history is preserved.' : 'Approval is recorded. Current task authority could not be checked; refresh before running a task.'}</p>}
    {request.status === 'invalidated' && <p className={styles.hint}>The agent’s ownership changed. Send a new request to its current owner.</p>}
    {request.status === 'expired' && <p className={styles.hint}>The review window ended. A new request is needed for access.</p>}
    {request.status === 'pending' && request.approvalError && <p className={styles.error} role="status">{request.approvalError}</p>}
    {request.status === 'approving' && <div className={styles.requestState} role="status"><strong>Approval awaiting confirmation</strong><p className={styles.hint}>The delegation has not been confirmed yet. Task access starts after its transaction is verified on Monad Testnet. This inbox checks for updates automatically.</p>{request.approvalError && <p className={styles.hint}>{request.approvalError}</p>}<button type="button" className={styles.secondary} disabled={unavailable || access.busy || access.loading} onClick={() => onAction(access.refresh)}>Check approval status</button></div>}
    {recoverable && <details className={styles.recovery}>
      <summary>Recover approval transaction</summary>
      {request.status === 'invalidated' && <p className={styles.hint}>Ownership changed while this approval was unresolved. A submitted transaction may still verify an earlier approval; recover its receipt to check the history.</p>}
      {approvalHash ? <><p className={styles.hint}>A transaction was saved. Check its receipt before taking another action.</p><a className={styles.textButton} href={explorerTx(approvalHash)} target="_blank" rel="noreferrer">View saved approval <Icon name="external" size={13} /></a><button type="button" className={styles.secondary} disabled={unavailable || access.busy} onClick={() => onAction(() => access.recoverApproval(request, approvalHash))}>Verify saved transaction</button></> : <>
        <form className={styles.requestForm} onSubmit={event => { event.preventDefault(); onAction(() => access.recoverApproval(request, recoveryHash.trim())); }}><label htmlFor={`${noteId}-hash`}>Approval transaction hash</label><input id={`${noteId}-hash`} value={recoveryHash} onChange={event => setRecoveryHash(event.target.value)} pattern="0x[0-9a-fA-F]{64}" maxLength={66} required placeholder="0x…" autoComplete="off" spellCheck={false} disabled={unavailable || access.busy} /><p className={styles.hint}>If your wallet submitted the approval, paste its public transaction hash. The exact recipient and access duration will be checked.</p><button type="submit" className={styles.secondary} disabled={unavailable || access.busy || !/^0x[0-9a-fA-F]{64}$/.test(recoveryHash.trim())}>Verify approval transaction</button></form>
        {request.status === 'approving' && <div className={styles.cancelRecovery}><label className={styles.checkbox}><input type="checkbox" checked={cancelConfirmed} onChange={event => setCancelConfirmed(event.target.checked)} disabled={unavailable || access.busy} /><span>I cancelled the wallet request and no transaction was submitted.</span></label><button type="button" className={styles.secondary} disabled={unavailable || access.busy || !cancelConfirmed} onClick={() => onAction(() => access.cancelApproval(request))}>Return request to review</button><p className={styles.hint}>If you are unsure, check your wallet activity first. A submitted transaction must be recovered by its hash.</p></div>}
      </>}
    </details>}
    {request.transactionHash && <a className={styles.textButton} href={explorerTx(request.transactionHash)} target="_blank" rel="noreferrer">Approval transaction {truncate(request.transactionHash)} <Icon name="external" size={13} /></a>}
    {incoming && request.status === 'pending' && <div className={styles.reviewActions}>
      <p className={styles.hint}>Approving authorizes this wallet to run Agent #{request.agentId} tasks for {durationLabel(request.durationSeconds)} from approval. {relayerOwner ? 'Sign the exact access approval in your wallet; the service submits the delegation transaction on Monad Testnet (10143).' : 'Confirm the delegation transaction in your wallet on Monad Testnet (10143).'} This permission does not grant access to your wallet funds.</p>
      {approvalPending ? <div className={styles.requestState} role="status"><strong>Approval transaction awaiting verification</strong><a className={styles.textButton} href={explorerTx(access.pendingApproval!.hash)} target="_blank" rel="noreferrer">View transaction <Icon name="external" size={13} /></a><button type="button" className={styles.secondary} disabled={unavailable || access.busy} onClick={() => onAction(() => access.recoverApproval(request, access.pendingApproval!.hash))}>Check approval status</button></div> : <>
        <div className={styles.actionRow}><button type="button" className={styles.primary} disabled={reviewUnavailable || access.busy} onClick={() => onAction(() => access.approve(request))}>{relayerOwner ? 'Sign approval' : 'Approve access'} · {durationLabel(request.durationSeconds)}<Icon name="shield" size={16} /></button><button type="button" className={styles.secondary} disabled={reviewUnavailable || access.busy} onClick={() => setDenying(value => !value)} aria-expanded={denying} aria-controls={`${noteId}-form`}>{denying ? 'Cancel denial' : 'Deny request'}</button></div>
        {denying && <form id={`${noteId}-form`} className={styles.denialForm} onSubmit={event => { event.preventDefault(); onAction(async () => { await access.deny(request, note.trim()); setDenying(false); }); }}><label htmlFor={noteId}>Note to requester <span>(optional)</span></label><textarea id={noteId} value={note} onChange={event => setNote(event.target.value)} rows={2} maxLength={500} disabled={reviewUnavailable || access.busy} placeholder="Explain why access was declined." /><button type="submit" className={styles.secondary} disabled={reviewUnavailable || access.busy}>Confirm denial</button><p className={styles.hint}>The requester will see your decision and note. No transaction is needed.</p></form>}
      </>}
    </div>}
  </article>;
}

export default function AccessNotifications() {
  const access = useAccessRequests();
  const [open, setOpen] = useState(false);
  const [yielding, setYielding] = useState(false);
  const [filter, setFilter] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const isOpen = useRef(open); isOpen.current = open;
  const activeAddress = useRef(access.address); activeAddress.current = access.address;
  const seen = useRef(new Set<string>());
  const markSeen = useRef(access.markSeen); markSeen.current = access.markSeen;
  const titleId = useId();
  const unread = access.authenticated ? access.requests.filter(request => request.unread).length : 0;
  const paginated = access.hasNextPage || access.hasPreviousPage;
  const incoming = access.requests.filter(request => request.owner.toLowerCase() === access.address?.toLowerCase());
  const outgoing = access.requests.filter(request => request.requester.toLowerCase() === access.address?.toLowerCase());
  const requests = (filter === 'incoming' ? incoming : filter === 'outgoing' ? outgoing : access.requests).slice().sort((a, b) => (b.decisionAt ?? b.createdAt) - (a.decisionAt ?? a.createdAt));
  const close = useCallback(() => { dialog.current?.close(); setOpen(false); trigger.current?.focus(); }, []);

  useEffect(() => { const handler = () => setOpen(true); window.addEventListener(openEvent, handler); return () => window.removeEventListener(openEvent, handler); }, []);
  useEffect(() => { seen.current.clear(); setFilter('all'); }, [access.address]);
  useEffect(() => {
    if (open && !yielding) { if (!dialog.current?.open) dialog.current?.showModal(); heading.current?.focus(); }
    else dialog.current?.close();
  }, [open, yielding]);
  useEffect(() => {
    if (!open || yielding || !access.authenticated || access.availability !== 'ready' || access.needsInboxRefresh || access.busy || access.loading) return;
    const unreadRequests = requests.filter(request => request.unread && !seen.current.has(`${request.id}:${request.revision}`));
    if (!unreadRequests.length) return;
    const timer = setTimeout(() => {
      unreadRequests.forEach(request => seen.current.add(`${request.id}:${request.revision}`));
      void markSeen.current(unreadRequests.map(({ id, revision }) => ({ id, revision }))).catch(() => {
        unreadRequests.forEach(request => seen.current.delete(`${request.id}:${request.revision}`));
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [open, yielding, access.authenticated, access.availability, access.needsInboxRefresh, access.busy, access.loading, requests]);

  function runAction(action: () => Promise<void>) {
    const addressAtStart = activeAddress.current;
    setYielding(true);
    dialog.current?.close();
    void action().catch(() => {}).finally(() => { if (isOpen.current && activeAddress.current === addressAtStart) setYielding(false); else { setYielding(false); setOpen(false); } });
  }

  return <>
    <button type="button" ref={trigger} className={styles.bell} aria-label={`Access notifications${unread ? `, ${unread} unread${paginated ? ' on this page' : ''}` : ''}`} title={yielding ? 'Access request in progress' : 'Access notifications'} aria-haspopup="dialog" aria-busy={access.busy || yielding} disabled={yielding} onClick={() => setOpen(true)} data-busy={access.busy || yielding}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {unread > 0 && <span className={styles.badge} aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
    </button>
    <span className={styles.visuallyHidden} role="status" aria-live="polite">{access.authenticated ? `${unread} unread access ${unread === 1 ? 'notification' : 'notifications'}${paginated ? ' on this page' : ''}.` : ''}</span>
    {yielding && <div className={styles.actionStatus} role="status"><Icon name="shield" size={17} /><p>Access request in progress. Complete any wallet prompt to continue.</p></div>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    }}>
      <div className={styles.dialogHeader}><div><span className={styles.eyebrow}>Your agent permissions</span><h2 id={titleId} ref={heading} tabIndex={-1}>Access notifications</h2><p>Review requests and follow the owner’s decisions.</p></div><button type="button" className={styles.close} aria-label="Close access notifications" onClick={close}>×</button></div>
      <div className={styles.dialogBody}>
        <AccessServiceStatus onRefresh={() => runAction(access.refresh)} />
        {!access.authenticated ? access.availability === 'ready' && <div className={styles.empty}><Icon name="shield" size={28} /><h3>{access.address ? 'Unlock your private inbox' : 'Connect to see your requests'}</h3><p>Use your wallet to view requests you sent and requests for agents you own. A message signature opens the inbox for 15 minutes.</p><button type="button" className={styles.primary} disabled={!access.ready || access.busy} onClick={() => {
          if (!access.address) { setOpen(false); dialog.current?.close(); void access.connect().catch(() => {}); }
          else runAction(access.connect);
        }}>{access.address ? 'Sign to unlock inbox' : 'Connect wallet'}</button></div> : <>
          <div className={styles.inboxToolbar}><div className={styles.filters} role="group" aria-label="Filter access notifications">{(['all', 'incoming', 'outgoing'] as const).map(value => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'All' : value === 'incoming' ? 'Incoming' : 'Sent'}{value === 'incoming' && incoming.filter(request => request.status === 'pending').length > 0 ? ` (${incoming.filter(request => request.status === 'pending').length})` : ''}</button>)}</div><button type="button" className={styles.refresh} onClick={() => runAction(access.refresh)} disabled={access.availability !== 'ready' || access.loading || access.busy} aria-label="Refresh access notifications"><Icon name="refresh" size={16} /></button></div>
          <p className={styles.inboxIdentity}>Inbox for <code title={access.address}>{access.address && truncate(access.address, 7)}</code></p>
          {paginated && <p className={styles.hint}>Filters and unread counts apply to this page. Use the page controls to see more requests.</p>}
          {access.loading && <p className={styles.hint} role="status">Checking for access updates…</p>}
          {!requests.length && !access.loading ? <div className={styles.empty}><Icon name="agents" size={27} /><h3>No {filter === 'all' ? 'access' : filter === 'incoming' ? 'incoming' : 'sent'} requests {paginated ? 'on this page' : 'yet'}</h3><p>{paginated ? 'Try another filter or use the page controls to browse more requests.' : filter === 'incoming' ? 'Requests for agents you own will appear here with the information needed to approve.' : 'Request Observer access from its workspace. The owner’s decision will appear here.'}</p></div> : <div className={styles.requestList}>{requests.map(request => <RequestCard key={`${access.address}:${request.id}`} request={request} incoming={request.owner.toLowerCase() === access.address?.toLowerCase()} onAction={runAction} />)}</div>}
          {paginated && <nav className={styles.pagination} aria-label="Access notification pages"><button type="button" className={styles.secondary} disabled={access.availability !== 'ready' || !access.hasPreviousPage || access.busy || access.loading} onClick={() => runAction(access.previousPage)}>Previous page</button><button type="button" className={styles.secondary} disabled={access.availability !== 'ready' || !access.hasNextPage || access.busy || access.loading} onClick={() => runAction(access.nextPage)}>Next page</button></nav>}
        </>}
        {access.error && <div className={styles.error} role="alert"><p>{access.error}</p><button type="button" className={styles.textButton} onClick={access.clearError}>Dismiss message</button></div>}
      </div>
    </dialog>
  </>;
}
