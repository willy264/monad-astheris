import { decodeEventLog, encodeFunctionData, zeroAddress, type Address, type Hex, type TransactionReceipt, type WalletClient } from 'viem';
import { contracts, identityAbi, monadTestnet, routerAbi, walletPublicClient as rpc } from './contracts';
import { address, demoReadAbi, ensure, hash, object, same, uint, validatePayment, type DemoConfig } from './demo-protocol';
import { buildAgentURI, decodeInlineAgentCard } from './onboarding-metadata';

export type SetupConfig = Pick<DemoConfig, 'chainId' | 'router' | 'identity' | 'relayers' | 'policy' | 'challenge'>;
export interface SetupOptions { onUpdate?: (message: string) => void; isCurrent?: () => boolean; }
export interface SetupOperation {
  kind: 'register' | 'delegate'; status: 'intent' | 'submitted'; transactionHash?: Hex;
  agentId?: string; executor?: Address; expiresAt?: string; agentURI?: string;
}
export interface SetupJournal {
  version: 1; chainId: 10143; router: Address; identity: Address; wallet: Address;
  agentId?: string; registrationTx?: Hex; delegationTxs?: Record<string, Hex>; pending?: SetupOperation;
}
export interface SetupState {
  wallet: Address; agentId?: string; owner?: Address; monBalance: bigint; paymentBalance: bigint;
  paymentRequired: bigint; chainTime: bigint; signerIsRelayer: boolean;
  executors: { address: Address; authorized: boolean; expiresAt: string; validForDemo: boolean; transactionHash?: Hex }[];
  ready: boolean; pending?: SetupOperation; registrationTx?: Hex;
}

const MIN_AUTHORITY_SECONDS = 600n;
const AUTHORITY_SECONDS = 3600n;
const inFlight = new Set<string>();

function key(config: SetupConfig, wallet: Address): string {
  return `aetheris:onboarding:v1:${config.chainId}:${config.identity.toLowerCase()}:${config.router.toLowerCase()}:${wallet.toLowerCase()}`;
}
function fresh(options: SetupOptions): void { ensure(options.isCurrent?.() !== false, 'Wallet or network changed. Return to the original wallet to recover setup.'); }
function positiveId(value: unknown): string { const id = uint(value); ensure(id > 0n, 'Agent ID must be positive.'); return id.toString(); }
function executors(config: SetupConfig): Address[] {
  ensure(config.relayers.length > 0 && config.relayers.length <= 32, 'No supported executor is configured.');
  return [...new Map(config.relayers.map(value => { const checked = address(value); return [checked.toLowerCase(), checked] as const; })).values()];
}

