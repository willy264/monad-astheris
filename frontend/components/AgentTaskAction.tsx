'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { boundedJson, parseConfig } from '@/lib/demo-protocol';
import { dynamicEnvironmentId } from '@/lib/dynamic-config';
import { Icon } from './Icon';
import styles from './FeaturedAgent.module.css';

const AgentTaskWallet = dynamic(() => import('./AgentTaskWallet'), { ssr: false, loading: () => <p className={styles.note}>Preparing your wallet controls…</p> });

export default function AgentTaskAction({ agentId, mcpEndpoint }: { agentId: string; mcpEndpoint?: string }) {
  const [matchingService, setMatchingService] = useState(false);
  useEffect(() => { setMatchingService(mcpEndpoint === new URL('/api/mcp', window.location.origin).href); }, [mcpEndpoint]);
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ['directory-task-config'], retry: false, staleTime: 30000,
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/demo/config', { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
      if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new Error('Paid execution is awaiting service setup. The operator must enable the task service, delegated executor, and testnet payment settings.'); }
      return parseConfig(await boundedJson(response));
    },
  });
  const available = Boolean(dynamicEnvironmentId && data && data.agentId === agentId && mcpEndpoint && matchingService);
  return <div className={styles.taskAction}>
    <div className={styles.taskHeading}><Icon name="activity" size={18} /><strong>Put this agent to work</strong><span className={available ? styles.ready : styles.pending}>{available ? 'Wallet approval required' : 'Setup pending'}</span></div>
    <p>Read a live Monad block through its MCP service, then sign one task and one testnet payment to commit the observation.</p>
    {available && data && mcpEndpoint ? <AgentTaskWallet config={data} mcpEndpoint={mcpEndpoint} /> : <>
      <button type="button" className={styles.taskButton} disabled><Icon name="arrow" size={17} />Trigger paid x402 task</button>
      <p className={styles.note} role="status">{isPending ? 'Checking paid task availability…' : !dynamicEnvironmentId ? 'Connect a Dynamic environment to enable wallet signing.' : !mcpEndpoint ? 'A valid MCP service must be published in the Agent Card before a task can run.' : !matchingService ? 'Run paid tasks from the Agent Card’s registered service origin. This preview does not dispatch to another service.' : error?.message || (data?.agentId !== agentId ? 'The paid task service is configured for another agent.' : 'Paid task service is not configured.')}</p>
      {!isPending && <button type="button" className={styles.textButton} disabled={isFetching} onClick={() => void refetch()}>{isFetching ? 'Checking…' : 'Check availability again'}</button>}
    </>}
  </div>;
}
