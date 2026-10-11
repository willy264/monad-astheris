import type { Snapshot } from './types';

/** Never promote a bounded history list into an all-indexed count. */
export function activityMetrics(snapshot?: Snapshot) {
  const available = Boolean(snapshot?.eventsAvailable);
  const totals = snapshot?.source.kind === 'envio' ? snapshot.indexedTotals : undefined;
  const indexedTotalsUnavailable = available && snapshot?.source.kind === 'envio' && !totals;
  return {
    taskLanes: available && !indexedTotalsUnavailable ? totals?.completedTaskLanes ?? snapshot!.shards.filter(shard => shard.status === 'executed').length : null,
    indexedTotal: Boolean(totals),
    indexedTotalsUnavailable,
    taskLanesLimited: !totals && Boolean(snapshot?.resultsLimited),
    verifiedBatchRoots: available && totals ? totals.verifiedBatchRoots : null,
    indexedThrough: totals?.toBlock,
  };
}
