import type { DataSource, MerkleBatch } from '@/lib/types';
import { explorerTx, truncate } from '@/lib/contracts';
import { EmptyState, Notice } from './Shared';

export function SourceNotice({ source }: { source?: DataSource }) {
  if (!source) return null;
  return <Notice>{source.kind === 'envio' ? <>Agent activity from <strong>Envio GraphQL</strong> · indexed through block {source.indexedThrough}{source.lagBlocks && <> · {source.lagBlocks} blocks behind RPC</>}. Network throughput and reputation use RPC.</> : <><strong>RPC fallback</strong> · No Envio endpoint is configured. Activity covers a bounded event window; independently indexed Merkle verification is unavailable.</>}</Notice>;
}
export function MerkleBatches({ batches, source }: { batches: MerkleBatch[]; source?: DataSource }) {
  return <section className="panel merkle-panel"><div className="panel-heading"><div><h2>Merkle commitments</h2><p>Roots independently rebuilt by the indexer and compared with router commitments.</p></div><span className="tag">{source?.kind === 'envio' ? 'ENVIO' : 'NOT CONNECTED'}</span></div>
    {batches.length ? <div className="table-scroll"><table className="shard-table"><thead><tr><th>Block</th><th>Root</th><th>Leaves</th><th>Verification</th><th>Commitment</th></tr></thead><tbody>{batches.map(batch => <tr key={batch.batchId}><td>{batch.blockNumber}</td><td className="mono" title={batch.root}>{truncate(batch.root, 8)}</td><td>{batch.leafCount}</td><td><span className={`tag ${batch.verified ? 'tag-cyan' : ''}`}>{batch.verified ? 'Root matched' : batch.status === 'mismatch' ? 'Mismatch' : 'Not verified'}</span></td><td>{batch.commitmentTx ? <a className="text-link" href={explorerTx(batch.commitmentTx)} target="_blank" rel="noreferrer">View transaction ↗</a> : 'Awaiting commit'}</td></tr>)}</tbody></table></div> : <EmptyState title={source?.kind === 'envio' ? 'No indexed batches yet' : 'Indexed verification unavailable'} description={source?.kind === 'envio' ? 'Task execution blocks and their published commitments will appear here.' : 'Configure Envio to compare calculated roots with published batch commitments.'} />}
  </section>;
}
