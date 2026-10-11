'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAgents, useSnapshot } from '@/lib/queries';
import { activityMetrics } from '@/lib/activity-metrics';
import { explorerAddress, truncate } from '@/lib/contracts';
import type { Snapshot } from '@/lib/types';
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

function NetworkChart({ samples, pending, stale }: { samples: Snapshot['blockSamples']; pending: boolean; stale: boolean }) {
  if (!samples.length) return <div className={styles.chartEmpty} aria-busy={pending}><Icon name="activity" size={26} /><p>{pending ? 'Reading recent network blocks…' : 'Network samples are unavailable.'}</p><span>{pending ? 'The chart will appear when RPC data arrives.' : 'The next network refresh will try again.'}</span></div>;
  const maximum = Math.max(1, ...samples.map(sample => sample.transactions));
  const points = samples.map((sample, index) => ({ x: samples.length === 1 ? 250 : 42 + index * 434 / (samples.length - 1), y: 196 - sample.transactions * 164 / maximum, ...sample }));
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
  return <figure className={styles.networkFigure}>
    <svg className={styles.lineChart} viewBox="0 0 500 230" role="img" aria-labelledby="network-chart-title network-chart-description">
      <title id="network-chart-title">Network transactions per sampled Monad block</title>
      <desc id="network-chart-description">{samples.length} actual RPC samples. {samples.map(sample => `Block ${sample.block}: ${sample.transactions} transactions`).join('; ')}.</desc>
      <defs><linearGradient id="network-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f5ce38" stopOpacity="0.48" /><stop offset="100%" stopColor="#f5ce38" stopOpacity="0.06" /></linearGradient></defs>
      {[0, 0.5, 1].map(fraction => <g key={fraction}><line x1="42" y1={196 - fraction * 164} x2="476" y2={196 - fraction * 164} className={styles.chartGrid} /><text x="31" y={200 - fraction * 164} textAnchor="end" className={styles.axisLabel}>{Number((maximum * fraction).toFixed(1))}</text></g>)}
      {points.map(point => <line key={point.block} x1={point.x} y1="32" x2={point.x} y2="196" className={styles.chartGrid} />)}
      {points.length > 1 && <path d={`${path} L${points[points.length - 1].x},196 L${points[0].x},196 Z`} fill="url(#network-chart-fill)" />}
      <path d={path} fill="none" stroke="#f5ce38" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {points.map(point => <circle key={point.block} cx={point.x} cy={point.y} r="3" fill="#f5ce38"><title>Block {point.block}: {point.transactions} transactions</title></circle>)}
      <text x="42" y="220" className={styles.axisLabel}>#{samples[0].block}</text><text x="476" y="220" textAnchor="end" className={styles.axisLabel}>#{samples[samples.length - 1].block}</text>
    </svg>
    <figcaption>{stale ? 'Last observed' : 'RPC sample'} · {samples.length} blocks · network-wide transactions</figcaption>
    <details className={styles.sampleDetails}><summary>View block samples</summary><table><caption>Transactions in each sampled Monad block</caption><thead><tr><th scope="col">Block</th><th scope="col">Transactions</th></tr></thead><tbody>{samples.map(sample => <tr key={sample.block}><th scope="row">{sample.block}</th><td>{sample.transactions}</td></tr>)}</tbody></table></details>
  </figure>;
}

