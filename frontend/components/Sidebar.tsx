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

export default function Sidebar() {
  const pathname = usePathname();
  const snapshot = useSnapshot();
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 12000);
    return () => clearInterval(timer);
  }, []);
  const network = networkStatus(snapshot.data, snapshot.isError, now || Date.now());
  return <header className={styles.header} data-testid="app-header">
    <div className={styles.topRow}>
      <Link href="/" className={styles.brand} aria-label="Aetheris home" title="Aetheris home"><Image src="/brand/aetheris-logo.svg" alt="" width={38} height={38} priority /><span>Aetheris</span></Link>
      <div className={styles.account}>
        <button type="button" className={styles.network} data-state={network.state} onClick={() => void snapshot.refetch()} title={`Monad Testnet 10143 · ${network.label}. Refresh connection.`} aria-label={`Monad Testnet 10143, ${network.label}. Refresh connection.`}><span className={styles.dot} /><span className={styles.networkText}>Monad Testnet<small>{network.label}</small></span><span className={styles.networkRefresh}><Icon name="refresh" size={15} /></span></button>
        <PasskeyAuth variant="sidebar" />
      </div>
    </div>
    <div className={styles.navigationRow}>
      <nav className={styles.nav} aria-label="Main navigation">
        {navigation.map(item => <Link key={item.href} href={item.href} aria-label={item.label} aria-current={pathname === item.href ? 'page' : undefined} className={styles.navLink}><Icon name={item.icon} size={17} /><span>{item.label}</span></Link>)}
      </nav>
      <form className={styles.search} action="/agents" method="get" role="search" aria-label="Search the agent directory">
        <Icon name="search" size={19} />
        <label className={styles.searchLabel} htmlFor="global-agent-search">Search agents on the first directory page by name, ID, or capability</label>
        <input id="global-agent-search" name="q" type="search" placeholder="Search the first directory page…" autoComplete="off" />
        <button type="submit" aria-label="Search agents" title="Search agents"><Icon name="arrow" size={18} /></button>
      </form>
    </div>
  </header>;
}
