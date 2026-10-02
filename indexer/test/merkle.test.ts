import assert from "node:assert/strict";
import test from "node:test";
import { encodePacked, keccak256, type Hex } from "viem";
import { appendLeaf, batchId, executionLeaf, frontierRoot, hashPair } from "../src/merkle.js";

function referenceRoot(leaves: Hex[]): Hex {
  let level = leaves;
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(hashPair(level[i], level[i + 1] ?? level[i]));
    level = next;
  }
  return level[0];
}

test("incremental persisted frontier matches full trees for odd and even widths", () => {
  let frontier: string[] = [];
  const leaves: Hex[] = [];
  for (let i = 0; i < 257; i++) {
    const leaf = keccak256(encodePacked(["uint256"], [BigInt(i)]));
    leaves.push(leaf);
    frontier = appendLeaf(JSON.parse(JSON.stringify(frontier)), BigInt(i), leaf);
    assert.equal(frontierRoot(frontier), referenceRoot(leaves), `width ${i + 1}`);
  }
});

test("execution commitments separate chains, routers, inputs, outputs and proofs", () => {
  const input = {
    chainId: 10143n, router: `0x${"11".repeat(20)}` as const, shard: `0x${"22".repeat(20)}` as const,
    agentId: 1n, taskId: `0x${"33".repeat(32)}` as const, inputHash: `0x${"44".repeat(32)}` as const,
    outputHash: `0x${"55".repeat(32)}` as const, proofHash: `0x${"66".repeat(32)}` as const,
  };
  const leaf = executionLeaf(input);
  // Independently calculated with js-sha3; shared with Rust tests.
  assert.equal(leaf, "0xb039a3d2a6aa1f34fff2aaa77864a33cda193c69d6c66559fee65c8474d61fdf");
  assert.equal(batchId(input.chainId, input.router, 42n, input.proofHash), "0x25369331dc35862a909c5dfb0a7a48efbd9879c308345fdb1d575f40574c8aa5");
  assert.notEqual(leaf, executionLeaf({ ...input, chainId: 143n }));
  assert.notEqual(leaf, executionLeaf({ ...input, router: input.shard }));
  assert.notEqual(leaf, executionLeaf({ ...input, proofHash: input.inputHash }));
  assert.notEqual(batchId(input.chainId, input.router, 42n, input.proofHash), batchId(input.chainId, input.router, 42n, input.outputHash));
  assert.throws(() => frontierRoot([]), /empty/);
});
