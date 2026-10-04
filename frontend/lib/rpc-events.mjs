// @ts-check

// Monad's public RPC rejects eth_getLogs ranges wider than 100 blocks.
// Count inclusive blocks conservatively so this also works with stricter providers.
const MAX_BLOCKS_PER_REQUEST = 100n;

/**
 * Read a fixed, inclusive event window without exceeding the provider's range cap.
 * Requests within one event series are sequential; a failed chunk rejects the
 * entire read, leaving retry policy to the RPC transport and caller.
 *
 * @template T
 * @param {bigint} fromBlock
 * @param {bigint} toBlock
 * @param {(range: { fromBlock: bigint, toBlock: bigint }) => Promise<readonly T[]>} readChunk
 * @returns {Promise<T[]>}
 */
export async function readEventWindow(fromBlock, toBlock, readChunk) {
  if (fromBlock < 0n || toBlock < 0n) throw new RangeError('Block numbers must be nonnegative.');
  /** @type {T[]} */
  const events = [];
  for (let start = fromBlock; start <= toBlock; start += MAX_BLOCKS_PER_REQUEST) {
    const end = start + MAX_BLOCKS_PER_REQUEST - 1n;
    const chunk = await readChunk({ fromBlock: start, toBlock: end < toBlock ? end : toBlock });
    for (const event of chunk) events.push(event);
  }
  return events;
}
