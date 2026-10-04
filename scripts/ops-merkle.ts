import { concatHex, keccak256, type Hex } from 'viem';

/** Same sorted-pair, duplicate-odd convention as the daemon and indexer. */
export function blockRoot(leaves: Hex[]): Hex {
  if (!leaves.length) throw new Error('Cannot commit an empty task block');
  let level = [...leaves];
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index]; const right = level[index + 1] || left;
      next.push(keccak256(concatHex(left.toLowerCase() <= right.toLowerCase() ? [left, right] : [right, left])));
    }
    level = next;
  }
  return level[0];
}
