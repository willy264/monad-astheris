import type { QueryClient } from '@tanstack/react-query';
import { fetchAccessConfig } from './access-client';

export const ACCESS_UNAVAILABLE_MESSAGE = 'Access requests are temporarily unavailable. Please try again later.';
export type AccessAvailability = 'checking' | 'ready' | 'unavailable';

export const accessConfigQueryOptions = {
  queryKey: ['access-service-config'],
  queryFn: ({ signal }: { signal: AbortSignal }) => fetchAccessConfig(signal),
  retry: false,
  staleTime: 30000,
} as const;

/** A public GET only. Never reuse cached config after a failed availability check. */
export async function checkAccessService(queryClient: QueryClient) {
  try {
    return await queryClient.fetchQuery({ ...accessConfigQueryOptions, staleTime: 0 });
  } catch {
    throw new Error(ACCESS_UNAVAILABLE_MESSAGE);
  }
}
