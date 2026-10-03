'use client';

import { useId, useState, type CSSProperties } from 'react';
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
        <span className={styles.eyebrow}>ILLUSTRATIVE COMPARISON</span>
        <h2 id={`${panelId}-title`}>Five agents. One traffic jam?</h2>
        <p>See what changes when every task gets its own private lane.</p>
      </div>
      <button type="button" className={styles.pause} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? 'Resume animation' : 'Pause animation'}</button>
    </div>

    <div className={styles.switch} role="group" aria-label="Execution mode comparison">
      <button type="button" aria-pressed={!parallel} aria-controls={panelId} onClick={() => setMode('standard')}>
        <span aria-hidden="true">↔</span> Standard EVM Mode
      </button>
      <button type="button" aria-pressed={parallel} aria-controls={panelId} onClick={() => setMode('parallel')}>
        <span aria-hidden="true">⇉</span> Aetheris Parallel Mode
      </button>
    </div>

    <div id={panelId} className={styles.stage} aria-describedby={descriptionId}>
      <div className={styles.stageHeading} aria-live="polite" aria-atomic="true">
        <span className={styles.statusDot} aria-hidden="true" />
        <strong>{parallel ? 'A private lane for every task' : 'Every agent reaches for the same state'}</strong>
        <span className={styles.scenarioTag}>EXAMPLE SCENARIO</span>
      </div>

      {parallel ? <div className={styles.lanes} role="img" aria-label="Five AI agents have separate green execution lanes, each using its own CREATE2 ephemeral storage shard.">
        {agents.map((agent) => <div className={styles.lane} key={agent} style={{ '--lane-delay': `${(agent - 1) * -0.35}s` } as CSSProperties}>
          <div className={styles.agent}><span className={styles.agentIcon} aria-hidden="true">◈</span><span>Agent {agent}</span></div>
          <div className={styles.track}><span className={styles.packet} /><span className={styles.shard}>Private shard <b>0{agent}</b></span></div>
          <div className={styles.check} aria-hidden="true">✓</div>
        </div>)}
        <div className={styles.laneCaption}><span>AI AGENTS</span><span>CREATE2 EPHEMERAL SHARDS</span><span>OUTPUTS</span></div>
      </div> : <div className={styles.conflictGraph} role="img" aria-label="Five AI agents connect through pulsing red conflict lines to a shared storage slot, illustrating tasks competing to update the same state.">
        <svg className={styles.wires} viewBox="0 0 720 284" preserveAspectRatio="none" aria-hidden="true">
          {agents.map((agent) => <path key={agent} d={`M 146 ${(agent - 1) * 52 + 26} C 320 ${(agent - 1) * 52 + 26}, 334 132, 520 132`} className={styles.conflictWire} style={{ animationDelay: `${agent * -0.24}s` }} />)}
          <path d="M 300 75 L 398 194 M 300 194 L 398 75" className={styles.crossingWire} />
        </svg>
        <div className={styles.waitingAgents}>{agents.map((agent) => <div className={styles.waitingAgent} key={agent}><span aria-hidden="true">◈</span> Agent {agent}</div>)}</div>
        <div className={styles.conflictFlag}><span aria-hidden="true">!</span> Conflict</div>
        <div className={styles.sharedState}><span className={styles.storageIcon} aria-hidden="true">▤</span><strong>Shared state</strong><small>One contested storage slot</small><span className={styles.waitingTag}>TASKS WAIT / RETRY</span></div>
      </div>}

      <p className={styles.explanation} id={descriptionId}>{parallel
        ? 'Aetheris creates a separate contract address for each task. Agents can write their outputs without competing for that task’s storage.'
        : 'In this example, five tasks try to update shared storage. Conflicting writes can force tasks to wait or run again.'}</p>
    </div>

    <dl className={styles.metrics} aria-label="Illustrative scenario metrics">
      {parallel ? <>
        <div><dt>State Collisions</dt><dd>0 <span>in this illustration</span></dd></div>
        <div><dt>Parallel Efficiency</dt><dd>100% <span>idealized scenario</span></dd></div>
        <div><dt>Monad Settlement</dt><dd>300ms <span>Single-Slot illustration</span></dd></div>
      </> : <>
        <div><dt>State Access Collisions</dt><dd>HIGH <span>shared storage scenario</span></dd></div>
        <div><dt>Re-execution Delay</dt><dd>+1,200ms <span>illustrative delay</span></dd></div>
        <div><dt>Throughput Bottleneck</dt><dd>ACTIVE <span>tasks share a storage slot</span></dd></div>
      </>}
    </dl>
    <p className={styles.footnote}>Illustrative comparison, not a benchmark. The delay, 100% efficiency and 300ms settlement are scenario values, not measured results or network guarantees. Shared-state contention depends on the workload. Explore actual on-chain events below.</p>
  </section>;
}
