'use client';
import { useState } from 'react';
import { useSnapshot } from '@/lib/queries';
import { explorerAddress, truncate } from '@/lib/contracts';
import { Icon } from '@/components/Icon';
import { EmptyState, LiveStatus, Notice, PageHeading } from '@/components/Shared';
import { ShardTable } from '@/components/ShardTable';
import { MerkleBatches, SourceNotice } from '@/components/IndexedData';
import { ExecutionComparison } from '@/components/ExecutionComparison';
export default function Visualizer() {
  const { data, error, isPending } = useSnapshot();
  const [filter, setFilter] = useState<'all' | 'created' | 'executed'>('all');
  const [selected, setSelected] = useState<string>();
  const shards = data?.eventsAvailable ? data.shards.filter((shard) => filter === 'all' || shard.status === filter) : [];
  const detail = data?.shards.find((shard) => shard.address === selected);
  return <><PageHeading eyebrow="STATE ISOLATION ENGINE" title="Parallel work. Independent state." description="Follow deterministic shards from creation to committed output."><LiveStatus /></PageHeading>
    <ExecutionComparison />
    {error && <Notice error>{error.message}</Notice>}{data?.errors.map((message) => <Notice error key={message}>{message}</Notice>)}
    <SourceNotice source={data?.source} />
    {data?.resultsLimited && <Notice>Showing the latest 200 indexed shards. Execution and active-agent counts cover the full displayed block window.</Notice>}
    <section className="visualizer-stats"><div><span className="muted-text">Shards created in window</span><strong>{data?.eventsAvailable ? data.shards.length : '—'}</strong></div><div><span className="muted-text">Executions in window</span><strong className="cyan-text">{data?.executions ?? '—'}</strong></div><div><span className="muted-text">State addressing</span><strong className="small-stat">CREATE2</strong></div><div><span className="muted-text">Observation</span><strong className="small-stat">12s polling</strong></div></section>
    <section className="panel visualizer-panel"><div className="panel-heading"><div><h2>Execution topology</h2><p>Each tile is a distinct contract address. Select a shard to inspect its commitments.</p></div><div className="segmented-control" aria-label="Filter shards">{(['all', 'created', 'executed'] as const).map((option) => <button key={option} aria-pressed={filter === option} className={filter === option ? 'selected' : ''} onClick={() => setFilter(option)}>{option}</button>)}</div></div>
    <div className="execution-canvas"><div className="router-node"><span className="brand-mark">Λ</span><div>Aetheris Router<small>Deterministic task isolation</small></div><span className="tag">CREATE2</span></div><div className="connector-line" />{isPending ? <div className="loading-bar" role="status">Discovering shard events…</div> : (error && !data) || (data?.routerConfigured && !data.eventsAvailable) ? <EmptyState title="Network data unavailable" description="The configured data source failed. Refresh the connection to load actual shard events." /> : shards.length ? <div className="shard-grid">{shards.slice(0, 60).map((shard) => <button key={shard.address} className={`shard-node ${shard.status} ${selected === shard.address ? 'selected' : ''}`} onClick={() => setSelected(shard.address)} aria-pressed={selected === shard.address}><div><Icon name="layers" size={20} /><span className="dot" /></div><strong>Agent #{shard.agentId}</strong><code>{truncate(shard.address, 4)}</code><small>{shard.status === 'executed' ? 'Output committed' : 'Shard created'}</small></button>)}</div> : <EmptyState title={data?.routerConfigured ? 'No matching shards in this window' : 'Waiting for your first connection'} description={data?.routerConfigured ? 'Newly created shards will appear automatically as onchain events arrive.' : 'Connect your deployed router to see the topology of real agent executions.'} />}</div>
    <div className="visualizer-legend"><span><span className="dot violet" /> Created</span><span><span className="dot cyan" /> Executed</span><span>Recent block window · up to 60 visible shards</span></div></section>
    {detail && <section className="panel shard-detail"><div className="panel-heading"><div><h2>Shard commitment</h2><p>Agent #{detail.agentId} · sequence {detail.sequenceNonce}</p></div><button className="button button-small" onClick={() => setSelected(undefined)}>Close</button></div><dl><dt>Contract</dt><dd><a href={explorerAddress(detail.address)} target="_blank" rel="noreferrer">{detail.address} ↗</a></dd><dt>Task ID</dt><dd>{detail.taskId}</dd><dt>Executor</dt><dd>{detail.executor}</dd><dt>Input hash</dt><dd>{detail.inputHash}</dd><dt>Output hash</dt><dd>{detail.outputHash || 'No execution observed in this window'}</dd><dt>Proof hash</dt><dd>{detail.proofHash || 'No execution observed in this window'}</dd></dl></section>}
    <Notice>Shard isolation separates task storage. Onchain events do not reveal Monad scheduler concurrency or quantify avoided conflicts. A created shard may have executed outside the current observation window.</Notice>
    <section className="panel"><div className="panel-heading"><div><h2>Shard ledger</h2><p>Created shards matching the selected filter</p></div><span className="tag">{data?.eventsAvailable ? shards.length + ' EVENTS' : 'UNAVAILABLE'}</span></div>{(error && !data) || (data?.routerConfigured && !data.eventsAvailable) ? <EmptyState title="Shard ledger unavailable" description="Reconnect to Monad Testnet to read the event ledger." /> : <ShardTable shards={shards} configured={data?.routerConfigured || false} />}</section>
    {data && <MerkleBatches batches={data.batches} source={data.source} />}
  </>;
}