/** Public transaction journal. Stored IDs and completion markers never confer authority. */
export function readSetup(config: SetupConfig, wallet: Address): SetupJournal | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  const raw = localStorage.getItem(key(config, wallet));
  if (raw === null) return undefined;
  ensure(raw.length <= 20_000, 'Saved setup is too large.');
  const value = object(JSON.parse(raw));
  ensure(value.version === 1 && value.chainId === config.chainId && same(address(value.wallet), wallet) && same(address(value.router), config.router) && same(address(value.identity), config.identity), 'Saved setup belongs to a different wallet or deployment.');
  const journal: SetupJournal = { version: 1, chainId: 10143, router: config.router, identity: config.identity, wallet };
  if (value.agentId !== undefined) journal.agentId = positiveId(value.agentId);
  if (value.registrationTx !== undefined) journal.registrationTx = hash(value.registrationTx);
  if (value.delegationTxs !== undefined) {
    const saved = object(value.delegationTxs); ensure(Object.keys(saved).length <= 32, 'Too many saved executor receipts.');
    journal.delegationTxs = Object.fromEntries(Object.entries(saved).map(([executor, transaction]) => [address(executor).toLowerCase(), hash(transaction)]));
  }
  if (value.pending !== undefined) {
    const pending = object(value.pending);
    ensure(pending.kind === 'register' || pending.kind === 'delegate', 'Invalid saved setup action.');
    ensure(pending.status === 'intent' || pending.status === 'submitted', 'Invalid saved setup status.');
    const operation: SetupOperation = { kind: pending.kind, status: pending.status };
    if (pending.transactionHash !== undefined) operation.transactionHash = hash(pending.transactionHash);
    ensure(operation.status !== 'submitted' || operation.transactionHash, 'Saved setup transaction hash is missing.');
    if (pending.kind === 'register') {
      ensure(typeof pending.agentURI === 'string', 'Saved Agent Card is missing.');
      decodeInlineAgentCard(pending.agentURI);
      ensure(pending.agentURI === buildAgentURI(wallet), 'Saved Agent Card differs from this wallet.');
      operation.agentURI = pending.agentURI;
    } else {
      operation.agentId = positiveId(pending.agentId); operation.executor = address(pending.executor);
      operation.expiresAt = uint(pending.expiresAt).toString();
      ensure(BigInt(operation.expiresAt) > 0n && BigInt(operation.expiresAt) < 2n ** 64n, 'Invalid saved delegation expiry.');
    }
    journal.pending = operation;
  }
  return journal;
}
function save(config: SetupConfig, wallet: Address, journal: SetupJournal): void {
  ensure(typeof localStorage !== 'undefined', 'Browser storage is required to safely recover setup transactions.');
  const encoded = JSON.stringify(journal);
  localStorage.setItem(key(config, wallet), encoded);
  ensure(localStorage.getItem(key(config, wallet)) === encoded, 'Setup recovery record could not be saved.');
}
function journalFor(config: SetupConfig, wallet: Address): SetupJournal {
  return readSetup(config, wallet) ?? { version: 1, chainId: 10143, router: config.router, identity: config.identity, wallet };
}
async function locked<T>(config: SetupConfig, wallet: Address, action: () => Promise<T>): Promise<T> {
  const scope = key(config, wallet);
  ensure(!inFlight.has(scope), 'Setup is already running in this page.');
  inFlight.add(scope);
  try {
    if (typeof navigator !== 'undefined' && navigator.locks) return await navigator.locks.request(scope, { mode: 'exclusive', ifAvailable: true }, async lock => {
      ensure(lock, 'Setup is already running in another tab.'); return action();
    });
    // Without cross-tab exclusion an ambiguous wallet prompt could mint twice.
    ensure(typeof window === 'undefined', 'This browser does not support safe setup coordination. Use a current browser over HTTPS.');
    return await action();
  } finally { inFlight.delete(scope); }
}
async function validateDeployment(config: SetupConfig): Promise<void> {
  ensure(config.chainId === 10143 && contracts.router && contracts.identity && same(config.router, contracts.router) && same(config.identity, contracts.identity), 'Setup deployment differs from the dashboard configuration.');
  executors(config); validatePayment(config.challenge, config.policy);
  ensure(await rpc.getChainId() === 10143, 'The RPC is not on Monad Testnet.');
  const linked = await rpc.readContract({ address: config.router, abi: routerAbi, functionName: 'identityRegistry' });
  ensure(same(linked, config.identity), 'The router is linked to a different identity registry.');
}
async function walletGuard(client: WalletClient, wallet: Address, options: SetupOptions): Promise<void> {
  fresh(options);
  const [chainId, accounts] = await Promise.all([client.getChainId(), client.getAddresses()]);
  fresh(options);
  ensure(chainId === 10143, 'Switch your wallet to Monad Testnet (10143).');
  ensure(same(client.account?.address, wallet) && same(accounts[0], wallet), 'The selected wallet account changed. Return to the original wallet.');
}

export async function getSetupState(config: SetupConfig, wallet: Address, agentId?: string): Promise<SetupState> {
  address(wallet); await validateDeployment(config);
  const journal = readSetup(config, wallet);
  const selected = agentId !== undefined ? positiveId(agentId) : journal?.agentId;
  const accepted = validatePayment(config.challenge, config.policy);
  const [block, monBalance, paymentBalance] = await Promise.all([
    rpc.getBlock({ blockTag: 'latest' }), rpc.getBalance({ address: wallet }),
    rpc.readContract({ address: accepted.asset, abi: demoReadAbi, functionName: 'balanceOf', args: [wallet] }),
  ]);
  const owner = selected ? await rpc.readContract({ address: config.identity, abi: identityAbi, functionName: 'ownerOf', args: [BigInt(selected)] }) : undefined;
  const grants = await Promise.all(executors(config).map(async executor => {
    if (!selected) return { address: executor, authorized: false, expiresAt: '0', validForDemo: false };
    const [grant, authorized] = await Promise.all([
      rpc.readContract({ address: config.router, abi: routerAbi, functionName: 'delegates', args: [BigInt(selected), executor] }),
      rpc.readContract({ address: config.router, abi: routerAbi, functionName: 'isAuthorized', args: [BigInt(selected), executor] }),
    ]);
    return { address: executor, authorized, expiresAt: grant[1].toString(), validForDemo: authorized && same(grant[0], wallet) && grant[1] >= block.timestamp + MIN_AUTHORITY_SECONDS,
      transactionHash: selected === journal?.agentId ? journal?.delegationTxs?.[executor.toLowerCase()] : undefined };
  }));
  const signerIsRelayer = grants.some(grant => same(grant.address, wallet));
  const paymentRequired = BigInt(accepted.amount) * 5n;
  return { wallet, agentId: selected, owner, monBalance, paymentBalance, paymentRequired, chainTime: block.timestamp, signerIsRelayer,
    executors: grants, pending: journal?.pending, registrationTx: selected === journal?.agentId ? journal?.registrationTx : undefined,
    ready: !!selected && same(owner, wallet) && !signerIsRelayer && !journal?.pending && paymentBalance >= paymentRequired && grants.every(grant => grant.validForDemo),
  };
}

