'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DynamicContextProvider, useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
import { dynamicEnvironmentId } from '@/lib/dynamic-config';
import { monadTestnet } from '@/lib/contracts';
import { AccessContext, type AccessSession } from './AccessContext';
import styles from './PasskeyAuth.module.css';

const WalletAccess = dynamic(() => import('./WalletAccess'), { ssr: false, loading: () => <p>Loading wallet access…</p> });
const MeraAccess = dynamic(() => import('./MeraAccess'), { ssr: false });
const initializingSession: AccessSession = {
  ready: false,
  openSignIn: () => {},
  openAccess: () => {},
  withWalletPrompt: async () => { throw new Error('Wallet access is still loading.'); },
};

function AccessController({ children }: { children: ReactNode }) {
  const { primaryWallet, sdkHasLoaded, setShowAuthFlow, showAuthFlow, showDynamicUserProfile } = useDynamicContext();
  const [open, setOpen] = useState(false);
  const [openedOnce, setOpenedOnce] = useState(false);
  const [agentId, setAgentId] = useState('1');
  const [walletPrompts, setWalletPrompts] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement>();
  const openAccess = useCallback((id = '1') => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    setAgentId(id); setOpenedOnce(true); setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => opener.current?.focus());
  }, []);
  const withWalletPrompt = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    setWalletPrompts(count => count + 1);
    // Let the native dialog leave the top layer before a wallet opens its own portal.
    dialog.current?.close();
    try { return await action(); }
    finally { setWalletPrompts(count => count - 1); }
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    // SDK portals live outside this dialog. Suspend its top layer while those portals are open.
    if (open && !showAuthFlow && !showDynamicUserProfile && walletPrompts === 0) {
      if (!element.open) { element.showModal(); heading.current?.focus(); }
    } else if (element.open) element.close();
  }, [open, showAuthFlow, showDynamicUserProfile, walletPrompts]);
  const session = useMemo(() => ({
    ready: sdkHasLoaded, address: primaryWallet?.address,
    openSignIn: () => setShowAuthFlow(true), openAccess, withWalletPrompt,
  }), [sdkHasLoaded, primaryWallet?.address, setShowAuthFlow, openAccess, withWalletPrompt]);
  return <AccessContext.Provider value={session}>{children}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="access-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    }}>
      <div className={styles.dialogHeader}><div><span className={styles.eyebrow}>YOUR AGENT. YOUR PERMISSION.</span><h2 id="access-title" ref={heading} tabIndex={-1}>Passkeys & task authority</h2><p>Connect your wallet, then choose who can execute tasks and for how long.</p></div><button type="button" className={styles.close} aria-label="Close agent access" onClick={close}>×</button></div>
      {openedOnce && <WalletAccess initialAgentId={agentId} />}
      {openedOnce && process.env.NEXT_PUBLIC_MERA_ENABLED === 'true' && <MeraAccess />}
    </dialog>
  </AccessContext.Provider>;
}

export function WalletSession({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Preserve server-rendered page content without initializing browser storage in Node.
  // Node 25 exposes localStorage, which this SDK mistakes for a browser environment.
  if (!mounted) return <AccessContext.Provider value={initializingSession}>{children}</AccessContext.Provider>;
  return <DynamicContextProvider theme="dark" settings={{ environmentId: dynamicEnvironmentId, walletConnectors: [EthereumWalletConnectors], initialAuthenticationMode: 'connect-and-sign', overrides: { evmNetworks: [{ blockExplorerUrls: [monadTestnet.blockExplorers.default.url], chainId: monadTestnet.id, chainName: monadTestnet.name, iconUrls: [], name: monadTestnet.name, nativeCurrency: monadTestnet.nativeCurrency, networkId: monadTestnet.id, rpcUrls: [...monadTestnet.rpcUrls.default.http] }] } }}><AccessController>{children}</AccessController></DynamicContextProvider>;
}
