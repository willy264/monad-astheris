// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {AgentRegistry} from "./AgentRegistry.sol";
import {EphemeralShard} from "./EphemeralShard.sol";

/// @notice Isolates task result writes. Deployment, gas-payer nonces and shared reads can still contend.
contract AetherisRouter is Ownable2Step {
    struct Delegation {
        address owner;
        uint64 expiresAt;
        uint256 ownershipEpoch;
    }

    struct MerkleBatch {
        bytes32 root;
        uint256 leafCount;
        uint256 fromBlock;
        uint256 toBlock;
    }
    AgentRegistry public immutable identityRegistry;
    mapping(uint256 => mapping(address => Delegation)) public delegates;
    mapping(bytes32 => address) public shardsBySalt;
    mapping(address => bool) public isShard;
    mapping(address => bool) public committers;
    mapping(bytes32 => MerkleBatch) public merkleBatches;
    error Unauthorized();
    error InvalidArgument();
    error SaltAlreadyUsed(bytes32 salt);
    error UnknownShard();
    error BatchAlreadyCommitted();
    event DelegateSet(uint256 indexed agentId, address indexed delegate, uint64 expiresAt, address owner);
    event CommitterSet(address indexed committer, bool allowed);
    event ShardCreated(
        address indexed shard,
        uint256 indexed agentId,
        bytes32 indexed taskId,
        uint256 sequenceNonce,
        address executor,
        bytes32 inputHash
    );
    event TaskExecuted(
        address indexed shard,
        uint256 indexed agentId,
        bytes32 indexed taskId,
        bytes32 inputHash,
        bytes32 outputHash,
        bytes32 proofHash
    );
    event MerkleBatchCommitted(
        bytes32 indexed batchId, bytes32 root, uint256 leafCount, uint256 fromBlock, uint256 toBlock
    );

    constructor(address registry, address admin) Ownable(admin) {
        if (registry.code.length == 0) revert InvalidArgument();
        identityRegistry = AgentRegistry(registry);
        committers[admin] = true;
        emit CommitterSet(admin, true);
    }

    function setDelegate(uint256 agentId, address delegate, uint64 expiresAt) external {
        address agentOwner = identityRegistry.ownerOf(agentId);
        if (msg.sender != agentOwner) revert Unauthorized();
        if (delegate == address(0) || (expiresAt != 0 && expiresAt <= block.timestamp)) revert InvalidArgument();
        delegates[agentId][delegate] = Delegation(agentOwner, expiresAt, identityRegistry.ownershipEpoch(agentId));
        emit DelegateSet(agentId, delegate, expiresAt, agentOwner);
    }

    function isAuthorized(uint256 agentId, address account) public view returns (bool) {
        address agentOwner = identityRegistry.ownerOf(agentId);
        if (account == agentOwner) return true;
        Delegation memory grant = delegates[agentId][account];
        return grant.owner == agentOwner && grant.expiresAt > block.timestamp
            && grant.ownershipEpoch == identityRegistry.ownershipEpoch(agentId);
    }

    function shardSalt(uint256 agentId, bytes32 taskId, uint256 sequenceNonce) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(agentId, taskId, sequenceNonce));
    }

    function createShard(uint256 agentId, bytes32 taskId, uint256 sequenceNonce, address executor, bytes32 inputHash)
        external
        returns (address shard)
    {
        if (!isAuthorized(agentId, msg.sender) || !isAuthorized(agentId, executor)) revert Unauthorized();
        if (taskId == bytes32(0) || inputHash == bytes32(0)) revert InvalidArgument();
        bytes32 salt = shardSalt(agentId, taskId, sequenceNonce);
        if (shardsBySalt[salt] != address(0)) revert SaltAlreadyUsed(salt);
        shard = address(new EphemeralShard{salt: salt}(agentId, taskId, sequenceNonce, executor, inputHash));
        shardsBySalt[salt] = shard;
        isShard[shard] = true;
        emit ShardCreated(shard, agentId, taskId, sequenceNonce, executor, inputHash);
    }

    function predictShardAddress(
        uint256 agentId,
        bytes32 taskId,
        uint256 sequenceNonce,
        address executor,
        bytes32 inputHash
    ) external view returns (address) {
        bytes32 initHash = keccak256(
            abi.encodePacked(
                type(EphemeralShard).creationCode, abi.encode(agentId, taskId, sequenceNonce, executor, inputHash)
            )
        );
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff), address(this), shardSalt(agentId, taskId, sequenceNonce), initHash
                        )
                    )
                )
            )
        );
    }

    function executeTask(address shard, bytes32 outputHash, bytes32 proofHash) external {
        if (!isShard[shard]) revert UnknownShard();
        EphemeralShard task = EphemeralShard(shard);
        uint256 agentId = task.agentId();
        if (task.executor() != msg.sender || !isAuthorized(agentId, msg.sender)) revert Unauthorized();
        // No shared router or registry storage writes in the completion path.
        task.complete(outputHash, proofHash);
        emit TaskExecuted(shard, agentId, task.taskId(), task.inputHash(), outputHash, proofHash);
    }

    function setCommitter(address committer, bool allowed) external onlyOwner {
        if (committer == address(0)) revert InvalidArgument();
        committers[committer] = allowed;
        emit CommitterSet(committer, allowed);
    }

    /// @notice Authorized attestation of a log batch; the committer is trusted to include canonical logs.
    function commitMerkleBatch(bytes32 batchId, bytes32 root, uint256 leafCount, uint256 fromBlock, uint256 toBlock)
        external
    {
        if (!committers[msg.sender]) revert Unauthorized();
        if (
            batchId == bytes32(0) || root == bytes32(0) || leafCount == 0 || fromBlock > toBlock
                || toBlock >= block.number
        ) revert InvalidArgument();
        if (merkleBatches[batchId].root != bytes32(0)) revert BatchAlreadyCommitted();
        merkleBatches[batchId] = MerkleBatch(root, leafCount, fromBlock, toBlock);
        emit MerkleBatchCommitted(batchId, root, leafCount, fromBlock, toBlock);
    }
}