/** Remember an explicitly selected, RPC-verified identity so paid recovery survives reload. */
export async function persistVerifiedSelection(config: SetupConfig, wallet: Address, agentId: string, options: SetupOptions = {}): Promise<SetupState> {
  return locked(config, wallet, async () => {
    fresh(options);
    const selected = positiveId(agentId);
    const journal = journalFor(config, wallet);
    ensure(!journal.pending, 'Recover the pending setup transaction before selecting another agent.');
    const state = await getSetupState(config, wallet, selected); fresh(options);
    ensure(same(state.owner, wallet), 'Only an agent owned by this connected wallet can be selected.');
    ensure(!state.signerIsRelayer, 'Use a personal wallet, separate from the daemon executor keys.');
    if (journal.agentId !== selected) { delete journal.registrationTx; delete journal.delegationTxs; }
    journal.agentId = selected; save(config, wallet, journal);
    return state;
  });
}

function operationCall(config: SetupConfig, operation: SetupOperation) {
  return operation.kind === 'register'
    ? { to: config.identity, data: encodeFunctionData({ abi: identityAbi, functionName: 'register', args: [operation.agentURI!] }) }
    : { to: config.router, data: encodeFunctionData({ abi: routerAbi, functionName: 'setDelegate', args: [BigInt(operation.agentId!), operation.executor!, BigInt(operation.expiresAt!)] }) };
}

/** Verify events as well as the transaction envelope; a cancelled replacement is never success. */
export function verifySetupReceipt(config: SetupConfig, wallet: Address, operation: SetupOperation, expectedHash: Hex, receipt: TransactionReceipt): string | undefined {
  const call = operationCall(config, operation);
  ensure(same(receipt.transactionHash, expectedHash) && receipt.status === 'success' && same(receipt.from, wallet) && same(receipt.to, call.to), 'Setup receipt was reverted, replaced, or belongs to a different wallet or contract.');
  if (operation.kind === 'register') {
    const registered = receipt.logs.filter(log => same(log.address, config.identity)).flatMap(log => { try { const event = decodeEventLog({ abi: identityAbi, ...log, strict: true }); return event.eventName === 'Registered' ? [event.args] : []; } catch { return []; } });
    ensure(registered.length === 1 && same(registered[0].owner, wallet) && registered[0].agentURI === operation.agentURI && registered[0].agentId > 0n, 'The expected agent registration event is missing.');
    const id = registered[0].agentId;
    const minted = receipt.logs.filter(log => same(log.address, config.identity)).flatMap(log => { try { const event = decodeEventLog({ abi: identityAbi, ...log, strict: true }); return event.eventName === 'Transfer' ? [event.args] : []; } catch { return []; } });
    ensure(minted.filter(event => same(event.from, zeroAddress) && same(event.to, wallet) && event.tokenId === id).length === 1, 'The expected ERC-721 mint event is missing.');
    return id.toString();
  }
  const grants = receipt.logs.filter(log => same(log.address, config.router)).flatMap(log => { try { const event = decodeEventLog({ abi: routerAbi, ...log, strict: true }); return event.eventName === 'DelegateSet' ? [event.args] : []; } catch { return []; } });
  ensure(grants.length === 1 && grants[0].agentId === BigInt(operation.agentId!) && same(grants[0].delegate, operation.executor!) && grants[0].expiresAt === BigInt(operation.expiresAt!) && same(grants[0].owner, wallet), 'The expected executor delegation event is missing.');
  return operation.agentId;
}

