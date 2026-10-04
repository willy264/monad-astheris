'use client';
import dynamic from 'next/dynamic';
import { Icon } from './Icon';
import Tooltip, { glossary } from './Tooltip';
const WalletAccess = dynamic(() => import('./WalletAccess'), { ssr: false, loading: () => <p className="muted-text">Loading secure wallet access…</p> });
const MeraAccess = dynamic(() => import('./MeraAccess'), { ssr: false, loading: () => <p className="muted-text">Loading Mera account access…</p> });
export default function PasskeyAuth() {
  return <section className="panel access-panel" id="access"><div className="panel-heading"><div><h2><Icon name="shield" /> <Tooltip content={glossary.passkey}>Passkeys & agent access</Tooltip></h2><p>Sign in with a supported wallet, then give an executor access for a limited time.</p></div><span className="tag">{process.env.NEXT_PUBLIC_MERA_ENABLED === 'true' ? 'DYNAMIC / MERA' : 'DYNAMIC'}</span></div>
    <WalletAccess />
    {process.env.NEXT_PUBLIC_MERA_ENABLED === 'true' && <MeraAccess />}
  </section>;
}
