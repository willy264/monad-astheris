'use client';

import { ACCESS_UNAVAILABLE_MESSAGE } from '@/lib/access-service';
import { useAccessRequests } from './AccessRequestsContext';
import styles from './AccessRequests.module.css';

export default function AccessServiceStatus({ onRefresh }: { onRefresh?: () => void }) {
  const access = useAccessRequests();
  if (access.availability === 'ready') return access.needsInboxRefresh ? <div className={styles.requestState} role="status">
    <strong>Refresh your inbox</strong>
    <p className={styles.hint}>Showing saved requests. Check their latest status before reviewing or sending a request.</p>
    <button type="button" className={styles.secondary} disabled={access.busy || access.loading} onClick={onRefresh ?? (() => { void access.refresh().catch(() => {}); })}>Refresh inbox</button>
  </div> : null;
  if (access.availability === 'checking') return <p className={styles.hint} role="status">Checking access request availability...</p>;
  return <div className={styles.error} role="status">
    <p>{ACCESS_UNAVAILABLE_MESSAGE}</p>
    <button type="button" className={styles.textButton} disabled={access.busy} onClick={() => { void access.checkAvailability().catch(() => {}); }}>Check availability</button>
  </div>;
}
