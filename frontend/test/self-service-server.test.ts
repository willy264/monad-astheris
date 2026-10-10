import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { type TestContext } from 'node:test';
import { decodeFunctionData, encodeAbiParameters, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { contracts, identityAbi, routerAbi } from '../lib/contracts';
import { paymentTypes, requestId, taskTypedData, type DemoTask } from '../lib/demo-protocol';

const signer = privateKeyToAccount(`0x${'11'.repeat(32)}`);
const otherSigner = privateKeyToAccount(`0x${'22'.repeat(32)}`);
const router = `0x${'33'.repeat(20)}` as const, identity = `0x${'44'.repeat(20)}` as const;
const executor = `0x${'55'.repeat(20)}` as const, asset = `0x${'66'.repeat(20)}` as const;
const receiver = `0x${'77'.repeat(20)}` as const, digest = `0x${'88'.repeat(32)}` as const;
const daemon = 'https://task-service.example', rpcUrl = 'https://private-rpc.example/provider-key';
const accepted = { scheme: 'exact', network: 'eip155:10143', amount: '1000', asset, payTo: receiver, maxTimeoutSeconds: 120, extra: { name: 'USDC', version: '2' } };
const settings = {
  DEMO_ENABLED: 'true', DAEMON_URL: daemon, MONAD_RPC_URL: rpcUrl,
  NEXT_PUBLIC_MONAD_RPC_URL: 'https://browser-rpc.example/never-use-for-server-permission',
  DEMO_TASK_RESOURCE: `${daemon}/v1/tasks`, DEMO_PAYMENT_ASSET: asset,
  DEMO_PAYMENT_RECEIVER: receiver, DEMO_PAYMENT_MAX_AMOUNT: '1000',
  DEMO_PAYMENT_ASSET_NAME: 'USDC', DEMO_PAYMENT_ASSET_VERSION: '2',
};

async function signedRequest(agentId = '2', options: { payer?: typeof signer; taskSigner?: typeof signer; origin?: string; deadline?: number; taskRouter?: Address; amount?: string } = {}) {
  const payer = options.payer ?? signer;
  const task: DemoTask = { agentId, taskId: digest, sequenceNonce: '7', inputHash: digest, outputHash: digest, proofHash: `0x${'00'.repeat(32)}`, executor, deadline: options.deadline ?? Math.floor(Date.now() / 1000) + 540 };
  const authorization = await (options.taskSigner ?? signer).signTypedData(taskTypedData(task, options.taskRouter ?? router));
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 110);
  const paymentAuthorization = { from: payer.address, to: receiver, value: BigInt(options.amount ?? accepted.amount), validAfter: 0n, validBefore, nonce: digest };
  const signature = await payer.signTypedData({ domain: { name: 'USDC', version: '2', chainId: 10143, verifyingContract: asset }, types: paymentTypes, primaryType: 'TransferWithAuthorization', message: paymentAuthorization });
  const payment = {
    x402Version: 2, resource: { url: `${daemon}/v1/tasks` }, accepted: { ...accepted, amount: options.amount ?? accepted.amount },
    payload: { signature, authorization: { ...paymentAuthorization, value: paymentAuthorization.value.toString(), validAfter: '0', validBefore: validBefore.toString() } },
  };
  return new Request('https://dashboard.example/api/demo/tasks', {
    method: 'POST', headers: { origin: options.origin ?? 'https://dashboard.example', 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'payment-signature': Buffer.from(JSON.stringify(payment)).toString('base64') },
    body: JSON.stringify({ ...task, authorization }),
  });
}