async function reconcile(config: SetupConfig, wallet: Address, journal: SetupJournal, options: SetupOptions): Promise<SetupState> {
  const operation = journal.pending; ensure(operation?.transactionHash, 'Enter the transaction hash from your wallet to recover the pending action.');
  fresh(options); options.onUpdate?.('Checking the setup transaction on Monad Testnet…');
  const receipt = await rpc.waitForTransactionReceipt({ hash: operation.transactionHash, confirmations: 2, timeout: 90_000 });
  fresh(options);
  ensure(same(receipt.transactionHash, operation.transactionHash), 'The setup transaction was replaced. Its original hash remains saved for recovery.');
  const [transaction, block] = await Promise.all([rpc.getTransaction({ hash: operation.transactionHash }), rpc.getBlock({ blockNumber: receipt.blockNumber })]);
  fresh(options);
  const call = operationCall(config, operation);
  ensure(same(block.hash, receipt.blockHash), 'The setup receipt is no longer in the canonical chain.');
  ensure(same(transaction.hash, operation.transactionHash) && same(transaction.from, wallet) && same(transaction.to, call.to) && same(transaction.input, call.data), 'This transaction does not match the saved setup action.');
  if (receipt.status === 'reverted') {
    delete journal.pending; save(config, wallet, journal);
    throw new Error('The setup transaction reverted. No authority was granted; you can retry the action.');
  }
  const agentId = verifySetupReceipt(config, wallet, operation, operation.transactionHash, receipt)!;
  const owner = await rpc.readContract({ address: config.identity, abi: identityAbi, functionName: 'ownerOf', args: [BigInt(agentId)] });
  ensure(same(owner, wallet), 'The registered agent is no longer owned by this wallet.');
  if (operation.kind === 'delegate') {
    const [grant, authorized, latest] = await Promise.all([
      rpc.readContract({ address: config.router, abi: routerAbi, functionName: 'delegates', args: [BigInt(agentId), operation.executor!] }),
      rpc.readContract({ address: config.router, abi: routerAbi, functionName: 'isAuthorized', args: [BigInt(agentId), operation.executor!] }),
      rpc.getBlock({ blockTag: 'latest' }),
    ]);
    // Expired/revoked confirmed grants are recoverable, but never make setup ready.
    if (!(authorized && same(grant[0], wallet) && grant[1] === BigInt(operation.expiresAt!) && grant[1] > latest.timestamp)) options.onUpdate?.('The confirmed delegation has expired or changed. Refresh authority before running tasks.');
  }
  fresh(options);
  if (operation.kind === 'register') journal.registrationTx = operation.transactionHash;
  else {
    if (journal.agentId !== agentId) { delete journal.registrationTx; delete journal.delegationTxs; }
    journal.delegationTxs = { ...journal.delegationTxs, [operation.executor!.toLowerCase()]: operation.transactionHash };
  }
  journal.agentId = agentId; delete journal.pending; save(config, wallet, journal);
  return getSetupState(config, wallet, agentId);
}

function rejectedByUser(error: unknown): boolean {
  const seen = new Set<unknown>(); let item = error;
  while (item && typeof item === 'object' && !seen.has(item)) {
    seen.add(item); if ('code' in item && item.code === 4001) return true;
    item = 'cause' in item ? item.cause : undefined;
  }
  return false;
}
async function submit(config: SetupConfig, client: WalletClient, wallet: Address, journal: SetupJournal, operation: SetupOperation, options: SetupOptions): Promise<SetupState> {
  await walletGuard(client, wallet, options);
  const call = operationCall(config, operation);
  const balance = await rpc.getBalance({ address: wallet });
  ensure(balance > 0n, 'Insufficient testnet MON for setup gas. Fund this wallet from the Monad faucet, then refresh.');
  const [gas, price] = await Promise.all([
    rpc.estimateGas({ account: wallet, to: call.to, data: call.data }), rpc.getGasPrice(),
  ]);
  // Reserve headroom for changing base fees. The wallet remains the final fee authority.
  ensure(balance >= (gas * price * 120n + 99n) / 100n, 'Insufficient testnet MON for setup gas. Fund this wallet from the Monad faucet, then refresh.');
  await walletGuard(client, wallet, options);
  journal.pending = operation; save(config, wallet, journal);
  options.onUpdate?.(operation.kind === 'register' ? 'Approve registering your checksum agent in your wallet.' : `Approve one-hour authority for executor ${operation.executor}.`);
  let transactionHash: Hex;
  let prompted = false;
  try {
    await walletGuard(client, wallet, options);
    prompted = true;
    transactionHash = operation.kind === 'register'
      ? await client.writeContract({ chain: monadTestnet, account: wallet, address: config.identity, abi: identityAbi, functionName: 'register', args: [operation.agentURI!] })
      : await client.writeContract({ chain: monadTestnet, account: wallet, address: config.router, abi: routerAbi, functionName: 'setDelegate', args: [BigInt(operation.agentId!), operation.executor!, BigInt(operation.expiresAt!)] });
  } catch (error) {
    if (!prompted || rejectedByUser(error)) { delete journal.pending; save(config, wallet, journal); }
    throw error;
  }
  // Save before checking the account again: an account change must not lose a broadcast hash.
  operation.transactionHash = hash(transactionHash); operation.status = 'submitted'; save(config, wallet, journal);
  await walletGuard(client, wallet, options);
  const state = await reconcile(config, wallet, journal, options);
  await walletGuard(client, wallet, options);
  return state;
}

