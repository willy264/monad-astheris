// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice One immutable task context and one write-once result per CREATE2 address.
/// @dev Ephemeral denotes the task lifetime, not destruction of the audit trail.
contract EphemeralShard {
    address public immutable router;
    uint256 public immutable agentId;
    bytes32 public immutable taskId;
    uint256 public immutable sequenceNonce;
    address public immutable executor;
    bytes32 public immutable inputHash;
    bytes32 public outputHash;
    bytes32 public proofHash;
    bool public completed;
    error OnlyRouter();
    error AlreadyCompleted();
    error EmptyOutput();

    constructor(uint256 agentId_, bytes32 taskId_, uint256 sequenceNonce_, address executor_, bytes32 inputHash_) {
        router = msg.sender;
        agentId = agentId_;
        taskId = taskId_;
        sequenceNonce = sequenceNonce_;
        executor = executor_;
        inputHash = inputHash_;
    }

    function complete(bytes32 outputHash_, bytes32 proofHash_) external {
        if (msg.sender != router) revert OnlyRouter();
        if (completed) revert AlreadyCompleted();
        if (outputHash_ == bytes32(0)) revert EmptyOutput();
        completed = true;
        outputHash = outputHash_;
        proofHash = proofHash_;
    }
}
