import type { Snapshot } from './types';

/** Keep historical task records separate from the recent activity counters. */
export function shardDisplay(snapshot?: Snapshot) {
  const history = snapshot?.source.kind === 'envio' ? snapshot.shardHistory : undefined;
  return {
    shards: snapshot?.eventsAvailable ? history?.shards ?? snapshot.shards : [],
    indexedHistory: Boolean(history),
    resultsLimited: history?.resultsLimited ?? snapshot?.resultsLimited ?? false,
    fromBlock: history?.fromBlock ?? snapshot?.fromBlock,
    toBlock: history?.toBlock ?? snapshot?.source.indexedThrough ?? snapshot?.blockNumber,
    scopeLabel: history ? 'Indexed task history' : 'Recent block window',
  };
}
