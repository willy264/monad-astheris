'use client';
import { useState } from 'react';
import styles from './SequenceNonce.module.css';

export function SequenceNonce({ value }: { value: string }) {
  const [message, setMessage] = useState('');
  const compact = value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
  async function copy() {
    try { await navigator.clipboard.writeText(value); setMessage('Copied'); }
    catch { setMessage('Copy unavailable. Select the value above.'); }
  }
  return <details className={styles.nonce}>
    <summary title={value} aria-label={`Sequence nonce ${value}. Expand for the full value and copy control.`}>{compact}</summary>
    <div className={styles.expanded}><code aria-label="Full sequence nonce">{value}</code><button className="text-link" type="button" onClick={() => void copy()}>Copy nonce</button><span role="status">{message}</span></div>
  </details>;
}
