import { explorerAddress, truncate } from '@/lib/contracts';
import type { Agent } from '@/lib/types';
import { Icon } from './Icon';
import Tooltip, { glossary } from './Tooltip';
import styles from './AgentCard.module.css';

function metadataLink(uri: string) {
  const ipfs = /^ipfs:\/\/(?:ipfs\/)?([a-zA-Z0-9]+)(\/[a-zA-Z0-9_./-]*)?$/.exec(uri);
  if (ipfs && !(ipfs[2] || '').split('/').some(part => part === '.' || part === '..')) {
    return `https://gateway.pinata.cloud/ipfs/${ipfs[1]}${ipfs[2] || ''}`;
  }
  try {
    const url = new URL(uri);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

export default function AgentCard({ agent }: { agent: Agent }) {
  const cardUrl = metadataLink(agent.uri);
  const description = agent.description || 'This agent has not provided a description.';
  return <article className={styles.card} data-testid={`directory-agent-${agent.id}`} aria-labelledby={`directory-agent-title-${agent.id}`}>
    <div className={styles.top}>
      <span className={styles.avatar}><Icon name="agents" size={25} /></span>
      <Tooltip content={glossary.identity} label={`Explain agent ${agent.id} identity`}><span className={styles.identity}>ERC-8004 #{agent.id}</span></Tooltip>
    </div>
    <h2 id={`directory-agent-title-${agent.id}`}>{agent.name}</h2>
    <a className={styles.owner} href={explorerAddress(agent.owner)} target="_blank" rel="noreferrer" title={agent.owner} aria-label={`View owner ${agent.owner} on Monad explorer`}>
      <span>Owner</span><code>{truncate(agent.owner)}</code><Icon name="external" size={12} />
    </a>
    <p className={styles.description}>{description}</p>
    <div className={styles.capabilities} aria-label="Published capabilities">
      {agent.capabilities.length ? agent.capabilities.map(capability => <span key={capability}>{capability}</span>) : <span className={styles.noCapabilities}>No capabilities published</span>}
    </div>
    <dl className={styles.reputation}>
      <div><dt><Tooltip content="The average of feedback tagged quality. Reviews are uncurated, so this is not a percentage or a guarantee of trustworthiness.">Quality score</Tooltip></dt><dd>{agent.score ?? (agent.reputationError ? 'Unavailable' : 'Unrated')}{agent.score !== null && <small>mean</small>}</dd></div>
      <div><dt>Feedback</dt><dd>{agent.feedbackCount ?? '—'}<small>reviews</small></dd></div>
    </dl>
    {agent.tasksCompleted !== undefined && <p className={styles.taskCount}><Icon name="activity" size={14} /><span>{agent.tasksCompleted} indexed task completions</span></p>}
    {agent.metadataError && <p className={styles.warning}>{agent.metadataError}</p>}
    {agent.reputationError && <p className={styles.warning}>{agent.reputationError}</p>}
    <details className={styles.details}>
      <summary>Agent Card & endpoints <span aria-hidden="true">+</span></summary>
      <div className={styles.detailBody}>
        <div><h3>Agent Card</h3>{cardUrl ? <a href={cardUrl} target="_blank" rel="noreferrer">{agent.uri}<Icon name="external" size={12} /></a> : <code>{agent.uri || 'No Agent Card URI'}</code>}</div>
        {agent.description && <div><h3>Published description</h3><p>{agent.description}</p></div>}
        {agent.endpoints.length ? agent.endpoints.map((endpoint, index) => <div key={`${endpoint.name}-${index}`}><h3>{endpoint.name}</h3><code>{endpoint.endpoint}</code></div>) : <p>No service endpoints published.</p>}
      </div>
    </details>
  </article>;
}
