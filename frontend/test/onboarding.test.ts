import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionData, zeroAddress, type Address, type Hex, type TransactionReceipt, type WalletClient } from 'viem';
import { agentCard } from '../lib/agent-card';
import { contracts, identityAbi, routerAbi, walletPublicClient as rpc } from '../lib/contracts';
import { authorizeExecutors, getSetupState, persistVerifiedSelection, readSetup, recoverSetup, registerOwnedAgent, verifySetupReceipt, type SetupConfig, type SetupOperation } from '../lib/onboarding-client';
import { buildAgentURI, decodeInlineAgentCard, INLINE_AGENT_CARD_PREFIX } from '../lib/onboarding-metadata';

const owner = `0x${'11'.repeat(20)}` as Address, identity = `0x${'22'.repeat(20)}` as Address, router = `0x${'33'.repeat(20)}` as Address;
const asset = `0x${'44'.repeat(20)}` as Address, receiver = `0x${'55'.repeat(20)}` as Address;
const executor = `0x${'66'.repeat(20)}` as Address, secondExecutor = `0x${'77'.repeat(20)}` as Address;
const blockHash = `0x${'aa'.repeat(32)}` as Hex;
const policy = { resource: 'https://daemon.example/v1/tasks', asset, receiver, maxAmount: '10', name: 'USDC', version: '2' };
const config: SetupConfig = { chainId: 10143, identity, router, relayers: [executor, secondExecutor], policy,
  challenge: { x402Version: 2, resource: { url: policy.resource }, accepts: [{ scheme: 'exact', network: 'eip155:10143', amount: '10', asset, payTo: receiver, maxTimeoutSeconds: 120, extra: { name: 'USDC', version: '2' } }] } };

