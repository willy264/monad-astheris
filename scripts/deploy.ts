import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import { checkChain, key, loadEnvironment, main, manifestPath, publicRpc, root, reserve } from './ops-common.js';
import { finalizeDeployment } from './finalize-deployment.js';

main(async () => {
  loadEnvironment('contracts');
  const broadcast = process.argv.includes('--broadcast');
  if (broadcast && existsSync(manifestPath)) throw new Error('A live manifest already exists; use finalize-deployment for receipt recovery instead of redeploying');
  const intent = resolve(root, '.tools/deployment/broadcast-intent.json');
  if (broadcast && existsSync(intent)) throw new Error('Deployment was already attempted; reconcile saved broadcast receipts and use finalize-deployment. Do not submit a duplicate deployment.');
  const account = privateKeyToAccount(key('PRIVATE_KEY'));
  const client = publicRpc(); await checkChain(client);
  const balance = await client.getBalance({ address: account.address });
  if (balance === 0n) throw new Error(`Deployment account ${account.address} has no testnet MON`);
  const executable = process.env.FORGE_BIN || (process.platform === 'win32' && existsSync(resolve(root, '.tools/foundry/forge.exe')) ? resolve(root, '.tools/foundry/forge.exe') : 'forge');
  const args = ['script', 'script/Deploy.s.sol:Deploy', '--rpc-url', 'monad_testnet', ...(broadcast ? ['--broadcast'] : [])];
  console.log(`${broadcast ? 'Broadcasting' : 'Simulating'} on chain 10143 from ${account.address}`);
  if (broadcast) reserve(intent, { chainId: 10143, deployer: account.address, startedAt: new Date().toISOString(), status: 'broadcast-intent' });
  const output = spawnSync(executable, args, { cwd: resolve(root, 'contracts'), env: { ...process.env, MONAD_RPC_URL: process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz' }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  mkdirSync(resolve(root, '.tools/deployment'), { recursive: true });
  writeFileSync(resolve(root, '.tools/deployment/forge.log'), (output.stdout || '') + (output.stderr || ''), { mode: 0o600 });
  if (output.status !== 0) throw new Error('Forge did not complete; inspect ignored .tools/deployment/forge.log and broadcast receipts. Do not blindly redeploy.');
  if (broadcast) await finalizeDeployment();
  else console.log('Simulation complete. Candidate addresses are not a live deployment. Use --broadcast to submit.');
});
