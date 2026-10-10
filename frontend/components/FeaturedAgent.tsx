'use client';
import { useAgents, useSnapshot } from '@/lib/queries';
import { shardDisplay } from '@/lib/shard-history';
import { explorerAddress, explorerTx, truncate } from '@/lib/contracts';
import { Icon } from './Icon';
import PasskeyAuth from './PasskeyAuth';
import Tooltip from './Tooltip';
import AgentTaskAction from './AgentTaskAction';
import styles from './FeaturedAgent.module.css';

function serviceLink(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
function cardLink(uri: string) {
  const match = /^ipfs:\/\/(?:ipfs\/)?([a-zA-Z0-9]+)(\/[a-zA-Z0-9_./-]*)?$/.exec(uri);
  return match && !(match[2] || '').split('/').some(segment => segment === '..' || segment === '.') ? `https://gateway.pinata.cloud/ipfs/${match[1]}${match[2] || ''}` : undefined;
}

export default function FeaturedAgent() {
  // Agent #1 remains featured when the directory searches or paginates another page.
  const { data, isPending, error } = useAgents(0);
  const { data: snapshot, error: historyError } = useSnapshot();
  const agent = data?.agents.find(item => item.id === '1');
  if (!agent) return <section id="agent-1" className={styles.feature} aria-labelledby="featured-agent-title" aria-busy={isPending}>
    <span className={styles.eyebrow}>FEATURED IDENTITY · #1</span><h2 id="featured-agent-title">Meet the Monad Observer</h2>
    <p>{isPending ? 'Loading its identity and published capabilities from Monad Testnet…' : error ? 'Agent #1 could not be read. Refresh the directory to check its on-chain identity.' : 'Agent #1 is not available in this registry’s current response.'}</p>
  </section>;
  const mcp = agent.endpoints.find(endpoint => endpoint.name.toLowerCase() === 'mcp');
  const metadataUrl = cardLink(agent.uri); const endpointUrl = mcp && serviceLink(mcp.endpoint);
  const history = shardDisplay(snapshot);
  const tasks = history.shards.filter(shard => shard.agentId === agent.id);
  const recent = [...tasks].sort((a, b) => BigInt(a.createdBlock) < BigInt(b.createdBlock) ? 1 : BigInt(a.createdBlock) > BigInt(b.createdBlock) ? -1 : 0).slice(0, 3);
  const historyAvailable = snapshot?.eventsAvailable && !historyError;
  return <section id="agent-1" className={styles.feature} aria-labelledby="featured-agent-title">
    <div className={styles.featureTop}><span className={styles.eyebrow}>MEET YOUR FIRST AGENT</span><span className={styles.identity}><i />On-chain identity · Monad Testnet</span></div>
    <div className={styles.featureLayout}>
      <div className={styles.profile}>
        <div className={styles.profileHeader}><div className={styles.avatar}><Icon name="agents" size={32} /></div><div><span className={styles.token}>ERC-721 TOKEN #1</span><h2 id="featured-agent-title">{agent.name}</h2></div></div>
        <p className={styles.description}>{agent.description || 'Read this agent’s published identity, endpoints, and reputation.'}</p>
        <div className={styles.capabilities}>{agent.capabilities.map(capability => <span key={capability}>{capability}</span>)}</div>
        <div className={styles.metrics}>
          <div><span><Tooltip content="Verified AI Passport. This token links an owner to the agent’s published identity; it does not certify every claim in its card.">Agent identity</Tooltip></span><strong>#1 <small>ERC-8004</small></strong></div>
          <div><span><Tooltip content="The mean of on-chain feedback tagged quality. Feedback is uncurated and is not a guarantee of trustworthiness.">Live reputation</Tooltip></span><strong>{agent.score ?? (agent.reputationError ? 'Unavailable' : 'Unrated')}{agent.score !== null && <small> mean</small>}</strong></div>
          <div><span>Client feedback</span><strong>{agent.feedbackCount ?? '—'} <small>reviews</small></strong></div>
        </div>
        {agent.reputationError && <p className={styles.error}>{agent.reputationError}</p>}
        {agent.metadataError && <p className={styles.error}>{agent.metadataError}</p>}
        <dl className={styles.details}>
          <div><dt>IPFS Agent Card <Tooltip content="The published capability description and service addresses linked to the agent’s identity." label="Explain Agent Card">(?)</Tooltip></dt><dd>{metadataUrl ? <a href={metadataUrl} target="_blank" rel="noreferrer">{agent.uri}<Icon name="external" size={14} /></a> : agent.uri || 'No Agent Card published'}</dd></div>
          <div><dt>MCP service</dt><dd>{endpointUrl ? <a href={endpointUrl} target="_blank" rel="noreferrer">{mcp?.endpoint}<Icon name="external" size={14} /></a> : mcp?.endpoint || 'No MCP endpoint available'}</dd></div>
          <div><dt>Agent owner</dt><dd><a href={explorerAddress(agent.owner)} target="_blank" rel="noreferrer">{truncate(agent.owner, 8)}<Icon name="external" size={14} /></a></dd></div>
        </dl>
        <p className={styles.note}>The published MCP endpoint uses JSON-RPC over HTTP POST. Opening its URL in a browser shows protocol instructions.</p>
        <div className={styles.delegate}><PasskeyAuth variant="button" agentId="1" /><span>Delegate task authority with an expiry you control.</span></div>
      </div>
      <aside className={styles.execution}><AgentTaskAction agentId={agent.id} mcpEndpoint={endpointUrl} /><div className={styles.history}>
        <div className={styles.historyHeading}><h3>{history.indexedHistory ? 'Indexed task history' : 'Recent task history'}</h3><span>{snapshot?.source.kind === 'envio' ? 'Envio indexed' : 'RPC events'}</span></div>
        {!historyAvailable ? <p className={styles.note}>{historyError || snapshot ? 'Task history is unavailable. The agent’s identity is shown independently.' : 'Checking the latest execution events…'}</p> : recent.length ? <ul>{recent.map(task => <li key={task.address}><div><span>{task.status === 'executed' ? 'Executed' : 'Shard created'}</span><small>Block {task.createdBlock}</small></div><a href={explorerTx(task.executionTransactionHash || task.transactionHash)} target="_blank" rel="noreferrer">{truncate(task.taskId, 5)}<Icon name="external" size={13} /></a></li>)}</ul> : <p className={styles.note}>{history.indexedHistory ? 'No tasks for this agent among the latest indexed task lanes.' : 'No tasks observed in the current event window. A confirmed paid run will leave an explorer receipt here.'}</p>}
        {historyAvailable && <p className={styles.note}>{history.indexedHistory ? <>Latest indexed records through block {history.toBlock}{history.resultsLimited ? ' · Within the latest 200 task lanes' : ''}.</> : <>Blocks {history.fromBlock}–{history.toBlock}{history.resultsLimited ? ' · Results limited' : ''}. This window is not a lifetime total.</>}</p>}
      </div></aside>
    </div>
  </section>;
}
