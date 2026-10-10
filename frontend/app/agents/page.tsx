'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAgents } from '@/lib/queries';
import { contracts } from '@/lib/contracts';
import { Icon } from '@/components/Icon';
import { EmptyState, Notice, PageHeading } from '@/components/Shared';
import FeaturedAgent from '@/components/FeaturedAgent';
import AgentCard from '@/components/AgentCard';
import cardStyles from '@/components/AgentCard.module.css';
import { SourceNotice } from '@/components/IndexedData';
import Tooltip, { glossary } from '@/components/Tooltip';
export default function Agents() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();
  const { data, isPending, error, refetch, isFetching } = useAgents(page);
  const agents = data?.agents.filter((agent) => `${agent.id} ${agent.name} ${agent.capabilities.join(' ')}`.toLowerCase().includes(search.toLowerCase())) || [];
  const totalPages = data ? (BigInt(data.total) + BigInt(data.pageSize) - 1n) / BigInt(data.pageSize) : null;
  return <><PageHeading eyebrow="THE AGENT NETWORK" title="Real agents. Verifiable identities." description="Meet the Monad Observer, inspect its digital passport, and give it a task."><span className="directory-count"><Icon name="agents" />{data?.total ?? '—'} <Tooltip content={glossary.identity}>registered identities</Tooltip></span></PageHeading>
    <FeaturedAgent />
    <div className={cardStyles.sectionHeading}><h2>Registered agents</h2><p>Browse identities, capabilities, and client feedback.</p></div>
    <div className="directory-toolbar"><label className="search-input"><Icon name="search" size={18} /><input aria-label="Search agents on this page" placeholder="Search this page by name, ID, or capability…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><button className="button" disabled={isFetching} onClick={() => { void refetch(); if (page !== 0) void queryClient.invalidateQueries({ queryKey: ['agents', 0] }); }}><Icon name="refresh" size={16} /> Refresh directory</button></div>
    {error && <Notice error>{error.message}</Notice>}{data?.errors.map((message) => <Notice error key={message}>{message}</Notice>)}
    <SourceNotice source={data?.source} />
    {isPending ? <div className={cardStyles.grid} aria-label="Loading agent directory" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <div className={`${cardStyles.card} ${cardStyles.skeleton}`} key={index}><div /><div /><div /></div>)}</div> : agents.length ? <section className={cardStyles.grid} aria-label="Registered agent cards">{agents.map(agent => <AgentCard agent={agent} key={agent.id} />)}</section> : <section className="panel"><EmptyState title={error ? 'Directory unavailable' : search ? 'No agents match your search' : 'Your agent network starts here'} description={error ? 'Connect your deployed identity registry to load live Agent Cards.' : search ? 'Try a different name, ID, or capability on this page.' : 'Register an ERC-8004 identity to make its capabilities and endpoints discoverable.'} /></section>}
    <div className="pagination"><p>Quality scores use feedback tagged <code>quality</code>. {contracts.reputation ? 'Onchain feedback is uncurated.' : 'No reputation registry configured.'}</p><nav className="pagination-controls" aria-label="Agent directory pages" data-testid="agent-pagination"><span className="pagination-count" aria-live="polite">{data ? `Showing ${agents.length} on this page · ${data.total} registered` : error ? 'Directory count unavailable' : 'Loading directory count…'}</span><button className="button button-small" disabled={page === 0 || isFetching} onClick={() => { setPage(page - 1); setSearch(''); }}>Previous</button><span>Page {page + 1} of {totalPages === null ? '—' : (totalPages || 1n).toString()}</span><button className="button button-small" disabled={!data || BigInt((page + 1) * data.pageSize) >= BigInt(data.total) || isFetching} onClick={() => { setPage(page + 1); setSearch(''); }}>Next</button></nav></div>
  </>;
}