function fixture(context: TestContext) {
  const originalContracts = { ...contracts }; Object.assign(contracts, { identity, router });
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  context.after(() => { Object.assign(contracts, originalContracts); if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  const state = {
    chainId: 10143, rpcChainId: 10143, account: owner, now: 1_800_000_000n, mon: 10n ** 18n, tokens: 50n,
    mode: 'normal' as 'normal' | 'reject' | 'ambiguous' | 'switch', current: true,
    owners: new Map<string, Address>(), grants: new Map<string, { owner: Address; expiry: bigint; authorized: boolean }>(),
    writes: [] as { functionName: string; args: readonly unknown[]; hash: Hex }[],
    transactions: new Map<Hex, { hash: Hex; from: Address; to: Address; input: Hex }>(), receipts: new Map<Hex, TransactionReceipt>(),
  };
  context.mock.method(rpc, 'getChainId', async () => state.rpcChainId);
  context.mock.method(rpc, 'getBalance', async () => state.mon);
  context.mock.method(rpc, 'getGasPrice', async () => 1_000n);
  context.mock.method(rpc, 'estimateGas', async () => 100_000n);
  context.mock.method(rpc, 'getBlock', async () => ({ timestamp: state.now, number: 100n, hash: blockHash }));
  context.mock.method(rpc, 'readContract', async (input: { functionName: string; args?: readonly unknown[] }) => {
    if (input.functionName === 'identityRegistry') return identity;
    if (input.functionName === 'balanceOf') return state.tokens;
    if (input.functionName === 'ownerOf') { const value = state.owners.get(String(input.args![0])); if (!value) throw new Error('Unknown agent'); return value; }
    const grant = state.grants.get(`${input.args![0]}:${String(input.args![1]).toLowerCase()}`);
    if (input.functionName === 'delegates') return [grant?.owner ?? zeroAddress, grant?.expiry ?? 0n, 0n];
    if (input.functionName === 'isAuthorized') return !!grant?.authorized && grant.owner === state.owners.get(String(input.args![0])) && grant.expiry > state.now;
    throw new Error(`Unexpected read ${input.functionName}`);
  });
  context.mock.method(rpc, 'getTransaction', async (input: { hash: Hex }) => { const found = state.transactions.get(input.hash); assert.ok(found, 'transaction exists'); return found; });
  context.mock.method(rpc, 'waitForTransactionReceipt', async (input: { hash: Hex }) => { const found = state.receipts.get(input.hash); assert.ok(found, 'receipt exists'); return found; });
  const wallet = {
    account: { address: owner }, getChainId: async () => state.chainId, getAddresses: async () => [state.account],
    writeContract: async (input: { functionName: string; args: readonly unknown[] }) => {
      const pending = readSetup(config, owner)?.pending;
      assert.equal(pending?.status, 'intent', 'public recovery intent must exist before wallet submission');
      if (state.mode === 'reject') throw Object.assign(new Error('Rejected'), { code: 4001 });
      const hash = `0x${(state.writes.length + 1).toString(16).padStart(64, '0')}` as Hex;
      state.writes.push({ ...input, hash });
      const to = input.functionName === 'register' ? identity : router;
      const data = input.functionName === 'register'
        ? encodeFunctionData({ abi: identityAbi, functionName: 'register', args: [String(input.args[0])] })
        : encodeFunctionData({ abi: routerAbi, functionName: 'setDelegate', args: input.args as [bigint, Address, bigint] });
      state.transactions.set(hash, { hash, from: owner, to, input: data });
      let logs: unknown[];
      if (input.functionName === 'register') {
        const agentId = BigInt(17 + state.owners.size); state.owners.set(agentId.toString(), owner);
        logs = [
          { address: identity, topics: encodeEventTopics({ abi: identityAbi, eventName: 'Transfer', args: { from: zeroAddress, to: owner, tokenId: agentId } }), data: '0x' },
          { address: identity, topics: encodeEventTopics({ abi: identityAbi, eventName: 'Registered', args: { agentId, owner } }), data: encodeAbiParameters([{ type: 'string' }], [String(input.args[0])]) },
        ];
      } else {
        const [agentId, delegate, expiresAt] = input.args as [bigint, Address, bigint];
        state.grants.set(`${agentId}:${delegate.toLowerCase()}`, { owner, expiry: expiresAt, authorized: true });
        logs = [{ address: router, topics: encodeEventTopics({ abi: routerAbi, eventName: 'DelegateSet', args: { agentId, delegate } }), data: encodeAbiParameters([{ type: 'uint64' }, { type: 'address' }], [expiresAt, owner]) }];
      }
      state.receipts.set(hash, { transactionHash: hash, status: 'success', from: owner, to, blockHash, blockNumber: 100n, logs } as TransactionReceipt);
      if (state.mode === 'ambiguous') throw new Error('Provider disconnected after sending');
      if (state.mode === 'switch') { state.account = secondExecutor; state.current = false; }
      return hash;
    },
  } as unknown as WalletClient;
  return { state, wallet, storage, options: { isCurrent: () => state.current } };
}

test('inline cards identify the actual checksum workload, stay bounded, and perform no HTTP request', async () => {
  const uri = buildAgentURI(owner);
  const card = await agentCard(uri, { fetch: async () => { throw new Error('Inline cards never use a gateway'); } });
  assert.equal(card.name, 'Aetheris Checksum Agent'); assert.deepEqual(card.capabilities, ['browser-checksum']);
  assert.equal(decodeInlineAgentCard(uri).image, 'https://monad-astheris.vercel.app/brand/aetheris-logo.png');
  assert.match(card.description!, /No AI model or external MCP/);
  assert.deepEqual(card.services, [{ name: 'wallet', endpoint: `eip155:10143:${owner}` }]);
  assert.ok(uri.length < 1024);
  for (const body of ['null', '[]', '"not an object"', '{bad json']) assert.throws(() => decodeInlineAgentCard(INLINE_AGENT_CARD_PREFIX + btoa(body)));
  for (const body of ['!!!!', 'a===', 'eyJ4IjoxfQ== ', '/w==', btoa(JSON.stringify({ large: 'x'.repeat(8192) }))]) assert.throws(() => decodeInlineAgentCard(INLINE_AGENT_CARD_PREFIX + body));
  await assert.rejects(() => agentCard('data:text/html;base64,PHNjcmlwdD4='), /ipfs/);
  await assert.rejects(() => agentCard('https://127.0.0.1/private'), /ipfs/);
});

test('registration recovers the actual minted ID and does not mint again from saved success', async context => {
  const { state, wallet } = fixture(context);
  const registered = await registerOwnedAgent(config, wallet, owner);
  assert.equal(registered.agentId, '17'); assert.equal(registered.owner, owner); assert.equal(registered.ready, false);
  assert.equal(readSetup(config, owner)?.pending, undefined);
  assert.equal(registered.registrationTx, state.writes[0].hash);
  await registerOwnedAgent(config, wallet, owner); assert.equal(state.writes.length, 1);
  state.owners.set('17', receiver);
  assert.equal((await getSetupState(config, owner)).ready, false);
  await assert.rejects(() => registerOwnedAgent(config, wallet, owner), /owned by another/);
  assert.equal(state.writes.length, 1);
});

test('every executor is approved sequentially with one-hour chain expiry and current authority is rechecked', async context => {
  const { state, wallet } = fixture(context); state.owners.set('7', owner);
  const authorized = await authorizeExecutors(config, wallet, owner, '7');
  assert.equal(state.writes.length, 2); assert.equal(authorized.ready, true);
  assert.deepEqual(state.writes.map(write => write.args), [[7n, executor, state.now + 3600n], [7n, secondExecutor, state.now + 3600n]]);
  assert.ok(authorized.executors.every(grant => grant.validForDemo && grant.transactionHash));
  await authorizeExecutors(config, wallet, owner, '7'); assert.equal(state.writes.length, 2, 'valid authority requires no further wallet prompts');
  state.now += 3100n; assert.equal((await getSetupState(config, owner, '7')).ready, false, 'less than ten minutes remaining is not demo-ready');
  state.now += 600n; assert.equal((await getSetupState(config, owner, '7')).executors[0].authorized, false);
  await authorizeExecutors(config, wallet, owner, '7'); assert.equal(state.writes.length, 4);
  state.tokens = 49n; assert.equal((await getSetupState(config, owner, '7')).ready, false, 'all five payments must be funded');
  state.owners.set('7', receiver); assert.equal((await getSetupState(config, owner, '7')).ready, false);
});

test('ambiguous submission blocks duplicate registration and recovers read-only from the original hash', async context => {
  const { state, wallet } = fixture(context); state.mode = 'ambiguous';
  await assert.rejects(() => registerOwnedAgent(config, wallet, owner), /disconnected/);
  assert.equal(readSetup(config, owner)?.pending?.status, 'intent');
  state.mode = 'normal'; await assert.rejects(() => registerOwnedAgent(config, wallet, owner), /Recover/);
  const result = await recoverSetup(config, owner, state.writes[0].hash);
  assert.equal(result.agentId, '17'); assert.equal(state.writes.length, 1); assert.equal(readSetup(config, owner)?.pending, undefined);
});

test('explicit wallet rejection clears unsent intent; low MON and wrong wallet/network never prompt', async context => {
  const { state, wallet } = fixture(context); state.mode = 'reject';
  await assert.rejects(() => registerOwnedAgent(config, wallet, owner), /Rejected/); assert.equal(readSetup(config, owner)?.pending, undefined);
  state.mode = 'normal'; state.mon = 0n;
  await assert.rejects(() => registerOwnedAgent(config, wallet, owner), /Insufficient testnet MON/);
  state.mon = 119_999_999n; await assert.rejects(() => registerOwnedAgent(config, wallet, owner), /Insufficient testnet MON/);
  state.mon = 10n ** 18n; state.chainId = 1;
  await assert.rejects(() => registerOwnedAgent(config, wallet, owner), /Switch your wallet/);
  state.chainId = 10143; state.account = receiver;
  await assert.rejects(() => registerOwnedAgent(config, wallet, owner), /account changed/);
  state.account = owner; state.rpcChainId = 1;
  await assert.rejects(() => registerOwnedAgent(config, wallet, owner), /RPC is not on/);
  assert.equal(state.writes.length, 0); assert.equal(readSetup(config, owner)?.pending, undefined);
});

test('wallet switching after submission preserves the hash and scoped recovery never uses another wallet', async context => {
  const { state, wallet, options } = fixture(context); state.mode = 'switch';
  await assert.rejects(() => registerOwnedAgent(config, wallet, owner, options), /Wallet or network changed/);
  assert.equal(readSetup(config, owner)?.pending?.transactionHash, state.writes[0].hash);
  assert.equal(readSetup(config, receiver), undefined);
  state.current = true; state.account = owner;
  const recovered = await recoverSetup(config, owner, undefined, options);
  assert.equal(recovered.agentId, '17'); assert.equal(state.writes.length, 1);
});

test('wrong recovery hash, replacement, or cancelled transaction cannot count as registration', async context => {
  const { state, wallet } = fixture(context); state.mode = 'ambiguous';
  await assert.rejects(() => registerOwnedAgent(config, wallet, owner));
  const originalHash = state.writes[0].hash, badHash = `0x${'bb'.repeat(32)}` as Hex;
  state.transactions.set(badHash, { hash: badHash, from: owner, to: owner, input: '0x' });
  await assert.rejects(() => recoverSetup(config, owner, badHash), /does not match/);
  assert.equal(readSetup(config, owner)?.pending?.transactionHash, undefined, 'incorrect pasted hashes do not poison recovery');
  const receipt = state.receipts.get(originalHash)!;
  state.receipts.set(originalHash, { ...receipt, transactionHash: badHash });
  await assert.rejects(() => recoverSetup(config, owner, originalHash), /replaced/);
  assert.equal(readSetup(config, owner)?.pending?.transactionHash, originalHash);
  await assert.rejects(() => recoverSetup(config, owner, badHash), /original saved/);
  state.receipts.set(originalHash, { ...receipt, logs: [] });
  await assert.rejects(() => recoverSetup(config, owner), /registration event/);
  assert.ok(readSetup(config, owner)?.pending);
  state.receipts.set(originalHash, receipt); await recoverSetup(config, owner);
});

test('registration requires matching Registered and mint logs from the registry, including exact URI and owner', async context => {
  const { state, wallet } = fixture(context); await registerOwnedAgent(config, wallet, owner);
  const transactionHash = state.writes[0].hash, receipt = state.receipts.get(transactionHash)!;
  const operation: SetupOperation = { kind: 'register', status: 'submitted', transactionHash, agentURI: buildAgentURI(owner) };
  assert.equal(verifySetupReceipt(config, owner, operation, transactionHash, receipt), '17');
  assert.throws(() => verifySetupReceipt(config, owner, operation, transactionHash, { ...receipt, logs: receipt.logs.slice(1) }), /mint event/);
  assert.throws(() => verifySetupReceipt(config, owner, { ...operation, agentURI: buildAgentURI(receiver) }, transactionHash, receipt), /registration event/);
  assert.throws(() => verifySetupReceipt(config, receiver, operation, transactionHash, receipt), /receipt/);
  assert.throws(() => verifySetupReceipt(config, owner, operation, transactionHash, { ...receipt, logs: receipt.logs.map(log => ({ ...log, address: router })) }), /registration event/);
});

test('a confirmed reverted original call can be retried, while false local completion never grants ownership', async context => {
  const { state, wallet, storage } = fixture(context); state.mode = 'ambiguous';
  await assert.rejects(() => registerOwnedAgent(config, wallet, owner));
  const transactionHash = state.writes[0].hash;
  state.receipts.set(transactionHash, { ...state.receipts.get(transactionHash)!, status: 'reverted', logs: [] });
  await assert.rejects(() => recoverSetup(config, owner, transactionHash), /reverted/);
  assert.equal(readSetup(config, owner)?.pending, undefined);
  const [scope, raw] = [...storage][0]; storage.set(scope, JSON.stringify({ ...JSON.parse(raw), agentId: '17' }));
  state.owners.set('17', receiver);
  await assert.rejects(() => authorizeExecutors(config, wallet, owner, '17'), /Only this agent/);
  assert.equal(state.writes.length, 1);
});

test('delegation receipts must match the exact executor, agent, owner and expiry', async context => {
  const { state, wallet } = fixture(context); state.owners.set('9', owner);
  await authorizeExecutors(config, wallet, owner, '9');
  const transactionHash = state.writes[0].hash, receipt = state.receipts.get(transactionHash)!;
  const operation: SetupOperation = { kind: 'delegate', status: 'submitted', transactionHash, agentId: '9', executor, expiresAt: String(state.now + 3600n) };
  assert.equal(verifySetupReceipt(config, owner, operation, transactionHash, receipt), '9');
  for (const changed of [{ executor: secondExecutor }, { agentId: '8' }, { expiresAt: String(state.now + 4000n) }]) assert.throws(() => verifySetupReceipt(config, owner, { ...operation, ...changed }, transactionHash, receipt), /delegation event/);
  const sent = decodeFunctionData({ abi: routerAbi, data: state.transactions.get(transactionHash)!.input });
  assert.equal(sent.functionName, 'setDelegate');
});

test('partial executor approval resumes only missing grants after a rejected second prompt', async context => {
  const { state, wallet } = fixture(context); state.owners.set('12', owner);
  const write = wallet.writeContract;
  context.mock.method(wallet, 'writeContract', async (input: Parameters<typeof write>[0]) => {
    const result = await write(input);
    state.mode = 'reject';
    return result;
  });
  await assert.rejects(() => authorizeExecutors(config, wallet, owner, '12'), /Rejected/);
  assert.equal(state.writes.length, 1); assert.equal(readSetup(config, owner)?.pending, undefined);
  const partial = await getSetupState(config, owner, '12');
  assert.equal(partial.executors[0].validForDemo, true); assert.equal(partial.executors[1].validForDemo, false); assert.equal(partial.ready, false);
  state.mode = 'normal';
  const complete = await authorizeExecutors(config, wallet, owner, '12');
  assert.equal(complete.ready, true); assert.equal(state.writes.length, 2);
  assert.deepEqual(state.writes.map(item => item.args[1]), [executor, secondExecutor]);
});

test('an existing ready agent restores after reload without minting or signing and foreign selection cannot overwrite it', async context => {
  const { state } = fixture(context); state.owners.set('42', owner); state.owners.set('43', receiver); state.mon = 0n;
  for (const delegate of config.relayers) state.grants.set(`42:${delegate.toLowerCase()}`, { owner, expiry: state.now + 3600n, authorized: true });
  const selected = await persistVerifiedSelection(config, owner, '42');
  assert.equal(selected.ready, true); assert.equal(readSetup(config, owner)?.agentId, '42');
  const restored = await getSetupState(config, owner);
  assert.equal(restored.agentId, '42'); assert.equal(restored.ready, true); assert.equal(state.writes.length, 0);
  await assert.rejects(() => persistVerifiedSelection(config, owner, '43'), /owned by this connected wallet/);
  assert.equal(readSetup(config, owner)?.agentId, '42');
  await assert.rejects(() => persistVerifiedSelection(config, owner, '42', { isCurrent: () => false }), /Wallet or network changed/);
  assert.equal(readSetup(config, receiver), undefined);
});

test('selection preserves ambiguous setup intents and drops receipt references when switching agents', async context => {
  const { state, wallet } = fixture(context); state.mode = 'ambiguous';
  await assert.rejects(() => registerOwnedAgent(config, wallet, owner));
  state.owners.set('42', owner);
  await assert.rejects(() => persistVerifiedSelection(config, owner, '42'), /Recover the pending/);
  assert.ok(readSetup(config, owner)?.pending);
  await recoverSetup(config, owner, state.writes[0].hash);
  assert.ok(readSetup(config, owner)?.registrationTx);
  await persistVerifiedSelection(config, owner, '42');
  assert.equal(readSetup(config, owner)?.agentId, '42'); assert.equal(readSetup(config, owner)?.registrationTx, undefined);
  assert.equal(state.writes.length, 1);
});
