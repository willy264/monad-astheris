'use client';

import { useId, useState, type CSSProperties } from 'react';
import { Icon } from './Icon';
import Tooltip, { glossary } from './Tooltip';
import styles from './ExecutionComparison.module.css';

type ExecutionMode = 'standard' | 'parallel';
const agents = [1, 2, 3, 4, 5];

export function ExecutionComparison() {
  const [mode, setMode] = useState<ExecutionMode>('parallel');
  const [paused, setPaused] = useState(false);
  const descriptionId = useId();
  const panelId = useId();
  const parallel = mode === 'parallel';

  return <section className={`${styles.comparison} ${parallel ? styles.parallel : styles.standard} ${paused ? styles.paused : ''}`} aria-labelledby={`${panelId}-title`}>
    <div className={styles.heading}>
      <div>
        <span className={styles.eyebrow}>THE DIFFERENCE, IN ONE CLICK · ILLUSTRATIVE COMPARISON</span>
        <h2 id={`${panelId}-title`}>Traffic jam. Meet express checkout.</h2>
        <p>Five agents sharing one checkout. Or five tasks with a lane of their own.</p>
      </div>
      <button type="button" className={styles.pause} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? 'Resume animation' : 'Pause animation'}</button>
    </div>

    <div className={styles.switch} role="group" aria-label="Execution mode comparison">
      <button type="button" aria-pressed={!parallel} aria-controls={panelId} onClick={() => setMode('standard')}>
        <Icon name="activity" size={19} /> Standard EVM Mode
      </button>
      <button type="button" aria-pressed={parallel} aria-controls={panelId} onClick={() => setMode('parallel')}>
        <Icon name="layers" size={19} /> Aetheris Parallel Mode
      </button>
    </div>

    <div id={panelId} className={styles.stage} aria-describedby={descriptionId}>
      <div className={styles.stageHeading} aria-live="polite" aria-atomic="true">
        <span className={styles.statusDot} aria-hidden="true" />
        <strong>{parallel ? 'Five independent lanes. Five separate results.' : 'State access collision! Everyone reaches for the same slot.'}</strong>
        <span className={styles.scenarioTag}>{parallel ? 'SEPARATE TASK STORAGE' : 'SHARED TASK STORAGE'}</span>
      </div>

      {parallel ? <div className={styles.lanes} role="img" aria-label="Five AI agents have separate green execution lanes, each using its own CREATE2 ephemeral storage shard.">
        {agents.map((agent) => <div className={styles.lane} key={agent} style={{ '--lane-delay': `${(agent - 1) * -0.35}s` } as CSSProperties}>
          <div className={styles.agent}><span className={styles.agentIcon}><Icon name="agents" size={17} /></span><span>Agent {agent}</span></div>
          <div className={styles.track}><span className={styles.packet} /><span className={styles.shard}>Express lane <b>0{agent}</b></span></div>
          <div className={styles.check} aria-hidden="true">✓</div>
        </div>)}
        <div className={styles.laneCaption}><span>AI AGENTS</span><span>CREATE2 EPHEMERAL SHARDS</span><span>OUTPUTS</span></div>
      </div> : <div className={styles.conflictGraph} role="img" aria-label="Five AI agents connect through pulsing red conflict lines to a shared storage slot, illustrating tasks competing to update the same state.">
        <svg className={styles.wires} viewBox="0 0 720 284" preserveAspectRatio="none" aria-hidden="true">
          {agents.map((agent) => <path key={agent} d={`M 146 ${(agent - 1) * 52 + 26} C 320 ${(agent - 1) * 52 + 26}, 334 132, 520 132`} className={styles.conflictWire} style={{ animationDelay: `${agent * -0.24}s` }} />)}
          <path d="M 300 75 L 398 194 M 300 194 L 398 75" className={styles.crossingWire} />
        </svg>
        <div className={styles.waitingAgents}>{agents.map((agent) => <div className={styles.waitingAgent} key={agent}><Icon name="agents" size={17} /> Agent {agent}</div>)}</div>
        <div className={styles.conflictFlag}><span aria-hidden="true">!</span> Conflict</div>
        <div className={styles.sharedState}><span className={styles.storageIcon}><Icon name="layers" size={28} /></span><strong>One checkout</strong><small>Shared storage · tasks contend</small><span className={styles.waitingTag}>12 RE-EXECUTIONS TRIGGERED</span></div>
      </div>}

      <p className={styles.explanation} id={descriptionId}>{parallel
        ? 'Each task gets a unique CREATE2 contract: an express checkout lane for its result. Its storage stays separate from the other tasks.'
        : 'These agents try to update the same storage slot. In this example, conflicting updates trigger 12 re-executions: a blockchain traffic jam.'}</p>
    </div>

    <dl className={styles.metrics} aria-label="Illustrative scenario metrics">
      {parallel ? <>
        <div><dt>Task storage collisions</dt><dd>0 <span>illustrative scenario</span></dd></div>
        <div><dt>Parallel efficiency</dt><dd>100% <span>idealized illustration</span></dd></div>
        <div><dt>Example settlement</dt><dd>300<span className={styles.unit}>ms</span> <span>scenario timing · unmeasured</span></dd></div>
      </> : <>
        <div><dt>State Access Collisions</dt><dd>HIGH <span>shared storage scenario</span></dd></div>
        <div><dt>Re-execution Delay</dt><dd>+1,200ms <span>illustrative delay</span></dd></div>
        <div><dt>Throughput Bottleneck</dt><dd>ACTIVE <span>tasks share a storage slot</span></dd></div>
      </>}
    </dl>
    <div className={styles.glossary} aria-label="Plain-English protocol glossary">
      <Tooltip content={`Verified AI Passport — ${glossary.identity}`}>ERC-8004</Tooltip>
      <span aria-hidden="true">→</span>
      <Tooltip content={`Express Checkout Lane — ${glossary.shard}`}>Ephemeral Shard</Tooltip>
      <span aria-hidden="true">→</span>
      <Tooltip content={`Compressed Digital Receipt — ${glossary.merkle}`}>Merkle Batch</Tooltip>
    </div>
    <p className={styles.footnote}>Illustrative scenario. Retries, 100% efficiency and 300ms timing explain the model; they are not measured performance or finality. Real contention depends on the workload, and shared router state can still contend. Actual on-chain records are shown separately below.</p>
  </section>;
}
