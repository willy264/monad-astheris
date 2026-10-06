'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSnapshot } from '@/lib/queries';
import { networkStatus } from '@/lib/network-status';
import PasskeyAuth from './PasskeyAuth';
import styles from './Header.module.css';

const navigation = [{ href: '/', label: 'Overview' }, { href: '/agents', label: 'Agent directory' }, { href: '/visualizer', label: 'Visualizer' }];
export default function Header() {
  const pathname = usePathname();
  const snapshot = useSnapshot();
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 12000); return () => clearInterval(timer); }, []);
  const network = networkStatus(snapshot.data, snapshot.isError, now || Date.now());
  return <header className={styles.header}>
    <div className={styles.inner}>
      <Link href="/" className={styles.brand} aria-label="Aetheris home"><Image src="/brand/aetheris-logo.svg" alt="" width={39} height={39} priority /><span>AETHERIS<small>THE AGENT EXPRESS LANE</small></span></Link>
      <nav className={styles.nav} aria-label="Main navigation">{navigation.map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined}>{item.label}</Link>)}</nav>
      <div className={styles.actions}><button type="button" className={styles.network} data-state={network.state} onClick={() => void snapshot.refetch()} title="Refresh Monad Testnet connection" aria-label={`Monad Testnet 10143, ${network.label}. Refresh connection.`}><span className={styles.dot} /><span>Monad Testnet <b>10143</b><small>{network.label}</small></span></button><PasskeyAuth variant="header" /></div>
    </div>
  </header>;
}
