'use client';
import { createContext, useContext } from 'react';

export interface AccessSession {
  ready: boolean;
  address?: string;
  openSignIn(): void;
  openAccess(agentId?: string): void;
  withWalletPrompt<T>(action: () => Promise<T>): Promise<T>;
}
export const AccessContext = createContext<AccessSession | undefined>(undefined);
export function useAccessSession() {
  const session = useContext(AccessContext);
  if (!session) throw new Error('Wallet controls must be inside WalletSession.');
  return session;
}
