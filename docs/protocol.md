# Shared protocol

## Task identity and CREATE2

`salt = keccak256(abi.encodePacked(uint256 agentId, bytes32 taskId, uint256 sequenceNonce))`.
Each component encodes both integers as 32-byte unsigned big-endian words. JSON transports uint256 values as decimal strings to avoid JavaScript precision loss. Contract addresses are 20 bytes; hashes are 32 bytes. The CREATE2 address also depends on the router address and the shard's constructor bytecode plus all constructor arguments. Use `predictShardAddress` on the deployed router rather than substituting a bytecode hash from a different compiler build.

Reusing a salt is rejected even if the proposed executor or input hash changes. A task can execute once per shard. A fresh sequence nonce creates a new task instance. Both the creator and assigned executor must be the current owner or an unexpired delegate. Delegation is bound to the identity's ownership epoch, so transferring the identity away and back does not revive a previous grant.

## Canonical log stream

The router emits:

```solidity
event ShardCreated(address indexed shard, uint256 indexed agentId, bytes32 indexed taskId,
    uint256 sequenceNonce, address executor, bytes32 inputHash);
event TaskExecuted(address indexed shard, uint256 indexed agentId, bytes32 indexed taskId,
    bytes32 inputHash, bytes32 outputHash, bytes32 proofHash);
event MerkleBatchCommitted(bytes32 indexed batchId, bytes32 root, uint256 leafCount,
    uint256 fromBlock, uint256 toBlock);
```

`TaskExecuted` logs are ordered by block number then log index (the log index is global within a block). A block's tree contains all such events from the configured router, including tasks submitted outside this daemon.

## Merkle leaf

```solidity
bytes32 leaf = keccak256(abi.encodePacked(keccak256(abi.encodePacked(
    uint256(chainId), address(router), address(shard), uint256(agentId),
    bytes32(taskId), bytes32(inputHash), bytes32(outputHash), bytes32(proofHash)
))));
```

The inner preimage is exactly 232 bytes. The outer preimage is its 32-byte digest. The chain and router fields prevent cross-chain and cross-deployment reuse; double hashing separates leaves from 64-byte internal-node preimages.

For each pair, sort the two 32-byte hashes lexicographically, concatenate them, and hash with Keccak-256. If a level has an odd number of nodes, duplicate its last node before hashing. A singleton root is its leaf. Empty blocks have no commitment. This is **not** the same tree convention as every OpenZeppelin or third-party Merkle builder; use the included implementation and test vectors.

The block batch identifier is:

```solidity
keccak256(abi.encodePacked(uint256(chainId), address(router), uint256(blockNumber), bytes32(blockHash)))
```

The daemon commits one complete block at a time (`fromBlock == toBlock`), scanning through the RPC's `finalized` block tag and verifying block hashes and parent continuity. Its transaction confirmation count is separately configurable. A finalized-block hash change halts settlement and requires operator reconciliation because the contract's audit trail is immutable. The indexer stores tree frontiers in its entity database, closes each block after the next block arrives, and labels mismatching commitments explicitly. Indexed data is subject to the indexer's normal chain rollback behavior; “complete” alone does not mean consensus-finalized.

Fixed interoperability vector (hex byte repetitions): chain `10143`, router `0x11…11` (20 bytes), shard `0x22…22` (20 bytes), agent `1`, task `0x33…33`, input `0x44…44`, output `0x55…55`, proof `0x66…66` (each hash 32 bytes) produces leaf `0xb039a3d2a6aa1f34fff2aaa77864a33cda193c69d6c66559fee65c8474d61fdf`. Block `42` with block hash `0x66…66` produces batch ID `0x25369331dc35862a909c5dfb0a7a48efbd9879c308345fdb1d575f40574c8aa5`. Agent `1`, the same task ID and sequence nonce `7` produce salt `0xc0837dccb7b05109d2ced1dfbcf109adeaa1a1258e74fa924d4f5c7f13562173`.

## Identity cards and reputation

An identity's `tokenURI` links to an ERC-8004 Agent Card, normally on IPFS. MCP endpoint availability and the truth of declared capabilities are off-chain properties. Reputation values are signed fixed-point integers with a decimal scale. A client allowlist is essential when interpreting aggregated feedback; raw public feedback is susceptible to Sybil manipulation.

## Payment and task authorization

The task signature and payment authorization serve different purposes. The task signature binds agent, nonce, executor, input/output/proof hashes, chain, router and deadline. The payment gate validates a payment credential before routing. A payment does not establish ownership of an agent, and a signature alone does not establish that funds have settled. Consult the daemon documentation for the enabled payment scheme, trusted facilitator and adapter boundaries.
