import { encodePacked, keccak256 } from 'viem';
import type { MerkleBatch, Shard } from './types';

export class IndexerError extends Error {
  constructor(message = 'The configured Envio indexer is unavailable. Check its endpoint, access settings and generated schema.') { super(message); this.name = 'IndexerError'; }
}
export interface IndexerScope { chainId: number; router: string; registry: string }
type Row = Record<string, unknown>;
export function object(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new IndexerError('Envio returned an invalid response object.');
  return value as Row;
}
export function rows(value: unknown, maximum: number): Row[] {
  if (!Array.isArray(value) || value.length > maximum) throw new IndexerError('Envio returned an invalid or oversized result set.');
  return value.map(object);
}
export function text(value: unknown, maximum = 512): string {
  if (typeof value !== 'string' || value.length > maximum) throw new IndexerError('Envio returned an invalid text field.');
  return value;
}
export function uint(value: unknown): string {
  const result = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : text(value, 78);
  if (!/^\d+$/.test(result) || BigInt(result) >= 2n ** 256n) throw new IndexerError('Envio returned an invalid integer.');
  return result;
}
function hex(value: unknown, bytes: number): `0x${string}` {
  const result = text(value, 2 + bytes * 2);
  if (!new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(result)) throw new IndexerError('Envio returned an invalid address or hash.');
  return result.toLowerCase() as `0x${string}`;
}
function sameAddress(value: unknown, expected: string) { if (hex(value, 20) !== expected.toLowerCase()) throw new IndexerError('Envio data belongs to a different contract deployment.'); }
function chain(row: Row, scope: IndexerScope) { if (row.chainId !== scope.chainId) throw new IndexerError('Envio data belongs to a different chain.'); }
export function parseProgress(value: unknown, scope: IndexerScope): string {
  const result = rows(value, 1);
  if (!result.length) throw new IndexerError('Envio has not indexed this identity/router deployment yet. Check addresses and the registry deployment start block.');
  const row = result[0]; chain(row, scope); sameAddress(row.router, scope.router); sameAddress(row.registry, scope.registry);
  if (row.id !== `${scope.chainId}:${scope.router.toLowerCase()}:${scope.registry.toLowerCase()}`) throw new IndexerError('Envio progress identifier does not match the configured deployment.');
  return uint(row.blockNumber);
}
export function count(value: unknown): number {
  const result = Number(uint(object(object(value).aggregate).count));
  if (!Number.isSafeInteger(result)) throw new IndexerError('Envio count exceeds the supported display range.');
  return result;
}
export function parseAgent(row: Row, scope: IndexerScope) {
  chain(row, scope); sameAddress(row.registry, scope.registry);
  const id = uint(row.agentId);
  if (BigInt(id) < 1n || row.id !== `${scope.chainId}:${scope.registry.toLowerCase()}:${id}`) throw new IndexerError('Envio returned an invalid identity key.');
  return { id, owner: hex(row.owner, 20), uri: text(row.agentURI, 4096), tasksCompleted: uint(row.tasksCompleted) };
}
export function parseShard(row: Row, scope: IndexerScope, fromBlock: bigint, toBlock: bigint): Shard {
  chain(row, scope); sameAddress(row.router, scope.router); sameAddress(object(row.agent).registry, scope.registry);
  const address = hex(row.address, 20), agentId = uint(row.agentId), createdBlock = uint(row.createdBlock);
  if (BigInt(createdBlock) < fromBlock || BigInt(createdBlock) > toBlock || row.id !== `${scope.chainId}:${address}`) throw new IndexerError('Envio returned a shard outside the requested window.');
  if (row.status !== 'ready' && row.status !== 'completed') throw new IndexerError('Envio returned an unknown shard state.');
  const completion = row.status === 'completed' ? BigInt(uint(row.completedBlock)) : undefined;
  if (completion !== undefined && completion < BigInt(createdBlock)) throw new IndexerError('Envio completion precedes shard creation.');
  const executed = completion !== undefined && completion <= toBlock;
  if (executed && BigInt(uint(object(row.execution).blockNumber)) !== completion) throw new IndexerError('Envio execution belongs to a different block.');
  return { address, agentId, taskId: hex(row.taskId, 32), sequenceNonce: uint(row.sequenceNonce), executor: hex(row.executor, 20), inputHash: hex(row.inputHash, 32),
    createdBlock, transactionHash: hex(row.creationTx, 32), status: executed ? 'executed' : 'created',
    outputHash: executed ? hex(row.outputHash, 32) : undefined, proofHash: executed ? hex(row.proofHash, 32) : undefined,
    executionTransactionHash: executed ? hex(object(row.execution).transactionHash, 32) : undefined };
}
export function parseBatches(value: unknown, commitmentsValue: unknown, scope: IndexerScope, toBlock: bigint): MerkleBatch[] {
  const commitments = rows(commitmentsValue, 24);
  for (const row of commitments) { chain(row, scope); sameAddress(row.router, scope.router); if (typeof row.verified !== 'boolean') throw new IndexerError('Envio returned invalid commitment verification.'); }
  return rows(value, 12).map(row => {
    chain(row, scope); sameAddress(row.router, scope.router);
    const block = uint(row.blockNumber), blockHash = hex(row.blockHash, 32), root = hex(row.root, 32), batchId = hex(row.batchId, 32), leafCount = uint(row.leafCount);
    if (BigInt(block) > toBlock || BigInt(leafCount) === 0n || !['observed', 'complete', 'committed', 'mismatch'].includes(text(row.status))) throw new IndexerError('Envio returned an invalid Merkle batch.');
    const expected = keccak256(encodePacked(['uint256', 'address', 'uint256', 'bytes32'], [BigInt(scope.chainId), scope.router as `0x${string}`, BigInt(block), blockHash]));
    if (batchId !== expected) throw new IndexerError('Envio returned a Merkle batch from a different block or deployment.');
    const commitment = commitments.find(item => item.batchId === batchId);
    const verified = row.status === 'committed' && row.committedRoot === root && row.committedLeafCount !== null && uint(row.committedLeafCount) === leafCount &&
      !!commitment && commitment.verified === true && hex(commitment.root, 32) === root && uint(commitment.leafCount) === leafCount && uint(commitment.fromBlock) === block && uint(commitment.toBlock) === block;
    return { batchId, blockNumber: block, root, leafCount, verified, status: text(row.status) as MerkleBatch['status'], commitmentTx: row.commitmentTx == null ? undefined : hex(row.commitmentTx, 32) };
  });
}

export async function graphqlRequest(endpoint: string, headers: Record<string, string>, query: string, variables: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<Row> {
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new IndexerError('ENVIO_GRAPHQL_URL is invalid.'); }
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new IndexerError('Envio requires HTTPS, or HTTP on localhost for local development.');
  try {
    const response = await fetcher(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new IndexerError(`Envio returned HTTP ${response.status}. Check server-side access configuration.`);
    const reader = response.body?.getReader(); if (!reader) throw new IndexerError();
    const chunks: Uint8Array[] = []; let length = 0;
    try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.length; if (length > 1024 * 1024) throw new IndexerError('Envio response exceeds 1 MiB.'); chunks.push(chunk.value); } }
    finally { await reader.cancel(); }
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const envelope = object(JSON.parse(new TextDecoder().decode(bytes)));
    if (envelope.errors !== undefined && (!Array.isArray(envelope.errors) || envelope.errors.length > 0)) throw new IndexerError('Envio rejected the query. Check generated schema and read/aggregate permissions.');
    return object(envelope.data);
  } catch (error) { if (error instanceof IndexerError) throw error; throw new IndexerError(); }
}
