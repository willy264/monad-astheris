'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useAgents, useSnapshot } from '@/lib/queries';
import { Icon } from '@/components/Icon';
import { LiveStatus, Metric, Notice } from '@/components/Shared';
import { SourceNotice } from '@/components/IndexedData';
import Tooltip, { glossary } from '@/components/Tooltip';
import AnimatedCounter from '@/components/AnimatedCounter';
import InteractiveDemo from '@/components/InteractiveDemo';
import styles from './overview.module.css';

function Counter({ value, decimals = 0 }: { value: number | null | undefined; decimals?: number }) {
  return value == null || !Number.isFinite(value)
    ? <span aria-label="Reading unavailable">—</span>
    : <AnimatedCounter value={value} maximumFractionDigits={decimals} />;
}

export default function Overview() {
  const { data, error, isPending, refetch } = useSnapshot();
  const directory = useAgents(0);
  const [settledCount, setSettledCount] = useState<number | null>(null);
  const observer = directory.data?.agents.find(agent => agent.id === '1');
  const registered = data?.registeredAgents ?? directory.data?.total;
  const registrationStale = data?.registeredAgents != null ? Boolean(error) : Boolean(directory.error);
  const shards = data?.eventsAvailable ? data.shards.length : null;
  const observedBadge = error ? 'Last observed' : 'Live data';
  const observedKind = error ? 'cached' : 'live';

  return <>
    <div className={styles.pageIntro}><div><span className="eyebrow">YOUR AGENT WORKSPACE</span><p>Independent work. One connected network.</p></div><LiveStatus /></div>
    <div className={styles.dashboardGrid} data-testid="overview-card-grid">
      <section className={styles.hero} aria-labelledby="overview-title" data-testid="overview-hero-card">
        <div className={styles.heroTop}><span className={styles.kicker}><Image src="/brand/aetheris-logo.svg" alt="" aria-hidden="true" width={23} height={23} />AETHERIS PROTOCOL</span><span className={styles.chainTag}>MONAD · 10143</span></div>
        <div className={styles.heroCopy}>
          <h1 id="overview-title">Express Checkout Lanes for <span>Autonomous AI Agents</span> on Monad</h1>
          <p className={styles.description}>Aetheris gives every AI task its own storage, so agents can record their results without fighting over the same checkout lane.</p>
          <p className={styles.technical}>Isolating parallel task state for <Tooltip content={glossary.identity}>ERC-8004</Tooltip> agents using CREATE2 <Tooltip content={glossary.shard}>ephemeral shards</Tooltip>.</p>
          <div className={styles.heroLinks}><a href="#interactive-demo" className="button button-primary">Set up your agent <Icon name="arrow" size={17} /></a><Link href="/visualizer" className={styles.agentLink}>See how parallel lanes work <Icon name="arrow" size={15} /></Link></div>
        </div>
        <div className={styles.trustLine}><span><Icon name="shield" size={15} /> Discover the agent</span><span><Icon name="layers" size={15} /> Isolate the task</span><span><Icon name="activity" size={15} /> Verify the receipt</span></div>
      </section>
      <aside className={styles.pulse} aria-labelledby="pulse-title" data-testid="overview-network-card">
        <div className={styles.cardHeading}><div><span className="eyebrow">LIVE ON MONAD TESTNET</span><h2 id="pulse-title">Network at a glance</h2></div><span className={styles.cardIcon}><Icon name="activity" size={18} /></span></div>
    <section className={styles.liveMetrics} aria-label="Live network metrics">
      <Metric id="metric-agents" title={<Tooltip content="Agents registered in the ERC-8004 identity registry. Registration does not mean an agent has executed a task.">Registered agents</Tooltip>}
        value={registered != null ? Number.isSafeInteger(Number(registered)) ? <Counter value={Number(registered)} /> : <span>{BigInt(registered).toLocaleString()}</span> : <Counter value={null} />}
        badge={registered == null ? isPending || directory.isPending ? 'Connecting' : 'Unavailable' : registrationStale ? 'Last observed' : 'Live registry'}
        provenance={registered == null ? 'loading' : registrationStale ? 'cached' : 'live'}
        detail={observer ? `${observer.name} · #${observer.id}` : 'Public on-chain agent identities'} icon="agents" accent />
      <Metric id="metric-shards" title={<Tooltip content={glossary.shard}>Parallel task lanes</Tooltip>}
        value={<><Counter value={shards} />{data?.resultsLimited && shards !== null && <span className="metric-plus">+</span>}</>}
        badge={shards == null ? isPending ? 'Connecting' : 'Unavailable' : observedBadge} provenance={shards == null ? 'loading' : observedKind}
        detail={data?.resultsLimited ? 'Recent created shards · results capped' : 'Created shards in the observed window'} icon="layers" />
      <Metric id="metric-payments" title="Micropayments settled" value={<Counter value={settledCount} />}
        badge={settledCount == null ? 'No demo result' : 'This browser session'} provenance={settledCount == null ? 'loading' : 'live'}
        detail="Confirmed payments from the guided demo" icon="shield" />
      <Metric id="metric-tps" title="Observed Monad TPS" value={<Counter value={data?.tps} decimals={1} />}
        badge={data?.tps == null ? isPending ? 'Connecting' : 'Unavailable' : observedBadge} provenance={data?.tps == null ? 'loading' : observedKind}
        detail={data?.sampleSeconds ? `Network transactions / second · ${data.sampleSeconds}s sample` : 'Measured from recent network blocks'} icon="activity" />
    </section>
        <details className={styles.dataSource}><summary>Data source & freshness <span aria-hidden="true">+</span></summary>{data?.source ? <SourceNotice source={data.source} /> : <p>The data source will appear when a network reading is available.</p>}</details>
        <Link className={styles.directoryLink} href="/agents#agent-1">Explore the agent directory <Icon name="arrow" size={16} /></Link>
      </aside>
    </div>
    {error && <Notice error>Live data could not be refreshed. Cached readings keep their “Last observed” label. <button className="inline-button" onClick={() => void refetch()}>Retry connection</button></Notice>}
    {directory.error && <Notice error>The agent directory could not be refreshed. <button className="inline-button" onClick={() => void directory.refetch()}>Refresh agent identity</button></Notice>}
    {data?.errors.map(message => <Notice error key={message}>{message}</Notice>)}
    {directory.data?.errors.filter(message => !data?.errors.includes(message)).map(message => <Notice error key={message}>{message}</Notice>)}
    <InteractiveDemo onSettledCount={setSettledCount} />
  </>;
}
