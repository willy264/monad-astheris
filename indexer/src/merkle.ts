import { concatHex, encodePacked, keccak256, type Address, type Hex } from "viem";

export interface ExecutionLeaf {
  chainId: bigint;
  router: Address;
  shard: Address;
  agentId: bigint;
  taskId: Hex;
  inputHash: Hex;
  outputHash: Hex;
  proofHash: Hex;
}

export function executionLeaf(e: ExecutionLeaf): Hex {
  return keccak256(keccak256(encodePacked(
    ["uint256", "address", "address", "uint256", "bytes32", "bytes32", "bytes32", "bytes32"],
    [e.chainId, e.router, e.shard, e.agentId, e.taskId, e.inputHash, e.outputHash, e.proofHash],
  )));
}

export function batchId(chainId: bigint, router: Address, block: bigint, hash: Hex): Hex {
  return keccak256(encodePacked(["uint256", "address", "uint256", "bytes32"], [chainId, router, block, hash]));
}

export function hashPair(a: Hex, b: Hex): Hex {
  return keccak256(concatHex(a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a]));
}

/** Persist the binary frontier, requiring O(log n) work per execution. */
export function appendLeaf(frontier: readonly string[], count: bigint, leaf: Hex): string[] {
  const next = [...frontier];
  let level = 0;
  let node = leaf;
  let remaining = count;
  while ((remaining & 1n) === 1n) {
    if (!next[level]) throw new Error("Invalid Merkle frontier");
    node = hashPair(next[level] as Hex, node);
    next[level] = "";
    remaining >>= 1n;
    level++;
  }
  next[level] = node;
  return next;
}

/** Sorted pairs; at each level duplicate the last node when the level is odd. */
export function frontierRoot(frontier: readonly string[]): Hex {
  let root: Hex | undefined;
  let height = 0;
  for (let level = 0; level < frontier.length; level++) {
    if (!frontier[level]) continue;
    if (!root) {
      root = frontier[level] as Hex;
      height = level;
      continue;
    }
    while (height < level) {
      root = hashPair(root, root);
      height++;
    }
    root = hashPair(frontier[level] as Hex, root);
    height = level + 1;
  }
  if (!root) throw new Error("Cannot commit an empty Merkle tree");
  return root;
}
