'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useAgents, useSnapshot } from '@/lib/queries';
import { Icon } from '@/components/Icon';
import { EmptyState, LiveStatus, Metric, Notice } from '@/components/Shared';
import { ShardTable } from '@/components/ShardTable';
import { MerkleBatches, SourceNotice } from '@/components/IndexedData';
import Tooltip, { glossary } from '@/components/Tooltip';
import AnimatedCounter from '@/components/AnimatedCounter';
import InteractiveDemo from '@/components/InteractiveDemo';
import PasskeyAuth from '@/components/PasskeyAuth';
import { ExecutionComparison } from '@/components/ExecutionComparison';
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
  const samples = data?.blockSamples || [];
  const maximum = Math.max(1, ...samples.map(sample => sample.transactions));
  const shards = data?.eventsAvailable ? data.shards.length : null;
  const observedBadge = error ? 'Last observed' : 'Live data';
  const observedKind = error ? 'cached' : 'live';

  return <>
    <section className={styles.hero} aria-labelledby="overview-title">
      <div className={styles.heroCopy}>
        <div className={styles.kicker}><Image src="/brand/aetheris-logo.svg" alt="" aria-hidden="true" width={23} height={23} /><span>THE EXPRESS LANE FOR AGENT TASKS</span></div>
        <h1 id="overview-title">Express Checkout Lanes for <span>Autonomous AI Agents</span> on Monad</h1>
        <p className={styles.lead}>More agents. Less waiting in line.</p>
        <p className={styles.description}>Aetheris gives every AI task its own storage, so agents can record their results without fighting over the same checkout lane.</p>
        <p className={styles.technical}>Isolating parallel task state for <Tooltip content={glossary.identity}>ERC-8004</Tooltip> agents using CREATE2 <Tooltip content={glossary.shard}>ephemeral shards</Tooltip>.</p>
        <div className={styles.heroLinks}>
          <a href="#execution-comparison" className="button button-quiet">See the difference <Icon name="arrow" size={17} /></a>
          <Link href="/agents#agent-1" className={styles.agentLink}>Explore registered Agent #1 <Icon name="external" size={14} /></Link>
        </div>
        <div className={styles.trustLine}><span><Icon name="shield" size={14} /> Discover the agent</span><span><Icon name="layers" size={14} /> Isolate the task</span><span><Icon name="activity" size={14} /> Verify the receipt</span></div>
      </div>
      <div className={styles.heroActions}>
        <PasskeyAuth variant="hero" />
        <Link className={styles.observer} href="/agents#agent-1">
          <div className={styles.observerAvatar}><Icon name="agents" size={25} /></div>
          <div className={styles.observerInfo}>
            <span className={styles.observerEyebrow}>{observer ? 'ON-CHAIN IDENTITY · #1' : directory.isPending ? 'READING AGENT IDENTITY' : 'EXPLORE AGENT IDENTITY'}</span>
            <strong>{observer?.name || 'Aetheris Monad Observer'}</strong>
            <span>{observer ? `${directory.error ? 'Last observed' : 'Registered on Monad Testnet'} · ${observer.tasksCompleted == null ? 'Execution count unavailable' : `${observer.tasksCompleted} recorded tasks`}` : directory.isPending ? 'Loading its public passport…' : 'Open the directory for the latest status'}</span>
          </div>
          <Icon name="arrow" size={17} />
        </Link>
        <p className={styles.heroNote}>An agent you can inspect. A task you can trace.</p>
      </div>
    </section>

    <div className={styles.metricsHeading}><span><span className="dot cyan" /> LIVE ON MONAD TESTNET</span><LiveStatus /></div>
    <section className={`metric-grid ${styles.liveMetrics}`} aria-label="Live network metrics">
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
    {error && <Notice error>Live data could not be refreshed. Cached readings keep their “Last observed” label. <button className="inline-button" onClick={() => void refetch()}>Retry connection</button></Notice>}
    {directory.error && <Notice error>The agent directory could not be refreshed. <button className="inline-button" onClick={() => void directory.refetch()}>Refresh agent identity</button></Notice>}
    {data?.errors.map(message => <Notice error key={message}>{message}</Notice>)}
    {directory.data?.errors.filter(message => !data?.errors.includes(message)).map(message => <Notice error key={message}>{message}</Notice>)}

    <div id="execution-comparison" className={styles.comparisonAnchor}><ExecutionComparison /></div>

    <section className={styles.story} aria-label="How Aetheris works">
      <div><span className={styles.stepNumber}>01</span><div><h2><Tooltip content={glossary.identity}>An agent with a passport</Tooltip></h2><p>See who is working, what they offer, and where their service lives.</p></div></div>
      <div><span className={styles.stepNumber}>02</span><div><h2><Tooltip content={glossary.shard}>A lane for every task</Tooltip></h2><p>Keep each task’s input and output commitments in separate storage.</p></div></div>
      <div><span className={styles.stepNumber}>03</span><div><h2><Tooltip content={glossary.merkle}>A receipt you can check</Tooltip></h2><p>Follow transactions and compare a batch of results with its published receipt.</p></div></div>
    </section>

    <InteractiveDemo onSettledCount={setSettledCount} />

    <div className={`section-intro ${styles.activityHeading}`}><div><span className="eyebrow">THE EVIDENCE BEHIND THE EXPERIENCE</span><h2>Real activity. Public receipts.</h2></div><Link className="text-link" href="/visualizer">Explore the live ledger <Icon name="arrow" size={15} /></Link></div>
    <SourceNotice source={data?.source} />
    <section className={`panel throughput-panel ${styles.throughput}`}><div className="panel-heading"><div><h2>The network, in motion</h2><p>Actual transaction counts from recent Monad blocks</p></div><span className="tag">{error && samples.length ? 'LAST OBSERVED' : 'RPC READINGS'}</span></div><div className="chart"><div className="chart-grid" /><div className="chart-bars">{samples.length ? samples.map(sample => <div className="chart-bar-slot" key={sample.block}><div className="chart-bar" style={{ height: `${Math.max(1, sample.transactions / maximum * 100)}%` }} title={`Block ${sample.block}: ${sample.transactions} transactions`} /><span>{sample.block.slice(-3)}</span></div>) : <p className="chart-waiting">{error ? 'Network data unavailable' : 'Waiting for block samples…'}</p>}</div></div><div className="chart-footer"><span><span className="dot violet" /> {error && samples.length ? 'Last observed transactions' : 'Transactions observed onchain'}</span><span>Recent {samples.length || '—'} blocks</span></div></section>
    <section className="panel"><div className="panel-heading"><div><h2>Recent task activity <span className="count-badge">{data?.eventsAvailable ? data.shards.length : '—'}</span></h2><p>{data ? `Observed blocks ${Number(data.fromBlock).toLocaleString()} – ${Number(data.source.indexedThrough || data.blockNumber).toLocaleString()}` : 'Live creation and execution events'}</p></div><Link className="text-link" href="/visualizer">Open visualizer <Icon name="arrow" size={15} /></Link></div>{isPending ? <div className="loading-bar" role="status">Reading onchain activity…</div> : (error && !data) || (data?.routerConfigured && !data.eventsAvailable) ? <EmptyState title="Activity unavailable" description="The network could not be reached. Refresh the connection to retry." /> : <ShardTable shards={data?.shards.slice(0, 6) || []} configured={data?.routerConfigured || false} />}</section>
    {data && <MerkleBatches batches={data.batches} source={data.source} />}
  </>;
}
