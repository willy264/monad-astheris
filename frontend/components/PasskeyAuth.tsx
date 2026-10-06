'use client';
import { Icon } from './Icon';
import { useAccessSession } from './AccessContext';
import styles from './PasskeyAuth.module.css';

export default function PasskeyAuth({ variant = 'button', agentId = '1' }: { variant?: 'header' | 'hero' | 'button'; agentId?: string }) {
  const session = useAccessSession();
  if (variant === 'header') return <button type="button" className={styles.button} data-testid="header-passkey" disabled={!session.ready} onClick={() => session.address ? session.openAccess(agentId) : session.openSignIn()}><Icon name="shield" size={16} /><span>{!session.ready ? 'Loading wallet…' : session.address ? `${session.address.slice(0, 6)}…${session.address.slice(-4)}` : 'Connect / Sign in with Passkey'}</span></button>;
  if (variant === 'hero') return <section className={styles.hero} aria-labelledby="hero-access-title"><span className={styles.heroIcon}><Icon name="shield" size={23} /></span><div><h2 id="hero-access-title">Try 1-Tap Passkey Delegation</h2><p>Use Face ID or Touch ID on a supported device. Give an executor a time-limited permission to work for your agent.</p></div><button type="button" className={styles.button} disabled={!session.ready} onClick={() => session.openAccess(agentId)}><Icon name="shield" size={16} />Try passkey delegation <span aria-hidden="true">↗</span></button><p className={styles.note}>Powered by Dynamic. First-time users set up an account. On-chain delegation requires the agent owner’s wallet approval and testnet gas.</p></section>;
  return <button type="button" className={styles.button} disabled={!session.ready} onClick={() => session.openAccess(agentId)}><Icon name="shield" size={16} />Delegate task authority</button>;
}
