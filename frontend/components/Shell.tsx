'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Icon } from './Icon';
import type { ReactNode } from 'react';
import brandStyles from './BrandMark.module.css';
const navigation = [
  { href: '/', label: 'Overview', icon: 'grid' },
  { href: '/agents', label: 'Agent directory', icon: 'agents' },
  { href: '/visualizer', label: 'Execution visualizer', icon: 'activity' },
] as const;
export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand" aria-label="Aetheris home"><Image src="/brand/aetheris-logo.svg" alt="" aria-hidden="true" width={40} height={40} className={brandStyles.logo} priority /><span>AETHERIS<span className="brand-subtitle">AGENT INFRASTRUCTURE</span></span></Link>
      <div className="nav-caption">WORKSPACE <span>01</span></div>
      <nav aria-label="Main navigation">{navigation.map(({ href, label, icon }) => <Link key={href} href={href} className={`nav-item ${pathname === href ? 'active' : ''}`} aria-current={pathname === href ? 'page' : undefined}><Icon name={icon} />{label}{pathname === href && <span className="nav-dot" />}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="network-card"><span className="network-symbol">◈</span><div>Monad Testnet<small>Chain ID · 10143</small></div><span className="tag">TESTNET</span></div><a className="docs-link" href="https://eips.ethereum.org/EIPS/eip-8004" target="_blank" rel="noreferrer"><Icon name="code" size={17} /> ERC-8004 specification <Icon name="external" size={13} /></a><div className="build-caption">AETHERIS PROTOCOL <span>v0.1</span></div></div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>{navigation.find((item) => item.href === pathname)?.label || 'Dashboard'}</strong></div><div className="topbar-actions"><span className="testnet-label"><span className="dot violet" /> Monad Testnet</span><Link className="button button-small" href="/agents#access"><Icon name="shield" size={15} /> Agent access</Link></div></header><main id="main-content">{children}</main><footer className="footer"><span>Asynchronous by design. Isolated by default.</span><span>ERC-8004 <span className="footer-dot">·</span> POWERED BY MONAD</span></footer></div>
  </div>;
}
