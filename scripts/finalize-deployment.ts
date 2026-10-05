import { resolve } from 'node:path';
import { encodeDeployData, keccak256, parseAbi, type Abi, type Hex } from 'viem';
import { address, checkChain, hash, json, loadEnvironment, main, manifestPath, publicRpc, root, save } from './ops-common.js';

const contracts = { AgentRegistry: 'identityRegistry', ReputationRegistry: 'reputationRegistry', ValidationRegistry: 'validationRegistry', AetherisRouter: 'router' } as const;
const linkageAbi = parseAbi(['function identityRegistry() view returns (address)', 'function validationRegistry() view returns (address)', 'function getIdentityRegistry() view returns (address)', 'function taskRouter() view returns (address)']);
const rolesAbi = parseAbi(['function owner() view returns (address)', 'function pendingOwner() view returns (address)', 'function committers(address account) view returns (bool)']);

export async function finalizeDeployment(broadcastPath = resolve(root, 'contracts/broadcast/Deploy.s.sol/10143/run-latest.json')) {
  loadEnvironment('contracts'); const client = publicRpc(); await checkChain(client);
  const broadcast = json(broadcastPath);
  if (!Array.isArray(broadcast.transactions)) throw new Error('Expected a Foundry broadcast transaction file');
  const deployments: Record<string, any> = {};
  for (const [name, field] of Object.entries(contracts)) {
    const matches = broadcast.transactions.filter((tx: any) => tx.contractName === name && tx.transactionType === 'CREATE');
    if (matches.length !== 1) throw new Error(`Expected exactly one ${name} deployment transaction`);
    const txHash = hash(matches[0].hash, `${name} transaction`);
    const [receipt, transaction] = await Promise.all([client.getTransactionReceipt({ hash: txHash }), client.getTransaction({ hash: txHash })]);
    const deployed = address(receipt.contractAddress, `${name} receipt address`);
    if (receipt.status !== 'success' || transaction.to !== null) throw new Error(`${name} deployment did not succeed`);
    if (deployed.toLowerCase() !== address(matches[0].contractAddress, `${name} broadcast address`).toLowerCase()) throw new Error(`${name} receipt address differs from broadcast`);
    const canonical = await client.getBlock({ blockNumber: receipt.blockNumber });
    if (canonical.hash !== receipt.blockHash) throw new Error(`${name} receipt is not canonical`);
    const code = await client.getCode({ address: deployed });
    if (!code || code === '0x') throw new Error(`${name} has no live bytecode`);
    deployments[field] = { address: deployed, transactionHash: txHash, blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash, deployer: transaction.from, runtimeCodeHash: keccak256(code), transactionInput: transaction.input };
  }
  const deployer = deployments.identityRegistry.deployer;
  const candidate = json(resolve(root, 'contracts/deployments/10143.candidate.json'));
  if (candidate.chainId !== 10143 || candidate.status !== 'candidate' || candidate.deployer.toLowerCase() !== deployer.toLowerCase()) throw new Error('Candidate deployment does not match confirmed transactions');
  for (const field of Object.values(contracts)) if (address(candidate[field], field).toLowerCase() !== deployments[field].address.toLowerCase()) throw new Error('Candidate contract addresses differ from actual deployment');
  const intendedAdmin = address(candidate.admin, 'intended administrator');
  const intendedCommitter = address(candidate.committer, 'intended committer');
  const sources: Record<string, unknown> = {};
  let commonCompiler: unknown;
  for (const [name, field] of Object.entries(contracts)) {
    const artifact = json(resolve(root, `contracts/out/${name}.sol/${name}.json`));
    const metadata = typeof artifact.metadata === 'string' ? JSON.parse(artifact.metadata) : artifact.metadata;
    if (!metadata?.compiler?.version || !metadata.settings) throw new Error(`Missing compiler metadata for ${name}; run forge build`);
    const compiler = { version: metadata.compiler.version, optimizer: metadata.settings.optimizer, viaIR: metadata.settings.viaIR, evmVersion: metadata.settings.evmVersion };
    if (commonCompiler && JSON.stringify(commonCompiler) !== JSON.stringify(compiler)) throw new Error('Deployment compiler settings differ');
    commonCompiler = compiler;
    const args = name === 'AgentRegistry' ? [] : name === 'AetherisRouter' ? [deployments.identityRegistry.address, deployments.validationRegistry.address, deployer] : [deployments.identityRegistry.address, deployer];
    const expected = encodeDeployData({ abi: artifact.abi as Abi, bytecode: artifact.bytecode.object as Hex, args });
    if (deployments[field].deployer.toLowerCase() !== deployer.toLowerCase() || expected.toLowerCase() !== deployments[field].transactionInput.toLowerCase()) throw new Error(`${name} deployed creation code does not match the current artifact and constructor`);
    sources[name] = metadata.sources;
    delete deployments[field].transactionInput;
  }
  const reads = await Promise.all([
    client.readContract({ address: deployments.router.address, abi: linkageAbi, functionName: 'identityRegistry' }),
    client.readContract({ address: deployments.router.address, abi: linkageAbi, functionName: 'validationRegistry' }),
    client.readContract({ address: deployments.reputationRegistry.address, abi: linkageAbi, functionName: 'getIdentityRegistry' }),
    client.readContract({ address: deployments.validationRegistry.address, abi: linkageAbi, functionName: 'getIdentityRegistry' }),
    client.readContract({ address: deployments.reputationRegistry.address, abi: linkageAbi, functionName: 'taskRouter' }),
  ]);
  const expectedLinks = [deployments.identityRegistry.address, deployments.validationRegistry.address, deployments.identityRegistry.address, deployments.identityRegistry.address, deployments.router.address];
  if (reads.some((value, i) => value.toLowerCase() !== expectedLinks[i].toLowerCase())) throw new Error('Deployed registry/router linkages do not match');
  const roles: Record<string, unknown> = {};
  for (const field of ['router', 'reputationRegistry', 'validationRegistry']) {
    const [owner, pending] = await Promise.all([
      client.readContract({ address: deployments[field].address, abi: rolesAbi, functionName: 'owner' }),
      client.readContract({ address: deployments[field].address, abi: rolesAbi, functionName: 'pendingOwner' }),
    ]);
    const accepted = owner.toLowerCase() === intendedAdmin.toLowerCase() && /^0x0{40}$/i.test(pending);
    const pendingTransfer = intendedAdmin.toLowerCase() !== deployer.toLowerCase() && owner.toLowerCase() === deployer.toLowerCase() && pending.toLowerCase() === intendedAdmin.toLowerCase();
    if (!accepted && !pendingTransfer) throw new Error(`${field} administrator configuration is incomplete or unexpected`);
    roles[field] = { owner, pendingOwner: pending, ownershipAccepted: accepted };
  }
  const [committerAllowed, deployerAllowed] = await Promise.all([
    client.readContract({ address: deployments.router.address, abi: rolesAbi, functionName: 'committers', args: [intendedCommitter] }),
    client.readContract({ address: deployments.router.address, abi: rolesAbi, functionName: 'committers', args: [deployer] }),
  ]);
  if (!committerAllowed || deployerAllowed !== (intendedCommitter.toLowerCase() === deployer.toLowerCase())) throw new Error('Batch committer configuration is incomplete or unexpected');
  const earliest = Object.values(deployments).reduce((min: bigint, value: any) => BigInt(value.blockNumber) < min ? BigInt(value.blockNumber) : min, 2n ** 256n - 1n);
  const manifest = { schemaVersion: 2, status: 'live-verified', chainId: 10143, verifiedAt: new Date().toISOString(), ...Object.fromEntries(Object.entries(deployments).map(([field, item]) => [field, item.address])), earliestDeploymentBlock: earliest.toString(), compiler: commonCompiler, sourceHashes: sources, deployments, admin: intendedAdmin, committer: intendedCommitter, roles, linkages: { routerIdentityRegistry: reads[0], routerValidationRegistry: reads[1], reputationIdentityRegistry: reads[2], validationIdentityRegistry: reads[3], reputationTaskRouter: reads[4] } };
  save(manifestPath, manifest);
  console.log(`Verified four live deployments and five linkages; wrote contracts/deployments/10143.json`);
  return manifest;
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/finalize-deployment.ts')) main(() => finalizeDeployment(process.argv[2] ? resolve(process.argv[2]) : undefined));
