'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSnapshot } from '@/lib/queries';
import { networkStatus } from '@/lib/network-status';
import { Icon } from './Icon';
import PasskeyAuth from './PasskeyAuth';
import styles from './Sidebar.module.css';

const navigation = [
  { href: '/', label: 'Overview', icon: 'grid' },
  { href: '/agents', label: 'Agent directory', icon: 'agents' },
  { href: '/visualizer', label: 'Visualizer', icon: 'activity' },
] as const;

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle(): void }) {
  const pathname = usePathname();
  const snapshot = useSnapshot();
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 12000);
    return () => clearInterval(timer);
  }, []);
  const network = networkStatus(snapshot.data, snapshot.isError, now || Date.now());
  return <aside className={styles.sidebar} data-testid="app-sidebar" data-collapsed={collapsed} aria-label="Aetheris navigation">
    <div className={styles.top}>
      <Link href="/" className={styles.brand} aria-label="Aetheris home" title="Aetheris home"><Image src="/brand/aetheris-logo.svg" alt="" width={38} height={38} priority /><span>AETHERIS<small>AGENT EXPRESS LANES</small></span></Link>
      <button type="button" className={styles.toggle} data-testid="sidebar-toggle" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} aria-controls="sidebar-navigation" onClick={onToggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /><path className={styles.toggleArrow} d="m16 9-3 3 3 3" /></svg></button>
    </div>
    <div className={styles.sectionLabel}>WORKSPACE</div>
    <nav className={styles.nav} id="sidebar-navigation" aria-label="Main navigation">
      {navigation.map(item => <Link key={item.href} href={item.href} aria-label={item.label} title={item.label} aria-current={pathname === item.href ? 'page' : undefined} className={styles.navLink}><span className={styles.navIcon}><Icon name={item.icon} size={21} /></span><span className={styles.navLabel}>{item.label}</span><span className={styles.activeMark} aria-hidden="true" /></Link>)}
    </nav>
    <div className={styles.bottom}>
      <button type="button" className={styles.network} data-state={network.state} onClick={() => void snapshot.refetch()} title={`Monad Testnet 10143 · ${network.label}. Refresh connection.`} aria-label={`Monad Testnet 10143, ${network.label}. Refresh connection.`}><span className={styles.networkIcon}><Icon name="layers" size={20} /><span className={styles.dot} /></span><span className={styles.networkText}><span>Monad Testnet <b>10143</b></span><small>{network.label}</small></span></button>
      <PasskeyAuth variant="sidebar" collapsed={collapsed} />
      <p className={styles.footerNote}>Your agent. Your authority.</p>
    </div>
  </aside>;
}