function fixture(context: TestContext, overrides: Partial<{ chainId: number; linkedIdentity: Address; owner: Address; signerAuthorized: boolean; executorAuthorized: boolean; configStatus: number; relayers: Address[] }> = {}) {
  const state = { chainId: 10143, linkedIdentity: identity as Address, owner: signer.address, signerAuthorized: true, executorAuthorized: true, configStatus: 200, relayers: [executor] as Address[], ...overrides };
  const forwarded: DemoTask[] = [];
  const permissions: { agentId: bigint; account: Address }[] = [];
  let chainChecks = 0;
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    if (url === `${daemon}/v1/config`) return Response.json({
      chainId: 10143, router, relayers: state.relayers, taskAuthorization: { name: 'AetherisTask', version: '1' },
      payment: { x402Version: 2, resource: { url: `${daemon}/v1/tasks` }, accepts: [accepted] },
    }, { status: state.configStatus });
    if (url === `${daemon}/v1/tasks`) {
      assert.equal(init?.method, 'POST');
      const body = JSON.parse(String(init?.body));
      forwarded.push(body);
      return Response.json({ requestId: requestId(body, router), status: 'accepted' }, { status: 202 });
    }
    assert.equal(url, rpcUrl, 'Permissions must use the server RPC; never a caller URL or a real network');
    assert.equal(init?.method, 'POST');
    const message = JSON.parse(String(init?.body));
    let result: unknown;
    switch (message.method) {
      case 'eth_chainId': chainChecks++; result = `0x${state.chainId.toString(16)}`; break;
      case 'eth_blockNumber': result = '0x100'; break;
      case 'eth_call': {
        assert.equal(message.params[1], '0x100', 'Permission reads must share a fresh block snapshot');
        const decoded = decodeFunctionData({ abi: [...routerAbi, ...identityAbi], data: message.params[0].data });
        if (decoded.functionName === 'identityRegistry') {
          assert.equal(message.params[0].to.toLowerCase(), router);
          result = encodeAbiParameters([{ type: 'address' }], [state.linkedIdentity]);
        } else if (decoded.functionName === 'ownerOf') {
          assert.equal(message.params[0].to.toLowerCase(), identity);
          result = encodeAbiParameters([{ type: 'address' }], [state.owner]);
        } else if (decoded.functionName === 'isAuthorized') {
          assert.equal(message.params[0].to.toLowerCase(), router);
          const [agentId, account] = decoded.args;
          permissions.push({ agentId, account });
          result = encodeAbiParameters([{ type: 'bool' }], [account.toLowerCase() === executor ? state.executorAuthorized : state.signerAuthorized]);
        } else assert.fail(`Unexpected permission read: ${decoded.functionName}`);
        break;
      }
      default: assert.fail(`Unexpected RPC method: ${message.method}`);
    }
    return Response.json({ jsonrpc: '2.0', id: message.id, result });
  });
  return { state, forwarded, permissions, chainChecks: () => chainChecks };
}

