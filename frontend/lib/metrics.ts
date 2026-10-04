export type MetricReading = { value: number | null; kind: 'live' | 'sample' | 'cached' | 'loading'; badge: string };

/** Keep illustrative values identifiable, and preserve real zeroes and cached readings. */
export function metricReading(live: number | null | undefined, sample: number, loading: boolean, stale = false): MetricReading {
  if (live != null && Number.isFinite(live) && live >= 0 && live <= Number.MAX_SAFE_INTEGER) {
    return { value: live, kind: stale ? 'cached' : 'live', badge: stale ? 'Last observed' : 'Live data' };
  }
  if (loading) return { value: null, kind: 'loading', badge: 'Connecting' };
  return { value: sample, kind: 'sample', badge: 'Sample data' };
}