export default function Overview() {
  const { data, error, isPending, refetch } = useSnapshot();
  const directory = useAgents(0);
  const [settledCount, setSettledCount] = useState<number | null>(null);
  const agents = directory.data?.agents.slice(0, 4) ?? [];
  const registered = data?.registeredAgents ?? directory.data?.total;
  const registrationStale = data?.registeredAgents != null ? Boolean(error) : Boolean(directory.error);
  const metrics = activityMetrics(data);
  const shards = metrics.taskLanes;
  const observedBadge = error ? 'Last observed' : 'Live data';
  const observedKind = error ? 'cached' : 'live';
  const completions = agents.map(agent => ({ agent, count: agent.tasksCompleted !== undefined && Number.isSafeInteger(Number(agent.tasksCompleted)) && Number(agent.tasksCompleted) >= 0 ? Number(agent.tasksCompleted) : null }));
  const maxCompletions = Math.max(1, ...completions.map(item => item.count ?? 0));

  return <>
    <header className={styles.pageIntro}><div><h1>Agent workspace</h1><p>Coordinate independent tasks and inspect their on-chain receipts.</p></div><a href="#interactive-demo" className="button button-primary"><span aria-hidden="true">+</span> Set up your agent</a></header>
    {error && <Notice error>Live data could not be refreshed. Cached readings keep their “Last observed” label. <button className="inline-button" onClick={() => void refetch()}>Retry connection</button></Notice>}
    {directory.error && <Notice error>The agent directory could not be refreshed. <button className="inline-button" onClick={() => void directory.refetch()}>Refresh agent identity</button></Notice>}
    {data?.errors.map(message => <Notice error key={message}>{message}</Notice>)}
    {directory.data?.errors.filter(message => !data?.errors.includes(message)).map(message => <Notice error key={message}>{message}</Notice>)}
    <section className={styles.panel} aria-labelledby="workspace-agents-title" data-testid="overview-agent-panel">
      <div className={styles.sectionHeading}><h2 id="workspace-agents-title">Registered agents</h2><Link href="/agents">View directory <Icon name="arrow" size={15} /></Link></div>
      {directory.isPending ? <div className={styles.agentGrid} aria-label="Loading registered agents" aria-busy="true"><div className={styles.agentSkeleton} /><div className={styles.agentSkeleton} /></div> : agents.length ? <div className={styles.agentGrid}>{agents.map(agent => <article key={agent.id} className={styles.agentCard} data-testid={`overview-agent-${agent.id}`}>
        <div className={styles.agentHeading}><span className={styles.agentIcon}><Icon name="agents" size={22} /></span><div><h3>{agent.name}</h3><span className={styles.agentIdentity}>ERC-8004 #{agent.id}</span></div></div>
        <p className={styles.agentDescription}>{agent.description || (agent.metadataError ? 'Agent metadata is currently unavailable.' : 'No description published for this agent.')}</p>
        <div className={styles.agentMeta}><a href={explorerAddress(agent.owner)} target="_blank" rel="noreferrer" title={`Agent owner ${agent.owner}`}>Owner {truncate(agent.owner)} <Icon name="external" size={11} /></a><span title="Average feedback tagged quality">{agent.score ?? (agent.reputationError ? 'Rating unavailable' : 'Unrated')}{agent.score !== null && ' quality'}</span></div>
        <Link href={`/agents#registered-agent-${agent.id}`} className={styles.agentFooter}>View agent <Icon name="arrow" size={15} /></Link>
      </article>)}</div> : <div className={styles.panelEmpty}><Icon name="agents" size={28} /><h3>{directory.error ? 'Agent directory unavailable' : 'Your agent network starts here'}</h3><p>{directory.error ? 'Use Refresh agent identity to try again.' : 'Register your agent to give its work an on-chain identity.'}</p></div>}
      {directory.error && agents.length > 0 && <p className={styles.cachedNote}>Showing the last observed agent records.</p>}
    </section>
    <section className={styles.panel} aria-labelledby="agent-stats-title" data-testid="overview-card-grid">
      <div className={styles.sectionHeading}><h2 id="agent-stats-title">Agent stats</h2><LiveStatus /></div>
      <div className={styles.statsGrid}>
        <section className={styles.statsCard} aria-labelledby="task-activity-title"><div className={styles.statsHeading}><h3 id="task-activity-title">Task activity</h3><Icon name="layers" size={17} /></div>
          <div className={styles.taskMetric}><Metric id="metric-shards" title={<Tooltip content={glossary.shard}>Completed task lanes</Tooltip>}
            value={<><Counter value={shards} />{metrics.taskLanesLimited && shards !== null && <span className="metric-plus">+</span>}</>}
            badge={shards == null ? isPending ? 'Connecting' : metrics.indexedTotalsUnavailable ? 'Totals unavailable' : 'Unavailable' : error ? 'Last observed' : metrics.indexedTotal ? 'Indexed total' : 'Recent activity'} provenance={shards == null ? 'loading' : observedKind}
            detail={metrics.indexedTotal ? `All indexed completions · through block ${metrics.indexedThrough}` : metrics.indexedTotalsUnavailable ? 'Task history remains available in the visualizer' : metrics.taskLanesLimited ? 'Recent completed lanes · results capped' : 'Completed lanes in the observed window'} icon="layers" /></div>
          {completions.some(item => item.count !== null) ? <figure className={styles.barFigure}><div className={styles.bars}>{completions.map(({ agent, count }) => <div className={styles.barColumn} key={agent.id}><span className={styles.barCount}>{count ?? '—'}</span><div className={styles.barTrack}><span className={styles.bar} style={{ height: count === null ? '0%' : `${count / maxCompletions * 100}%` }} /></div><span className={styles.barLabel}>Agent #{agent.id}</span></div>)}</div><figcaption>{directory.error ? 'Last observed' : 'Indexed completions'} · agents shown above</figcaption></figure> : <div className={styles.smallEmpty}>{directory.isPending ? 'Reading agent task activity…' : 'Per-agent completion counts are unavailable.'}</div>}
        </section>
        <section className={styles.statsCard} aria-labelledby="network-activity-title" data-testid="overview-network-card"><div className={styles.statsHeading}><h3 id="network-activity-title">Network activity</h3><Icon name="activity" size={17} /></div><p className={styles.chartCaption}>Transactions per block on Monad Testnet</p><NetworkChart samples={data?.blockSamples ?? []} pending={isPending} stale={Boolean(error)} /><Link href="/visualizer" className={styles.chartLink}>Explore task lanes <Icon name="arrow" size={15} /></Link></section>
        <section className={styles.statsCard} aria-labelledby="workspace-metrics-title"><div className={styles.statsHeading}><h3 id="workspace-metrics-title">At a glance</h3><Icon name="grid" size={17} /></div><div className={styles.liveMetrics}>
          <Metric id="metric-agents" title={<Tooltip content="Agents registered in the ERC-8004 identity registry. Registration does not mean an agent has executed a task.">Registered agents</Tooltip>}
            value={registered != null ? Number.isSafeInteger(Number(registered)) ? <Counter value={Number(registered)} /> : <span>{BigInt(registered).toLocaleString()}</span> : <Counter value={null} />}
            badge={registered == null ? isPending || directory.isPending ? 'Connecting' : 'Unavailable' : registrationStale ? 'Last observed' : 'Live registry'} provenance={registered == null ? 'loading' : registrationStale ? 'cached' : 'live'} detail="Public on-chain agent identities" icon="agents" />
          <Metric id="metric-tps" title="Observed Monad TPS" value={<Counter value={data?.tps} decimals={1} />} badge={data?.tps == null ? isPending ? 'Connecting' : 'Unavailable' : observedBadge} provenance={data?.tps == null ? 'loading' : observedKind} detail={data?.sampleSeconds ? `Network transactions / second · ${data.sampleSeconds}s sample` : 'Measured from recent network blocks'} icon="activity" />
          <Metric id="metric-payments" title="Micropayments settled" value={<Counter value={settledCount} />} badge={settledCount == null ? 'No demo result' : 'This browser session'} provenance={settledCount == null ? 'loading' : 'live'} detail="Confirmed payments from the live task run" icon="shield" />
        </div></section>
      </div>
      <details className={styles.dataSource}><summary>Data source & freshness <span aria-hidden="true">+</span></summary>{data?.source ? <SourceNotice source={data.source} /> : <p>The data source will appear when a network reading is available.</p>}</details>
    </section>
    <InteractiveDemo onSettledCount={setSettledCount} />
  </>;
}
