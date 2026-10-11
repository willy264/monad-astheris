'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import { toHex, type Address, type Hex } from 'viem';
import { accessApprovalData, accessSessionData, type AccessAction, type AccessAuth, type AccessConfig, type AccessRequest } from '@/lib/access-protocol';
import { AccessHttpError, clearApproval, fetchAccessConfig, isWalletRejection, readApproval, saveApproval, sendAccessAction, withApprovalLock } from '@/lib/access-client';
import { ensure, hash, same } from '@/lib/demo-protocol';
import { contracts, identityAbi, monadTestnet, routerAbi, walletPublicClient as rpc } from '@/lib/contracts';
import { userErrorMessage } from '@/lib/user-error';
import { useAccessSession } from './AccessContext';
import { AccessRequestsContext } from './AccessRequestsContext';

export default function AccessRequestsProvider({ children }: { children: ReactNode }) {
  const session = useAccessSession();
  const { primaryWallet } = useDynamicContext();
  const address = session.address?.toLowerCase() as Address | undefined;
  const queryClient = useQueryClient();
  const [auth, setAuth] = useState<AccessAuth>();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [pendingApproval, setPendingApproval] = useState<{ id: string; hash: string }>();
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const cursor = pages[pages.length - 1];
  const busyRef = useRef(false), mounted = useRef(true);
  const latest = useRef(address); latest.current = address;
  const authRef = useRef(auth); authRef.current = auth;
  const configQuery = useQuery({ queryKey: ['access-service-config'], enabled: session.ready && !!address,
    queryFn: ({ signal }) => fetchAccessConfig(signal), retry: false, staleTime: 30000 });
  const config = configQuery.data;
  const validAuth = auth && same(auth.wallet, address || '') && auth.expiresAt > Math.floor(Date.now() / 1000) ? auth : undefined;
  const inboxKey = ['access-inbox', address, config?.router, validAuth?.expiresAt, cursor];
  const inbox = useQuery({ queryKey: inboxKey, enabled: !!validAuth && !!config,
    queryFn: ({ signal }) => sendAccessAction(validAuth!, 'list', cursor ? { cursor } : {}, signal), retry: false, refetchInterval: 15000,
    refetchIntervalInBackground: false, staleTime: 10000 });
  const fresh = useCallback((actor: Address) => {
    ensure(mounted.current && same(latest.current, actor), 'The wallet changed. Return to the original wallet to check this request.');
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    setAuth(undefined); setError(''); setPendingApproval(undefined); setPages([undefined]);
    // No private inbox from a previous account should remain in the query cache.
    void queryClient.cancelQueries({ queryKey: ['access-inbox'] });
    queryClient.removeQueries({ queryKey: ['access-inbox'] });
  }, [address, queryClient]);
  useEffect(() => {
    if (!auth) return;
    const timer = window.setTimeout(() => { setAuth(undefined); queryClient.removeQueries({ queryKey: ['access-inbox'] }); }, Math.max(0, auth.expiresAt * 1000 - Date.now()));
    return () => window.clearTimeout(timer);
  }, [auth, queryClient]);

  async function run<T>(action: () => Promise<T>): Promise<T> {
    if (busyRef.current) throw new Error('Finish the current wallet request first.');
    const actor = address; busyRef.current = true; setBusy(true); setError('');
    try { return await action(); }
    catch (cause) {
      if (cause instanceof AccessHttpError && cause.status === 401) setAuth(undefined);
      const message = userErrorMessage(cause, 'The access request could not be completed. Check the inbox before trying again.');
      if (mounted.current && latest.current === actor) setError(message);
      throw new Error(message);
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  async function serviceConfig(): Promise<AccessConfig> {
    const selected = config || (await configQuery.refetch()).data;
    ensure(selected, 'Access requests are not available yet. The task service needs the access inbox update.');
    ensure(contracts.router && contracts.identity && same(selected.router, contracts.router) && same(selected.identity, contracts.identity), 'The access service belongs to a different deployment.');
    return selected;
  }
  async function wallet(actor: Address) {
    ensure(primaryWallet && isEthereumWallet(primaryWallet), 'Connect an Ethereum wallet to manage access.'); fresh(actor);
    const client = await primaryWallet.getWalletClient(); fresh(actor);
    if (await client.getChainId() !== monadTestnet.id) await client.switchChain({ id: monadTestnet.id });
    const accounts = await client.getAddresses(); fresh(actor);
    ensure(same(accounts[0], actor) && same(client.account?.address, actor), 'The selected wallet changed. Reconnect before continuing.');
    return client;
  }
  async function authenticate(selected: AccessConfig): Promise<AccessAuth> {
    ensure(address, 'Connect your wallet first.'); const actor = address;
    const existing = authRef.current;
    if (existing && same(existing.wallet, actor) && existing.expiresAt > Math.floor(Date.now() / 1000) + 30) return existing;
    const expiresAt = Math.floor(Date.now() / 1000) + selected.sessionTtlSeconds - 5;
    const signature = await session.withWalletPrompt(async () => {
      const client = await wallet(actor);
      return client.signTypedData({ ...accessSessionData(selected, actor, expiresAt), account: actor });
    });
    fresh(actor); const next = { wallet: actor, expiresAt, signature }; authRef.current = next; setAuth(next); return next;
  }
  async function action(selected: AccessConfig, authorization: AccessAuth, name: AccessAction, payload: Record<string, unknown>) {
    fresh(authorization.wallet);
    if (name !== 'list') await queryClient.cancelQueries({ queryKey: ['access-inbox', authorization.wallet.toLowerCase()] });
    fresh(authorization.wallet); const result = await sendAccessAction(authorization, name, payload); fresh(authorization.wallet);
    if (name === 'seen') {
      await queryClient.invalidateQueries({ queryKey: ['access-inbox', authorization.wallet.toLowerCase()] });
    } else {
      const pageCursor = name === 'list' && typeof payload.cursor === 'string' ? payload.cursor : undefined;
      queryClient.setQueryData(['access-inbox', authorization.wallet.toLowerCase(), selected.router, authorization.expiresAt, pageCursor], result);
      if (name !== 'list') setPages([undefined]);
    }
    return result;
  }
  async function recover(selected: AccessConfig, authorization: AccessAuth, request: AccessRequest, transactionHash: Hex) {
    setPendingApproval({ id: request.id, hash: transactionHash });
    await rpc.waitForTransactionReceipt({ hash: transactionHash, confirmations: 2, timeout: 120000 }); fresh(authorization.wallet);
    await action(selected, authorization, 'approve', { id: request.id, transactionHash });
    clearApproval(selected, authorization.wallet, request.id); setPendingApproval(undefined);
  }
  const visibleRequests = validAuth ? inbox.data?.requests || [] : [];
  return <AccessRequestsContext.Provider value={{ address, ready: session.ready, authenticated: !!validAuth,
    requests: visibleRequests, config, busy, pendingApproval,
    hasNextPage: !!validAuth && !!inbox.data?.nextCursor, hasPreviousPage: !!validAuth && pages.length > 1,
    loading: configQuery.isFetching || (!!validAuth && inbox.isFetching),
    error: error || (configQuery.error ? userErrorMessage(configQuery.error, 'Access requests are unavailable.') : '') || (validAuth && inbox.error ? userErrorMessage(inbox.error, 'The inbox could not be refreshed.') : ''),
    clearError: () => setError(''),
    connect: () => run(async () => {
      if (!address) { session.openSignIn(); return; }
      const selected = await serviceConfig(), authorization = await authenticate(selected);
      await action(selected, authorization, 'list', {});
    }),
    refresh: () => run(async () => { const selected = await serviceConfig(), authorization = await authenticate(selected); await action(selected, authorization, 'list', cursor ? { cursor } : {}); }),
    nextPage: () => run(async () => {
      const next = inbox.data?.nextCursor; ensure(next, 'There are no older requests.');
      const selected = await serviceConfig(), authorization = await authenticate(selected);
      await action(selected, authorization, 'list', { cursor: next }); setPages(previous => [...previous, next]);
    }),
    previousPage: () => run(async () => {
      ensure(pages.length > 1, 'You are viewing the newest requests.');
      const previous = pages[pages.length - 2], selected = await serviceConfig(), authorization = await authenticate(selected);
      await action(selected, authorization, 'list', previous ? { cursor: previous } : {}); setPages(old => old.slice(0, -1));
    }),
    requestAccess: (durationSeconds, reason) => run(async () => {
      const selected = await serviceConfig(), authorization = await authenticate(selected);
      const owner = await rpc.readContract({ address: selected.identity, abi: identityAbi, functionName: 'ownerOf', args: [1n] }); fresh(authorization.wallet);
      await action(selected, authorization, 'request', { id: toHex(crypto.getRandomValues(new Uint8Array(32))), agentId: '1', owner, durationSeconds, reason: reason.trim() });
    }),
    deny: (request, note) => run(async () => {
      const selected = await serviceConfig(), authorization = await authenticate(selected);
      await action(selected, authorization, 'deny', { id: request.id, note: note.trim() });
    }),
    markSeen: async items => {
      if (!config || !validAuth || !items.length || busyRef.current) throw new Error('Inbox is not ready.');
      await action(config, validAuth, 'seen', { items });
    },
    recoverApproval: (request, transaction) => run(async () => {
      const selected = await serviceConfig(), authorization = await authenticate(selected);
      await recover(selected, authorization, request, hash(transaction.trim()));
    }),
    cancelApproval: request => run(async () => {
      const selected = await serviceConfig(), authorization = await authenticate(selected);
      await action(selected, authorization, 'cancel', { id: request.id });
      clearApproval(selected, authorization.wallet, request.id); setPendingApproval(undefined);
    }),
    approve: request => run(async () => {
      const selected = await serviceConfig(), authorization = await authenticate(selected), actor = authorization.wallet;
      ensure(same(request.owner, actor), 'Only the agent owner can approve this request.');
      await withApprovalLock(actor, async () => {
        const saved = readApproval(selected, actor, request.id);
        if (saved?.transactionHash) { await recover(selected, authorization, request, saved.transactionHash); return; }
        ensure(!saved, 'A wallet submission needs to be checked. Recover its transaction hash, or confirm that you cancelled it before starting another approval.');
        const [owner, identity, chainId, block] = await Promise.all([
          rpc.readContract({ address: selected.identity, abi: identityAbi, functionName: 'ownerOf', args: [BigInt(request.agentId)] }),
          rpc.readContract({ address: selected.router, abi: routerAbi, functionName: 'identityRegistry' }), rpc.getChainId(), rpc.getBlock(),
        ]); fresh(actor);
        ensure(same(owner, actor) && same(identity, selected.identity) && chainId === 10143, 'The owner or deployment changed. Refresh the inbox.');
        const prepared = await action(selected, authorization, 'prepare', { id: request.id });
        const approval = prepared.approval; ensure(approval && same(approval.id, request.id), 'The service did not prepare this approval.');
        ensure(approval.expiresAt >= Number(block.timestamp) + request.durationSeconds - 300 && approval.expiresAt <= Number(block.timestamp) + request.durationSeconds + 300,
          'The prepared approval duration differs from the request.');
        ensure(approval.deadline > Math.floor(Date.now() / 1000) && approval.deadline <= Math.floor(Date.now() / 1000) + 300, 'The approval prompt expired. Refresh before approving.');
        ensure(approval.relayed === selected.relayers.some(value => same(value, actor)), 'The approval mode differs from the configured owner.');
        if (approval.relayed) {
          const signature = await session.withWalletPrompt(async () => {
            const client = await wallet(actor); return client.signTypedData({ ...accessApprovalData(selected, request, approval), account: actor });
          }); fresh(actor);
          await action(selected, authorization, 'grant', { id: request.id, expiresAt: approval.expiresAt, deadline: approval.deadline, authorization: signature });
          return;
        }
        let submitted = false;
        try {
          const client = await session.withWalletPrompt(() => wallet(actor));
          const { request: transaction } = await rpc.simulateContract({ address: selected.router, abi: routerAbi, functionName: 'setDelegate',
            args: [BigInt(request.agentId), request.requester, BigInt(approval.expiresAt)], account: actor }); fresh(actor);
          saveApproval(selected, actor, { id: request.id });
          const transactionHash = await session.withWalletPrompt(async () => {
            const accounts = await client.getAddresses(), chain = await client.getChainId(); fresh(actor);
            ensure(same(accounts[0], actor) && chain === 10143, 'The wallet or network changed before approval.');
            submitted = true; return client.writeContract({ ...transaction, account: actor, chain: monadTestnet });
          });
          // Record even if the user switched accounts while the wallet was open.
          if (mounted.current && latest.current === actor) setPendingApproval({ id: request.id, hash: transactionHash });
          saveApproval(selected, actor, { id: request.id, transactionHash }); fresh(actor);
          await recover(selected, authorization, request, transactionHash);
        } catch (cause) {
          if (!submitted || isWalletRejection(cause)) {
            await sendAccessAction(authorization, 'cancel', { id: request.id }).then(() => clearApproval(selected, actor, request.id)).catch(() => {});
            if (latest.current === actor) void queryClient.invalidateQueries({ queryKey: ['access-inbox', actor] });
          }
          throw cause;
        }
      });
    }),
  }}>{children}</AccessRequestsContext.Provider>;
}
