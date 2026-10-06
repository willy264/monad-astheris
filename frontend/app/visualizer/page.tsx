'use client';
import Image from 'next/image';
import { useState } from 'react';
import { useSnapshot } from '@/lib/queries';
import { explorerAddress, truncate } from '@/lib/contracts';
import { Icon } from '@/components/Icon';
import { EmptyState, LiveStatus, Notice, PageHeading } from '@/components/Shared';
import { ShardTable } from '@/components/ShardTable';
import { MerkleBatches, SourceNotice } from '@/components/IndexedData';
import { ExecutionComparison } from '@/components/ExecutionComparison';
import Tooltip, { glossary } from '@/components/Tooltip';
import styles from './visualizer.module.css';
export default function Visualizer() {
  const { data, error, isPending, refetch } = useSnapshot();
  const [filter, setFilter] = useState<'all' | 'created' | 'executed'>('all');
  const [selected, setSelected] = useState<string>();
  const shards = data?.eventsAvailable ? data.shards.filter((shard) => filter === 'all' || shard.status === filter) : [];
  const detail = data?.shards.find((shard) => shard.address === selected);
  return <><PageHeading eyebrow="THE TRAFFIC JAM, EXPLAINED" title="One checkout. Or a lane for every task." description="Switch modes to see the idea. Then follow the actual task records on Monad Testnet below."><LiveStatus /></PageHeading>
    <ExecutionComparison />
    <div className={styles.liveHeading}><div><span className="eyebrow">ACTUAL TESTNET EVENTS</span><h2>From the idea to the public record.</h2><p>These counts and addresses come from the configured data source.</p></div><span className="tag">{error && data ? 'LAST OBSERVED' : data?.eventsAvailable ? 'LIVE EVENT DATA' : 'WAITING FOR DATA'}</span></div>
    {error && <Notice error>{error.message} Cached records remain visible if available. <button className="inline-button" onClick={() => void refetch()}>Refresh live data</button></Notice>}{data?.errors.map((message) => <Notice error key={message}>{message}</Notice>)}
    <SourceNotice source={data?.source} />
    {data?.resultsLimited && <Notice>Showing the latest 200 indexed shards. Execution and active-agent counts cover the full displayed block window.</Notice>}
    <section className="visualizer-stats" aria-label="Observed task and receipt metrics"><div><span className="muted-text"><Tooltip content={glossary.shard}>Created task lanes</Tooltip></span><strong>{data?.eventsAvailable ? <>{data.shards.length}{data.resultsLimited ? '+' : ''}</> : '—'}</strong></div><div><span className="muted-text">Executions in window</span><strong className="cyan-text">{data?.executions ?? '—'}</strong></div><div><span className="muted-text"><Tooltip content={glossary.merkle}>Verified batch roots</Tooltip></span><strong>{data?.source.kind === 'envio' ? data.batches.filter(batch => batch.verified).length : '—'}</strong></div><div><span className="muted-text">Live data refresh</span><strong className="small-stat">Every 12s</strong></div></section>
    <section className="panel visualizer-panel"><div className="panel-heading"><div><h2>Every lane has an address</h2><p>Select a real shard to inspect its agent, task, and recorded result.</p></div><div className="segmented-control" aria-label="Filter shards">{(['all', 'created', 'executed'] as const).map((option) => <button key={option} aria-pressed={filter === option} className={filter === option ? 'selected' : ''} onClick={() => setFilter(option)}>{option}</button>)}</div></div>
    <div className="execution-canvas"><div className="router-node"><Image src="/brand/aetheris-logo.svg" alt="" aria-hidden="true" width={32} height={32} /><div>Aetheris Router<small>Deterministic task isolation</small></div><span className="tag">CREATE2</span></div><div className="connector-line" />{isPending ? <div className="loading-bar" role="status">Discovering shard events…</div> : (error && !data) || (data?.routerConfigured && !data.eventsAvailable) ? <EmptyState title="Network data unavailable" description="The configured data source failed. Refresh the connection to load actual shard events." /> : shards.length ? <div className="shard-grid">{shards.slice(0, 60).map((shard) => <button key={shard.address} className={`shard-node ${shard.status} ${selected === shard.address ? 'selected' : ''}`} onClick={() => setSelected(shard.address)} aria-pressed={selected === shard.address}><div><Icon name="layers" size={20} /><span className="dot" /></div><strong>Agent #{shard.agentId}</strong><code>{truncate(shard.address, 4)}</code><small>{shard.status === 'executed' ? 'Output committed' : 'Shard created'}</small></button>)}</div> : <EmptyState title={data?.routerConfigured ? 'No matching shards in this window' : 'Waiting for your first connection'} description={data?.routerConfigured ? 'Newly created shards will appear automatically as onchain events arrive.' : 'Connect your deployed router to see the topology of real agent executions.'} />}</div>
    <div className="visualizer-legend"><span><span className="dot violet" /> Created</span><span><span className="dot cyan" /> Executed</span><span>Recent block window · up to 60 visible shards</span></div></section>
    {detail && <section className="panel shard-detail"><div className="panel-heading"><div><h2>Shard commitment</h2><p>Agent #{detail.agentId} · sequence {detail.sequenceNonce}</p></div><button className="button button-small" onClick={() => setSelected(undefined)}>Close</button></div><dl><dt>Contract</dt><dd><a href={explorerAddress(detail.address)} target="_blank" rel="noreferrer">{detail.address} ↗</a></dd><dt>Task ID</dt><dd>{detail.taskId}</dd><dt>Executor</dt><dd>{detail.executor}</dd><dt>Input hash</dt><dd>{detail.inputHash}</dd><dt>Output hash</dt><dd>{detail.outputHash || 'No execution observed in this window'}</dd><dt>Proof hash</dt><dd>{detail.proofHash || 'No execution observed in this window'}</dd></dl></section>}
    <Notice>Shard isolation separates task storage. Onchain events do not reveal Monad scheduler concurrency or quantify avoided conflicts. A created shard may have executed outside the current observation window.</Notice>
    <section className="panel"><div className="panel-heading"><div><h2>Shard ledger</h2><p>Created shards matching the selected filter</p></div><span className="tag">{data?.eventsAvailable ? shards.length + ' EVENTS' : 'UNAVAILABLE'}</span></div>{(error && !data) || (data?.routerConfigured && !data.eventsAvailable) ? <EmptyState title="Shard ledger unavailable" description="Reconnect to Monad Testnet to read the event ledger." /> : <ShardTable shards={shards} configured={data?.routerConfigured || false} />}</section>
    {data && <MerkleBatches batches={data.batches} source={data.source} />}
  </>;
}
