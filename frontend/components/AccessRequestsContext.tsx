'use client';
import { createContext, useContext } from 'react';
import type { AccessConfig, AccessRequest } from '@/lib/access-protocol';
import type { AccessAvailability } from '@/lib/access-service';

export interface AccessRequestsSession {
  address?: string; ready: boolean; authenticated: boolean; requests: AccessRequest[];
  loading: boolean; busy: boolean; error: string; config?: AccessConfig;
  availability: AccessAvailability; needsInboxRefresh: boolean; checkAvailability(): Promise<void>;
  hasNextPage: boolean; hasPreviousPage: boolean; nextPage(): Promise<void>; previousPage(): Promise<void>;
  pendingApproval?: { id: string; hash: string };
  connect(): Promise<void>; refresh(): Promise<void>;
  requestAccess(durationSeconds: number, reason: string): Promise<void>;
  approve(request: AccessRequest): Promise<void>; deny(request: AccessRequest, note: string): Promise<void>;
  recoverApproval(request: AccessRequest, hash: string): Promise<void>; cancelApproval(request: AccessRequest): Promise<void>;
  markSeen(items: { id: string; revision: number }[]): Promise<void>; clearError(): void;
}
const unavailable = async () => { throw new Error('Wallet access is still loading.'); };
export const AccessRequestsContext = createContext<AccessRequestsSession>({ ready: false, authenticated: false, requests: [], loading: false, busy: false, error: '', availability: 'checking', needsInboxRefresh: false, checkAvailability: unavailable, hasNextPage: false, hasPreviousPage: false, nextPage: unavailable, previousPage: unavailable, connect: unavailable, refresh: unavailable, requestAccess: unavailable, approve: unavailable, deny: unavailable, recoverApproval: unavailable, cancelApproval: unavailable, markSeen: unavailable, clearError: () => {} });
export const useAccessRequests = () => useContext(AccessRequestsContext);
