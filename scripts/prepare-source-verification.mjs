import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeAbiParameters, keccak256, toBytes } from 'viem';

// Local preparation only. No environment files, accounts, signing, network calls,
// explorer submissions or deployment-manifest writes are performed.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'contracts/deployments/10143.json'), 'utf8'));
const output = path.join(root, 'scripts/.artifacts/source-verification', new Date().toISOString().replace(/[:.]/g, '-'));
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--compile-with'), 'Usage: node scripts/prepare-source-verification.mjs [--compile-with path/to/solc/module]');
const compiler = args.length ? createRequire(import.meta.url)(path.resolve(args[1])) : undefined;
if (compiler) assert.ok(compiler.version().startsWith(manifest.compiler.version), 'Use the exact deployed solc version');
mkdirSync(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), chainId: 10143, compiler: manifest.compiler, freshCompilation: Boolean(compiler), contracts: [] };
for (const [name, field] of Object.entries({ AgentRegistry: 'identityRegistry', ReputationRegistry: 'reputationRegistry', ValidationRegistry: 'validationRegistry', AetherisRouter: 'router' })) {
  const artifact = JSON.parse(readFileSync(path.join(root, `contracts/out/${name}.sol/${name}.json`), 'utf8'));
  const metadata = typeof artifact.metadata === 'string' ? JSON.parse(artifact.metadata) : artifact.metadata;
  assert.equal(metadata.compiler.version, manifest.compiler.version);
  assert.deepEqual(metadata.sources, manifest.sourceHashes[name], `${name}: metadata differs from deployed source hashes`);
  const sources = Object.fromEntries(Object.entries(metadata.sources).map(([source, expected]) => {
    const filename = path.resolve(root, 'contracts', source);
    assert.ok(filename.startsWith(path.resolve(root, 'contracts') + path.sep), 'Source path must stay inside contracts');
    const raw = readFileSync(filename, 'utf8');
    // Windows dependency checkouts can contain CRLF while the deployed compiler
    // metadata pins LF bytes. Accept normalization only when its hash matches.
    const content = keccak256(toBytes(raw)) === expected.keccak256 ? raw : raw.replace(/\r\n/g, '\n');
    assert.equal(keccak256(toBytes(content)), expected.keccak256, `Source hash differs: ${source}`);
    return [source, { content }];
  }));
  const { compilationTarget, ...settings } = metadata.settings;
  assert.equal(Object.keys(settings.libraries ?? {}).length, 0, 'Unexpected linked libraries');
  const input = { language: 'Solidity', sources, settings: { ...settings, outputSelection: { '*': { '*': ['abi', 'metadata', 'evm.bytecode', 'evm.deployedBytecode'] } } } };
  if (compiler) {
    const compiled = JSON.parse(compiler.compile(JSON.stringify(input)));
    const errors = (compiled.errors ?? []).filter(error => error.severity === 'error');
    assert.deepEqual(errors, [], `${name}: compilation failed`);
    const built = compiled.contracts[Object.keys(compilationTarget)[0]][name];
    assert.equal('0x' + built.evm.bytecode.object, artifact.bytecode.object, `${name}: creation bytecode mismatch`);
    assert.equal('0x' + built.evm.deployedBytecode.object, artifact.deployedBytecode.object, `${name}: runtime template mismatch`);
  }
  const deployment = manifest.deployments[field];
  const values = name === 'AgentRegistry' ? [] : name === 'AetherisRouter'
    ? [manifest.identityRegistry, manifest.validationRegistry, deployment.deployer]
    : [manifest.identityRegistry, deployment.deployer];
  const inputs = artifact.abi.find(item => item.type === 'constructor')?.inputs ?? [];
  const constructorArguments = values.length ? encodeAbiParameters(inputs, values).slice(2) : '';
  const filename = `${name}.standard-input.json`;
  const text = JSON.stringify(input, null, 2) + '\n';
  writeFileSync(path.join(output, filename), text);
  writeFileSync(path.join(output, `${name}.constructor-args.txt`), constructorArguments + '\n');
  report.contracts.push({ name, address: deployment.address, target: `${Object.keys(compilationTarget)[0]}:${name}`, compiler: metadata.compiler.version, inputFile: filename, inputSha256: createHash('sha256').update(text).digest('hex'), sourceCount: Object.keys(sources).length, constructorValues: values, constructorArguments, sourceHashesMatchDeployment: true, freshCreationAndRuntimeTemplateMatch: compiler ? true : null, deploymentTransaction: deployment.transactionHash, manifestRuntimeCodeHash: deployment.runtimeCodeHash, explorer: `https://testnet.monadscan.com/address/${deployment.address}#code`, acceptedSourceVerification: 'NOT VERIFIED: preparation does not submit or establish explorer acceptance' });
  console.log(`${name}: source hashes matched${compiler ? '; freshly compiled bytecode matched' : ''}`);
}
report.completedAt = new Date().toISOString();
writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Prepared four source-verification inputs: ${output}`);
