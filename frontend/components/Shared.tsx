'use client';
import { Icon } from './Icon';
import { useSnapshot } from '@/lib/queries';
import type { ReactNode } from 'react';
export function PageHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{children}</div>;
}
export function LiveStatus() {
  const query = useSnapshot();
  return <button className="live-pill" onClick={() => void query.refetch()} title="Refresh network data" disabled={query.isFetching}><span className={`dot ${query.isError ? 'amber' : query.data ? 'cyan' : 'muted'}`} />{query.isError ? 'Data unavailable' : query.isFetching ? 'Syncing network' : query.data ? `Block ${Number(query.data.blockNumber).toLocaleString()}` : 'Connecting'}<Icon name="refresh" size={13} /></button>;
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) { return <div className={`notice ${error ? 'notice-error' : ''}`} role={error ? 'alert' : 'status'}><Icon name="activity" size={17} /><div>{children}</div></div>; }
export function EmptyState({ title, description }: { title: string; description: string }) { return <div className="empty-state"><div className="empty-icon"><Icon name="layers" size={30} /></div><h3>{title}</h3><p>{description}</p></div>; }
export function Metric({ title, value, detail, icon, accent = false, badge, provenance, id }: { title: ReactNode; value: ReactNode; detail: ReactNode; icon: 'agents' | 'shield' | 'activity' | 'layers'; accent?: boolean; badge?: string; provenance?: string; id?: string }) {
  return <div className={`metric-card ${accent ? 'metric-accent' : ''}`} data-testid={id} data-provenance={provenance}><div className="metric-label"><span>{title}</span><Icon name={icon} size={18} /></div><div className={`metric-value ${value === 'Unavailable' ? 'metric-unavailable' : ''}`}>{value}</div>{badge && <span className={`metric-source metric-source-${provenance || 'live'}`}>{badge}</span>}<div className="metric-detail">{detail}</div></div>;
}
