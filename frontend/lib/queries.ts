'use client';
import { useQuery } from '@tanstack/react-query';
import type { AgentPage, Snapshot } from './types';

async function request<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`);
  return payload as T;
}
export function useSnapshot() {
  return useQuery({ queryKey: ['snapshot'], queryFn: ({ signal }) => request<Snapshot>('/api/overview', signal), refetchInterval: 12000, staleTime: 8000, retry: 1 });
}
export function useAgents(page: number) {
  return useQuery({ queryKey: ['agents', page], queryFn: ({ signal }) => request<AgentPage>(`/api/agents?page=${page}`, signal), staleTime: 30000, retry: 1 });
}