export async function registerOwnedAgent(config: SetupConfig, client: WalletClient, wallet: Address, options: SetupOptions = {}): Promise<SetupState> {
  return locked(config, wallet, async () => {
    await walletGuard(client, wallet, options);
    const state = await getSetupState(config, wallet); fresh(options);
    ensure(!state.signerIsRelayer, 'Use a personal wallet, separate from the daemon executor keys.');
    const journal = journalFor(config, wallet); ensure(!journal.pending, 'Recover the pending setup transaction before registering another agent.');
    if (journal.agentId) { ensure(same(state.owner, wallet), 'The saved agent is owned by another wallet. Select an agent you own.'); return state; }
    return submit(config, client, wallet, journal, { kind: 'register', status: 'intent', agentURI: buildAgentURI(wallet) }, options);
  });
}
export async function authorizeExecutors(config: SetupConfig, client: WalletClient, wallet: Address, agentId: string, options: SetupOptions = {}): Promise<SetupState> {
  return locked(config, wallet, async () => {
    await walletGuard(client, wallet, options);
    let state = await getSetupState(config, wallet, positiveId(agentId)); fresh(options);
    ensure(same(state.owner, wallet), 'Only this agent’s owner can delegate execution.');
    ensure(!state.signerIsRelayer, 'Use a personal wallet, separate from the daemon executor keys.');
    const journal = journalFor(config, wallet); ensure(!journal.pending, 'Recover the pending setup transaction before approving another executor.');
    if (journal.agentId !== agentId) { delete journal.registrationTx; delete journal.delegationTxs; }
    journal.agentId = agentId; save(config, wallet, journal);
    for (const executor of executors(config)) {
      state = await getSetupState(config, wallet, agentId); fresh(options);
      ensure(same(state.owner, wallet), 'Agent ownership changed. No further executor approvals were submitted.');
      if (state.executors.find(grant => same(grant.address, executor))?.validForDemo) continue;
      state = await submit(config, client, wallet, journal, { kind: 'delegate', status: 'intent', agentId, executor, expiresAt: (state.chainTime + AUTHORITY_SECONDS).toString() }, options);
    }
    return state;
  });
}
export async function recoverSetup(config: SetupConfig, wallet: Address, transactionHash?: Hex, options: SetupOptions = {}): Promise<SetupState> {
  return locked(config, wallet, async () => {
    fresh(options); await validateDeployment(config); fresh(options);
    const journal = journalFor(config, wallet);
    if (!journal.pending) return getSetupState(config, wallet, journal.agentId);
    if (transactionHash !== undefined) {
      const checked = hash(transactionHash);
      ensure(!journal.pending.transactionHash || same(journal.pending.transactionHash, checked), 'Recover the original saved transaction hash; replacement transactions cannot count as setup success.');
      // A mistyped recovery hash must not poison the saved intent permanently.
      const transaction = await rpc.getTransaction({ hash: checked }); fresh(options);
      const call = operationCall(config, journal.pending);
      ensure(same(transaction.hash, checked) && same(transaction.from, wallet) && same(transaction.to, call.to) && same(transaction.input, call.data), 'This transaction does not match the saved setup action.');
      journal.pending.transactionHash = checked; journal.pending.status = 'submitted'; save(config, wallet, journal);
    }
    return reconcile(config, wallet, journal, options);
  });
}
