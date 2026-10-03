import { existsSync, mkdirSync, readFileSync, rmdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWalletClient, decodeEventLog, encodeFunctionData, http, keccak256, parseAbi, parseTransaction, recoverTransactionAddress, type Hex, type TransactionSerialized } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from 'viem/chains';
import { address, boundedResponse, checkChain, json, key, liveManifest, loadEnvironment, main, publicRpc, required, root, safeUrl, save } from './ops-common.js';

const stateDir = resolve(root, 'scripts/.state/agent');
const cardPath = resolve(stateDir, 'card.json');
const pinPath = resolve(stateDir, 'pin.json');
const registrationPath = resolve(stateDir, 'registration.json');
const abi = parseAbi([
  'function register(string agentURI) returns (uint256)',
  'function ownerOf(uint256 agentId) view returns (address)',
  'function tokenURI(uint256 agentId) view returns (string)',
  'function getAgentWallet(uint256 agentId) view returns (address)',
  'event Registered(uint256 indexed agentId,string agentURI,address indexed owner)',
]);

main(async () => {
  loadEnvironment(); const action = process.argv[2] || 'prepare';
  if (!['prepare', 'pin', 'register', 'all'].includes(action)) throw new Error('Use prepare, pin, register or all');
  mkdirSync(stateDir, { recursive: true });
  const lock = resolve(stateDir, 'operation.lock');
  try { mkdirSync(lock); } catch { throw new Error('An agent operation is active or interrupted. Inspect saved state before removing operation.lock.'); }
  try {
    if (action === 'prepare' || action === 'all') {
      if (existsSync(registrationPath) || existsSync(pinPath)) throw new Error('Agent card already pinned or registration started; use pin/register to continue without changing identity');
      const owner = address(process.env.AGENT_OWNER_ADDRESS || privateKeyToAccount(key('AGENT_OWNER_PRIVATE_KEY')).address, 'agent owner');
      const endpoint = safeUrl(required('MCP_ENDPOINT'), 'published MCP endpoint');
      const capabilities = required('AGENT_CAPABILITIES').split(',').map(value => value.trim()).filter(Boolean);
      if (!capabilities.length) throw new Error('Declare at least one actual capability');
      const card = {
        type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
        name: required('AGENT_NAME'), description: required('AGENT_DESCRIPTION'),
        services: [{ name: 'MCP', endpoint: endpoint.href, version: '2025-11-25' }],
        active: true, x402Support: process.env.AGENT_SERVICE_X402_SUPPORT === 'true',
        supportedTrust: ['reputation'],
        capabilities,
        wallets: [{ chainId: 'eip155:10143', address: owner, role: 'owner' }],
      };
      save(cardPath, card);
      console.log('Prepared scripts/.state/agent/card.json. Card declarations are operator supplied; MCP invocation is verified by the task client.');
    }
    if (action === 'pin' || action === 'all') {
      if (!existsSync(cardPath)) throw new Error('Prepare an Agent Card first');
      const bytes = readFileSync(cardPath); const contentHash = keccak256(bytes);
      if (existsSync(pinPath)) {
        if (json(pinPath).contentHash !== contentHash) throw new Error('Pinned card differs from the local card');
      } else {
        const body = new FormData();
        body.append('network', 'public'); body.append('name', 'aetheris-agent-card.json');
        body.append('file', new Blob([bytes], { type: 'application/json' }), 'agent-card.json');
        const response = await fetch('https://uploads.pinata.cloud/v3/files', { method: 'POST', headers: { Authorization: `Bearer ${required('PINATA_JWT')}` }, body, redirect: 'error', signal: AbortSignal.timeout(60_000) });
        const uploaded = JSON.parse(await boundedResponse(response, 64 * 1024));
        const cid = uploaded?.data?.cid;
        if (typeof cid !== 'string' || !/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/.test(cid)) throw new Error('Pinning service returned an invalid CID');
        save(pinPath, { uri: `ipfs://${cid}`, cid, contentHash, pinnedAt: new Date().toISOString(), gatewayVerified: false });
      }
      const pin = json(pinPath);
      const gateway = safeUrl(process.env.IPFS_GATEWAY || 'https://ipfs.io/ipfs/', 'IPFS gateway');
      const response = await fetch(new URL(pin.cid, gateway.href.endsWith('/') ? gateway : `${gateway.href}/`), { redirect: 'error', signal: AbortSignal.timeout(30_000) });
      const retrieved = await boundedResponse(response, 256 * 1024);
      if (keccak256(Buffer.from(retrieved)) !== contentHash) throw new Error('Retrieved IPFS bytes do not match the pinned card');
      save(pinPath, { ...pin, gatewayVerified: true, verifiedAt: new Date().toISOString() });
      console.log(`Pinned and retrieved ${pin.uri}`);
    }
    if (action === 'register' || action === 'all') {
      const manifest = liveManifest();
      if (!existsSync(pinPath) || !json(pinPath).gatewayVerified) throw new Error('Pin and retrieve the Agent Card before registration');
      const pin = json(pinPath); const card = json(cardPath);
      if (keccak256(readFileSync(cardPath)) !== pin.contentHash) throw new Error('Agent Card changed after pinning');
      const account = privateKeyToAccount(key('AGENT_OWNER_PRIVATE_KEY'));
      if (card.wallets[0].address.toLowerCase() !== account.address.toLowerCase()) throw new Error('Card owner does not match registration signer');
      const client = publicRpc(); await checkChain(client);
      let state: any = existsSync(registrationPath) ? json(registrationPath) : undefined;
      if (state && (state.registry.toLowerCase() !== manifest.identityRegistry.toLowerCase() || state.uri !== pin.uri || state.owner.toLowerCase() !== account.address.toLowerCase())) throw new Error('Registration journal belongs to another card or deployment');
      if (!state) {
        const wallet = createWalletClient({ account, chain: monadTestnet, transport: http(process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz', { retryCount: 0, timeout: 20_000 }) });
        await client.simulateContract({ account, address: manifest.identityRegistry, abi, functionName: 'register', args: [pin.uri] });
        const request = await wallet.prepareTransactionRequest({ to: manifest.identityRegistry, data: encodeFunctionData({ abi, functionName: 'register', args: [pin.uri] }), account });
        const serialized = await wallet.signTransaction(request);
        const transactionHash = keccak256(serialized);
        state = { chainId: 10143, registry: manifest.identityRegistry, owner: account.address, uri: pin.uri, transactionHash, rawTransaction: serialized, status: 'broadcast-intent' };
        save(registrationPath, state);
      }
      const serialized = state.rawTransaction as TransactionSerialized;
      const parsed = parseTransaction(serialized);
      const expectedData = encodeFunctionData({ abi, functionName: 'register', args: [pin.uri] });
      if (keccak256(serialized) !== state.transactionHash || parsed.chainId !== 10143 || parsed.to?.toLowerCase() !== manifest.identityRegistry.toLowerCase() || parsed.data !== expectedData || (parsed.value ?? 0n) !== 0n || (await recoverTransactionAddress({ serializedTransaction: serialized })).toLowerCase() !== account.address.toLowerCase()) throw new Error('Saved registration transaction does not match intended registration');
      const known = await client.getTransaction({ hash: state.transactionHash }).catch(() => undefined);
      if (!known) {
        const pendingNonce = await client.getTransactionCount({ address: account.address, blockTag: 'pending' });
        if (parsed.nonce === undefined || pendingNonce > parsed.nonce) throw new Error('Registration signer nonce advanced without the saved transaction; reconcile before continuing');
        const returned = await client.sendRawTransaction({ serializedTransaction: serialized });
        if (returned !== state.transactionHash) throw new Error('RPC returned a different registration transaction hash');
        save(registrationPath, { ...state, status: 'broadcast' });
      }
      const receipt = await client.waitForTransactionReceipt({ hash: state.transactionHash as Hex, confirmations: 12, timeout: 180_000 });
      if (receipt.status !== 'success') throw new Error('Registration transaction reverted; journal retained');
      const events = receipt.logs.filter(log => log.address.toLowerCase() === manifest.identityRegistry.toLowerCase()).flatMap(log => {
        try { const event = decodeEventLog({ abi, data: log.data, topics: log.topics, strict: true }); return event.eventName === 'Registered' ? [event.args] : []; } catch { return []; }
      });
      if (events.length !== 1 || events[0].owner.toLowerCase() !== account.address.toLowerCase() || events[0].agentURI !== pin.uri) throw new Error('Registration receipt does not contain the expected identity event');
      const agentId = events[0].agentId;
      const [owner, uri, agentWallet, canonical] = await Promise.all([
        client.readContract({ address: manifest.identityRegistry, abi, functionName: 'ownerOf', args: [agentId] }),
        client.readContract({ address: manifest.identityRegistry, abi, functionName: 'tokenURI', args: [agentId] }),
        client.readContract({ address: manifest.identityRegistry, abi, functionName: 'getAgentWallet', args: [agentId] }),
        client.getBlock({ blockNumber: receipt.blockNumber }),
      ]);
      if (owner.toLowerCase() !== account.address.toLowerCase() || agentWallet.toLowerCase() !== account.address.toLowerCase() || uri !== pin.uri || canonical.hash !== receipt.blockHash) throw new Error('Live identity state differs from registration evidence');
      const evidence = { status: 'live-verified', chainId: 10143, identityRegistry: manifest.identityRegistry, agentId: agentId.toString(), owner, wallet: agentWallet, agentURI: uri, cardContentHash: pin.contentHash, transactionHash: receipt.transactionHash, blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash, verifiedAt: new Date().toISOString() };
      save(resolve(root, 'contracts/deployments/10143.agent.json'), evidence);
      save(registrationPath, { ...state, status: 'confirmed', agentId: agentId.toString() });
      console.log(`Registered agent ${agentId}; transaction ${receipt.transactionHash}`);
    }
  } finally { rmdirSync(lock); }
});
