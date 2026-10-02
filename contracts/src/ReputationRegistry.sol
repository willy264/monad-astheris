// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {AgentRegistry} from "./AgentRegistry.sol";
import {AetherisRouter} from "./AetherisRouter.sol";
import {EphemeralShard} from "./EphemeralShard.sol";

/// @notice ERC-8004 structured feedback. Scores are meaningful only with a chosen trusted client set.
contract ReputationRegistry is Ownable2Step {
    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        string tag1;
        string tag2;
        bool isRevoked;
    }
    AgentRegistry private _identity;
    AetherisRouter public taskRouter;
    mapping(uint256 => address[]) private _clients;
    mapping(uint256 => mapping(address => Feedback[])) private _feedback;
    mapping(bytes32 => address[]) private _responders;
    mapping(bytes32 => mapping(address => uint64)) private _responseCounts;
    mapping(address => bool) public recordedTasks;
    mapping(uint256 => uint256) public completedTasks;

    error AlreadyInitialized();
    error InvalidArgument();
    error SelfFeedback();
    error MissingFeedback();
    error AlreadyRevoked();
    error AlreadyRecorded();
    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string indexed indexedTag1,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );
    event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex);
    event ResponseAppended(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        address indexed responder,
        string responseURI,
        bytes32 responseHash
    );
    event TaskExecutionRecorded(
        uint256 indexed agentId, address indexed shard, bytes32 indexed taskId, bytes32 outputHash, bytes32 proofHash
    );
    event TaskRouterSet(address indexed router);

    constructor(address registry, address admin) Ownable(admin) {
        initialize(registry);
    }

    function initialize(address registry) public {
        if (address(_identity) != address(0)) revert AlreadyInitialized();
        if (registry.code.length == 0) revert InvalidArgument();
        _identity = AgentRegistry(registry);
    }

    function getIdentityRegistry() external view returns (address) {
        return address(_identity);
    }

    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        address agentOwner = _identity.ownerOf(agentId);
        if (
            msg.sender == agentOwner || _identity.getApproved(agentId) == msg.sender
                || _identity.isApprovedForAll(agentOwner, msg.sender)
        ) revert SelfFeedback();
        if (valueDecimals > 18) revert InvalidArgument();
        Feedback[] storage records = _feedback[agentId][msg.sender];
        if (records.length == 0) _clients[agentId].push(msg.sender);
        if (records.length == type(uint64).max) revert InvalidArgument();
        records.push(Feedback(value, valueDecimals, tag1, tag2, false));
        emit NewFeedback(
            agentId,
            msg.sender,
            uint64(records.length),
            value,
            valueDecimals,
            tag1,
            tag1,
            tag2,
            endpoint,
            feedbackURI,
            feedbackHash
        );
    }

    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        Feedback storage item = _getFeedback(agentId, msg.sender, feedbackIndex);
        if (item.isRevoked) revert AlreadyRevoked();
        item.isRevoked = true;
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseURI,
        bytes32 responseHash
    ) external {
        _getFeedback(agentId, clientAddress, feedbackIndex);
        bytes32 key = keccak256(abi.encode(agentId, clientAddress, feedbackIndex));
        if (_responseCounts[key][msg.sender] == 0) _responders[key].push(msg.sender);
        ++_responseCounts[key][msg.sender];
        emit ResponseAppended(agentId, clientAddress, feedbackIndex, msg.sender, responseURI, responseHash);
    }

    function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)
        external
        view
        returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool isRevoked)
    {
        Feedback storage item = _getFeedback(agentId, clientAddress, feedbackIndex);
        return (item.value, item.valueDecimals, item.tag1, item.tag2, item.isRevoked);
    }

    function getClients(uint256 agentId) external view returns (address[] memory) {
        return _clients[agentId];
    }

    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64) {
        return uint64(_feedback[agentId][clientAddress].length);
    }

    function getSummary(uint256 agentId, address[] calldata clientAddresses, string calldata tag1, string calldata tag2)
        external
        view
        returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)
    {
        _identity.ownerOf(agentId);
        if (clientAddresses.length == 0) revert InvalidArgument();
        int256 sum;
        // Compute at 18 decimal places; reduce precision if the mean exceeds int128.
        for (uint256 i; i < clientAddresses.length; ++i) {
            for (uint256 j; j < i; ++j) {
                if (clientAddresses[i] == clientAddresses[j]) revert InvalidArgument();
            }
            Feedback[] storage records = _feedback[agentId][clientAddresses[i]];
            for (uint256 j; j < records.length; ++j) {
                Feedback storage item = records[j];
                if (item.isRevoked || !_matches(item, tag1, tag2)) continue;
                sum += int256(item.value) * int256(uint256(10) ** (18 - item.valueDecimals));
                ++count;
            }
        }
        if (count == 0) return (0, 0, 0);
        int256 average = sum / int256(uint256(count));
        summaryValueDecimals = 18;
        while (
            summaryValueDecimals > 0 && (average > type(int128).max || average < type(int128).min || average % 10 == 0)
        ) {
            average /= 10;
            --summaryValueDecimals;
        }
        summaryValue = int128(average);
    }

    function readAllFeedback(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2,
        bool includeRevoked
    )
        external
        view
        returns (
            address[] memory clients,
            uint64[] memory feedbackIndexes,
            int128[] memory values,
            uint8[] memory valueDecimals,
            string[] memory tag1s,
            string[] memory tag2s,
            bool[] memory revokedStatuses
        )
    {
        address[] memory selected;
        if (clientAddresses.length == 0) selected = _clients[agentId];
        else selected = clientAddresses;
        uint256 count;
        for (uint256 i; i < selected.length; ++i) {
            Feedback[] storage records = _feedback[agentId][selected[i]];
            for (uint256 j; j < records.length; ++j) {
                if ((includeRevoked || !records[j].isRevoked) && _matches(records[j], tag1, tag2)) ++count;
            }
        }
        clients = new address[](count);
        feedbackIndexes = new uint64[](count);
        values = new int128[](count);
        valueDecimals = new uint8[](count);
        tag1s = new string[](count);
        tag2s = new string[](count);
        revokedStatuses = new bool[](count);
        uint256 k;
        for (uint256 i; i < selected.length; ++i) {
            Feedback[] storage records = _feedback[agentId][selected[i]];
            for (uint256 j; j < records.length; ++j) {
                Feedback storage item = records[j];
                if ((!includeRevoked && item.isRevoked) || !_matches(item, tag1, tag2)) continue;
                clients[k] = selected[i];
                feedbackIndexes[k] = uint64(j + 1);
                values[k] = item.value;
                valueDecimals[k] = item.valueDecimals;
                tag1s[k] = item.tag1;
                tag2s[k] = item.tag2;
                revokedStatuses[k] = item.isRevoked;
                ++k;
            }
        }
    }

    function getResponseCount(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        address[] calldata responders
    ) external view returns (uint64 count) {
        address[] memory selected;
        if (clientAddress == address(0)) {
            selected = _clients[agentId];
        } else {
            selected = new address[](1);
            selected[0] = clientAddress;
        }
        for (uint256 i; i < selected.length; ++i) {
            uint256 first = feedbackIndex == 0 ? 1 : feedbackIndex;
            uint256 last = feedbackIndex == 0 ? _feedback[agentId][selected[i]].length : feedbackIndex;
            for (uint256 j = first; j <= last; ++j) {
                bytes32 key = keccak256(abi.encode(agentId, selected[i], uint64(j)));
                address[] memory chosen;
                if (responders.length == 0) chosen = _responders[key];
                else chosen = responders;
                for (uint256 k; k < chosen.length; ++k) {
                    count += _responseCounts[key][chosen[k]];
                }
            }
        }
    }

    function setTaskRouter(address router) external onlyOwner {
        if (router.code.length == 0 || address(taskRouter) != address(0)) revert InvalidArgument();
        if (address(AetherisRouter(router).identityRegistry()) != address(_identity)) revert InvalidArgument();
        taskRouter = AetherisRouter(router);
        emit TaskRouterSet(router);
    }

    /// @notice Anyone can append a verified completion after execution, away from the isolated write path.
    function recordTaskExecution(address shard) external {
        if (address(taskRouter) == address(0) || !taskRouter.isShard(shard) || !EphemeralShard(shard).completed()) {
            revert InvalidArgument();
        }
        if (recordedTasks[shard]) revert AlreadyRecorded();
        recordedTasks[shard] = true;
        EphemeralShard task = EphemeralShard(shard);
        ++completedTasks[task.agentId()];
        emit TaskExecutionRecorded(task.agentId(), shard, task.taskId(), task.outputHash(), task.proofHash());
    }

    function _getFeedback(uint256 agentId, address client, uint64 index) internal view returns (Feedback storage) {
        if (index == 0 || index > _feedback[agentId][client].length) revert MissingFeedback();
        return _feedback[agentId][client][index - 1];
    }

    function _matches(Feedback storage item, string memory tag1, string memory tag2) internal view returns (bool) {
        return (bytes(tag1).length == 0 || keccak256(bytes(tag1)) == keccak256(bytes(item.tag1)))
            && (bytes(tag2).length == 0 || keccak256(bytes(tag2)) == keccak256(bytes(item.tag2)));
    }
}
