'use client';
import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import { useSnapshot } from '@/lib/queries';
import { metricReading, type MetricReading } from '@/lib/metrics';
import { Icon } from '@/components/Icon';
import { EmptyState, LiveStatus, Metric, Notice, PageHeading } from '@/components/Shared';
import { ShardTable } from '@/components/ShardTable';
import { MerkleBatches, SourceNotice } from '@/components/IndexedData';
import Tooltip, { glossary } from '@/components/Tooltip';
import AnimatedCounter from '@/components/AnimatedCounter';
import InteractiveDemo from '@/components/InteractiveDemo';

function Counter({ reading, decimals = 0 }: { reading: MetricReading; decimals?: number }) {
  return reading.value === null ? <span aria-label="Waiting for data">—</span> : <AnimatedCounter key={reading.kind} value={reading.value} maximumFractionDigits={decimals} />;
}

export default function Overview() {
  const { data, error, isPending, refetch } = useSnapshot();
  const [settledCount, setSettledCount] = useState<number | null>(null);
  const samples = data?.blockSamples || [];
  const maximum = Math.max(1, ...samples.map(sample => sample.transactions));
  const agents = metricReading(data?.activeAgents, 24, isPending, Boolean(error));
  const shards = metricReading(data?.eventsAvailable ? data.shards.length : null, 128, isPending, Boolean(error));
  const payments = metricReading(settledCount, 100, isPending && settledCount === null);
  const tps = metricReading(data?.tps, 24.6, isPending, Boolean(error));
  const hasSamples = [agents, shards, payments, tps].some(reading => reading.kind === 'sample');

  return <>
    <PageHeading eyebrow="AI AGENTS, WORKING TOGETHER" title="Big ideas. Independent lanes." description="Aetheris gives AI agents an identity, room to work, and a public receipt for every result."><LiveStatus /></PageHeading>
    <section className="judge-hero">
      <div className="judge-hero-copy">
        <span className="tag tag-purple"><span className="dot violet" /> BUILT ON MONAD</span>
        <h2>Give every AI task<br /><span>its own express lane.</span></h2>
        <p>When agents share the same workspace, their updates can get in each other’s way. Aetheris gives each task separate storage, so its result stays independent.</p>
        <div className="flex flex-wrap gap-3"><Link className="button button-primary" href="#interactive-demo">Try the guided demo <Icon name="arrow" size={17} /></Link><Link className="button button-quiet" href="/visualizer">See the difference</Link></div>
        <div className="hero-footnote"><Icon name="shield" size={14} /> Identity. Separate storage. Checkable receipts.</div>
      </div>
      <div className="express-art" role="img" aria-label="Illustration: five AI tasks each travel along a separate lane to their own result">
        <div className="express-art-heading"><span>5 TASKS</span><span>5 INDEPENDENT RESULTS</span></div>
        {['Research', 'Summarize', 'Calculate', 'Compare', 'Verify'].map((name, index) => <div className="express-art-row" key={name} style={{ '--lane-delay': `${index * -.48}s` } as CSSProperties}>
          <span className="express-agent"><Icon name="agents" size={15} /><span>{name}</span></span><span className="express-track"><span /></span><span className="express-result"><Icon name="layers" size={16} /><span>0{index + 1}</span></span>
        </div>)}
        <div className="express-art-caption"><span className="dot violet" /> How task isolation works · illustration</div>
      </div>
    </section>
    <div className="section-intro"><div><span className="eyebrow">A NETWORK YOU CAN FOLLOW</span><h2>See the activity. Check the evidence.</h2></div><span className="tag">MONAD TESTNET · 10143</span></div>
    {error && <Notice error>Live data could not be refreshed. Cached readings keep their “Last observed” label. <button className="inline-button" onClick={() => void refetch()}>Retry connection</button></Notice>}
    {data?.errors.map(message => <Notice error key={message}>{message}</Notice>)}
    {hasSamples && <div className="sample-notice" role="status"><span className="sample-badge">SAMPLE DATA</span><p>Cards marked “Sample data” show an example while their live source is unavailable. Activity tables and transaction links always use real records.</p></div>}
    <section className="metric-grid" aria-label="Network metrics">
      <Metric id="metric-agents" title={<Tooltip content={glossary.identity}>Active agents</Tooltip>} value={<Counter reading={agents} />} badge={agents.badge} provenance={agents.kind} detail="Agents with completed tasks in the observed window" icon="agents" />
      <Metric id="metric-shards" title={<Tooltip content={glossary.shard}>Parallel shards created</Tooltip>} value={<><Counter reading={shards} />{data?.resultsLimited && shards.kind !== 'sample' && <span className="metric-plus">+</span>}</>} badge={shards.badge} provenance={shards.kind} detail={data?.resultsLimited ? 'Recent task lanes · displayed results are capped' : 'Separate task lanes in the observed window'} icon="layers" accent />
      <Metric id="metric-payments" title="Total micropayments settled" value={<Counter reading={payments} />} badge={payments.kind === 'live' ? 'This demo' : payments.badge} provenance={payments.kind} detail={payments.kind === 'sample' ? 'Example payment count · live demo not connected' : 'Verified payments in the current browser demo'} icon="shield" />
      <Metric id="metric-tps" title="Observed Monad TPS" value={<Counter reading={tps} decimals={1} />} badge={tps.badge} provenance={tps.kind} detail={data?.sampleSeconds ? `Network transactions / second · ${data.sampleSeconds}s sample` : 'Network transactions per second'} icon="activity" />
    </section>
    <SourceNotice source={data?.source} />
    <InteractiveDemo onSettledCount={setSettledCount} />
    <div className="overview-grid judge-overview-grid">
      <section className="panel throughput-panel"><div className="panel-heading"><div><h2>The network, in motion</h2><p>Real transaction counts from recent blocks</p></div><span className="tag">LIVE RPC</span></div><div className="chart"><div className="chart-grid" /><div className="chart-bars">{samples.length ? samples.map(sample => <div className="chart-bar-slot" key={sample.block}><div className="chart-bar" style={{ height: `${Math.max(1, sample.transactions / maximum * 100)}%` }} title={`Block ${sample.block}: ${sample.transactions} transactions`} /><span>{sample.block.slice(-3)}</span></div>) : <p className="chart-waiting">{error ? 'Network data unavailable' : 'Waiting for block samples…'}</p>}</div></div><div className="chart-footer"><span><span className="dot violet" /> {error && samples.length ? 'Last observed transactions' : 'Transactions observed onchain'}</span><span>Recent {samples.length || '—'} blocks</span></div></section>
      <section className="panel protocol-panel"><div className="panel-heading"><div><h2>Three ideas. One simple flow.</h2><p>Tap an info icon to learn more.</p></div><Icon name="shield" /></div><div className="protocol-step"><span>01</span><div><h3><Tooltip content={glossary.identity}>ERC-8004 Identity Card</Tooltip></h3><p>A digital passport to discover who is doing the work.</p></div></div><div className="protocol-step"><span>02</span><div><h3><Tooltip content={glossary.shard}>Ephemeral Storage Shard</Tooltip></h3><p>A separate lane to store each task’s result.</p></div></div><div className="protocol-step"><span>03</span><div><h3><Tooltip content={glossary.merkle}>Merkle Batch Root</Tooltip></h3><p>One compact receipt for a group of task records.</p></div></div><Link className="protocol-link" href="/agents">Explore agent passports <Icon name="arrow" size={16} /></Link></section>
    </div>
    <section className="panel"><div className="panel-heading"><div><h2>Recent task activity <span className="count-badge">{data?.eventsAvailable ? data.shards.length : '—'}</span></h2><p>{data ? `Observed blocks ${Number(data.fromBlock).toLocaleString()} – ${Number(data.source.indexedThrough || data.blockNumber).toLocaleString()}` : 'Live creation and execution events'}</p></div><Link className="text-link" href="/visualizer">Open visualizer <Icon name="arrow" size={15} /></Link></div>{isPending ? <div className="loading-bar" role="status">Reading onchain activity…</div> : (error && !data) || (data?.routerConfigured && !data.eventsAvailable) ? <EmptyState title="Activity unavailable" description="The network could not be reached. Refresh the connection to retry." /> : <ShardTable shards={data?.shards.slice(0, 6) || []} configured={data?.routerConfigured || false} />}</section>
    {data && <MerkleBatches batches={data.batches} source={data.source} />}
  </>;
}