test('self-service server validates selected agents before forwarding any paid request', async context => {
  const serverMarker = registerHooks({ resolve(specifier, resolveContext, next) { return next(specifier === 'server-only' ? 'next/dist/compiled/server-only/empty.js' : specifier, resolveContext); } });
  const previous = Object.fromEntries([...Object.keys(settings), 'DEMO_AGENT_ID'].map(key => [key, process.env[key]]));
  const previousContracts = { ...contracts };
  Object.assign(process.env, settings); delete process.env.DEMO_AGENT_ID;
  contracts.router = router; contracts.identity = identity;
  try {
    const { submitDemo } = await import('../lib/demo-server');
    const { GET } = await import('../app/api/demo/config/route');

    await context.test('config defaults to Agent #1 and accepts a chosen agent before delegation', async child => {
      const state = fixture(child, { signerAuthorized: false, executorAuthorized: false });
      for (const [query, id] of [['', '1'], ['?agentId=2', '2'], [`?agentId=${2n ** 256n - 1n}`, (2n ** 256n - 1n).toString()]]) {
        const response = await GET(new Request(`https://dashboard.example/api/demo/config${query}`));
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal((await response.json()).agentId, id);
      }
      process.env.DEMO_AGENT_ID = '';
      try {
        assert.equal((await (await GET(new Request('https://dashboard.example/api/demo/config'))).json()).agentId, '1');
        process.env.DEMO_AGENT_ID = '9';
        assert.equal((await (await GET(new Request('https://dashboard.example/api/demo/config'))).json()).agentId, '9');
      }
      finally { delete process.env.DEMO_AGENT_ID; }
      assert.equal(state.forwarded.length, 0); assert.equal(state.chainChecks(), 0);
    });

    await context.test('malformed, duplicate and unknown config parameters return 400 without contacting upstream', async child => {
      child.mock.method(globalThis, 'fetch', async () => { assert.fail('Bad query must not contact an upstream'); });
      for (const query of ['?agentId=', '?agentId=0', '?agentId=-1', '?agentId=01', '?agentId=1.0', '?agentId=1e2', `?agentId=${2n ** 256n}`, '?agentId=2&agentId=3', '?agentId=2&router=other', '?unexpected=yes']) {
        const response = await GET(new Request(`https://dashboard.example/api/demo/config${query}`));
        assert.equal(response.status, 400, query);
        assert.equal(response.headers.get('cache-control'), 'no-store');
      }
    });

    await context.test('unavailable configuration returns 503 without exposing private RPC settings', async child => {
      fixture(child, { configStatus: 503 });
      const response = await GET(new Request('https://dashboard.example/api/demo/config?agentId=2'));
      assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal((await response.text()).includes(rpcUrl), false);
    });

    for (const id of ['1', '2']) await context.test(`authorized owner of Agent #${id} forwards exactly once`, async child => {
      const state = fixture(child);
      const request = await signedRequest(id);
      const result = await submitDemo(request);
      assert.equal(result.status, 202); assert.equal(state.forwarded.length, 1);
      assert.equal(state.forwarded[0].agentId, id);
      assert.deepEqual(state.permissions.map(item => item.agentId), [BigInt(id), BigInt(id)]);
    });

    await context.test('a current delegate can submit for a separately owned agent', async child => {
      const state = fixture(child, { owner: otherSigner.address });
      assert.equal((await submitDemo(await signedRequest())).status, 202);
      assert.equal(state.forwarded.length, 1);
    });

    await context.test('an unauthorized foreign agent never reaches the payment endpoint', async child => {
      const state = fixture(child, { owner: otherSigner.address, signerAuthorized: false });
      await assert.rejects(() => signedRequest('2').then(submitDemo), /not the selected agent owner or an active delegate/);
      assert.equal(state.forwarded.length, 0);
    });

    await context.test('expired executor authorization blocks payment even for an authorized owner', async child => {
      const state = fixture(child, { executorAuthorized: false });
      await assert.rejects(() => signedRequest().then(submitDemo), /authorize every configured executor/);
      assert.equal(state.forwarded.length, 0);
    });

    await context.test('a revoked signer is checked again on the next submission', async child => {
      const state = fixture(child, { owner: otherSigner.address });
      await submitDemo(await signedRequest());
      state.state.signerAuthorized = false;
      await assert.rejects(() => signedRequest().then(submitDemo), /not the selected agent owner/);
      assert.equal(state.forwarded.length, 1); assert.equal(state.chainChecks(), 2);
    });

    for (const [label, changes, message] of [
      ['wrong RPC chain', { chainId: 1 }, /not Monad Testnet/],
      ['foreign identity registry', { linkedIdentity: receiver }, /different identity registry/],
      ['missing agent owner', { owner: `0x${'00'.repeat(20)}` as Address }, /Invalid wallet address/],
    ] as const) await context.test(`${label} blocks payment`, async child => {
      const state = fixture(child, changes);
      await assert.rejects(() => signedRequest().then(submitDemo), message);
      assert.equal(state.forwarded.length, 0);
    });

    await context.test('configured relayers cannot pay for their own task requests', async child => {
      const state = fixture(child, { relayers: [executor, signer.address] });
      await assert.rejects(() => signedRequest().then(submitDemo), /executor cannot also be the task payer/);
      assert.equal(state.forwarded.length, 0); assert.equal(state.chainChecks(), 0);
    });

    for (const [label, options, message] of [
      ['foreign origin', { origin: 'https://attacker.example' }, /Only this dashboard/],
      ['mismatched payment signer', { payer: otherSigner }, /same wallet/],
      ['wrong task signing domain', { taskRouter: receiver }, /same wallet/],
      ['expired task', { deadline: 1 }, /expired/],
      ['oversized payment', { amount: '1001' }, /exceeds/],
    ] as const) await context.test(`${label} remains rejected before forwarding`, async child => {
      const state = fixture(child);
      await assert.rejects(() => signedRequest('2', options).then(submitDemo), message);
      assert.equal(state.forwarded.length, 0);
    });
  } finally {
    Object.assign(contracts, previousContracts);
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    serverMarker.deregister();
  }
});
