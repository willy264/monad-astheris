'use client';

import { ACCESS_UNAVAILABLE_MESSAGE } from '@/lib/access-service';
import { useAccessRequests } from './AccessRequestsContext';
import styles from './AccessRequests.module.css';

export default function AccessServiceStatus() {
  const access = useAccessRequests();
  if (access.availability === 'ready') return null;
  if (access.availability === 'checking') return <p className={styles.hint} role="status">Checking access request availability...</p>;
  return <div className={styles.error} role="status">
    <p>{ACCESS_UNAVAILABLE_MESSAGE}</p>
    <button type="button" className={styles.textButton} disabled={access.busy} onClick={() => { void access.checkAvailability().catch(() => {}); }}>Check availability</button>
  </div>;
}
