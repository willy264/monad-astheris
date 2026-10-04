'use client';
import dynamic from 'next/dynamic';
import { Icon } from './Icon';
const WalletAccess = dynamic(() => import('./WalletAccess'), { ssr: false, loading: () => <p className="muted-text">Loading secure wallet access…</p> });
export default function PasskeyAuth() {
  return <section className="panel access-panel" id="access"><div className="panel-heading"><div><h2><Icon name="shield" /> Agent access</h2><p>Authenticate your wallet and authorize an executor for a limited time.</p></div><span className="tag">DYNAMIC</span></div>
    <WalletAccess />
  </section>;
}
