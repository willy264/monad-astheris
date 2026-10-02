'use client';
import dynamic from 'next/dynamic';
import { Icon } from './Icon';
const WalletAccess = dynamic(() => import('./WalletAccess'), { ssr: false, loading: () => <p className="muted-text">Loading secure wallet access…</p> });
export default function PasskeyAuth() {
  return <section className="panel access-panel" id="access"><div className="panel-heading"><div><h2><Icon name="shield" /> Agent access</h2><p>Authenticate your wallet and authorize an executor for a limited time.</p></div><span className="tag">DYNAMIC</span></div>
    {process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID ? <WalletAccess /> : <div className="access-unconfigured"><Icon name="shield" size={28} /><div><h3>Wallet access is not configured</h3><p>Connect a Dynamic environment to enable wallet sign-in, passkeys, and agent delegation.</p></div></div>}
  </section>;
}
