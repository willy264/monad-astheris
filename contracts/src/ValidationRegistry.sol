// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {AgentRegistry} from "./AgentRegistry.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ICREReceiver} from "./interfaces/ICREReceiver.sol";

/// @notice ERC-8004 validation hooks with trusted TEE-attestation and Chainlink CRE adapters.
/// @dev TEE oracles validate vendor quotes off chain. CRE delivery trusts the configured forwarder and workflow.
contract ValidationRegistry is Ownable2Step, EIP712, ICREReceiver {
    struct Validation {
        address validator;
        uint256 agentId;
        uint8 response;
        bytes32 responseHash;
        string tag;
        uint256 lastUpdate;
        bytes32 expectedOutputHash;
    }

    /// @notice Fixed ABI tuple produced by the configured CRE workflow; all times are Unix seconds.
    struct CREReport {
        uint256 chainId;
        address receiver;
        bytes32 requestHash;
        uint256 agentId;
        bytes32 outputHash;
        bytes32 responseHash;
        uint64 observedAt;
        uint64 expiresAt;
        uint8 response;
    }
    AgentRegistry private _identity;
    mapping(bytes32 => Validation) private _validations;
    mapping(uint256 => bytes32[]) private _agentRequests;
    mapping(address => bytes32[]) private _validatorRequests;
    mapping(address => bool) public trustedAttestors;
    mapping(bytes32 => bool) public allowedMeasurements;
    mapping(bytes32 => bool) public consumedAttestations;
    address public creForwarder;
    uint256 public constant CRE_MAX_REPORT_AGE = 1 hours;
    mapping(bytes32 => bool) public allowedCREWorkflows;
    mapping(bytes32 => uint256) public requestCreatedAt;
    mapping(bytes32 => bool) public consumedCRERequests;
    mapping(bytes32 => bool) public consumedCREReports;
    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "TaskAttestation(bytes32 requestHash,uint256 agentId,bytes32 outputHash,bytes32 measurement,bytes32 evidenceHash,uint64 expiresAt)"
    );
    error AlreadyInitialized();
    error Unauthorized();
    error InvalidArgument();
    error DuplicateRequest();
    error UnknownRequest();
    error InvalidAttestation();
    error InvalidCREMetadata();
    error InvalidCREReport();
    error CREReportAlreadyConsumed();
    event ValidationRequest(
        address indexed validatorAddress, uint256 indexed agentId, string requestURI, bytes32 indexed requestHash
    );
    event ValidationResponse(
        address indexed validatorAddress,
        uint256 indexed agentId,
        bytes32 indexed requestHash,
        uint8 response,
        string responseURI,
        bytes32 responseHash,
        string tag
    );
    event AttestorSet(address indexed attestor, bool allowed);
    event MeasurementSet(bytes32 indexed measurement, bool allowed);
    event TEEAttestationVerified(
        bytes32 indexed requestHash,
        address indexed attestor,
        bytes32 outputHash,
        bytes32 measurement,
        bytes32 evidenceHash
    );
    event CREForwarderSet(address indexed previousForwarder, address indexed forwarder);
    event CREWorkflowSet(bytes32 indexed workflowId, bytes10 workflowName, address indexed workflowOwner, bool allowed);
    event CREReportAccepted(
        bytes32 indexed requestHash,
        bytes32 indexed workflowId,
        address indexed workflowOwner,
        bytes2 reportId,
        bytes32 reportHash,
        bytes32 outputHash,
        uint8 response
    );

    constructor(address registry, address admin) Ownable(admin) EIP712("Aetheris Validation", "1") {
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

    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external {
        _request(validatorAddress, agentId, requestURI, requestHash, bytes32(0));
    }

    function requestOutputValidation(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash,
        bytes32 expectedOutputHash
    ) external {
        if (expectedOutputHash == bytes32(0)) revert InvalidArgument();
        _request(validatorAddress, agentId, requestURI, requestHash, expectedOutputHash);
    }

    function _request(
        address validatorAddress,
        uint256 agentId,
        string memory requestURI,
        bytes32 requestHash,
        bytes32 outputHash
    ) internal {
        address agentOwner = _identity.ownerOf(agentId);
        if (
            msg.sender != agentOwner && _identity.getApproved(agentId) != msg.sender
                && !_identity.isApprovedForAll(agentOwner, msg.sender)
        ) revert Unauthorized();
        if (validatorAddress == address(0) || requestHash == bytes32(0) || bytes(requestURI).length == 0) {
            revert InvalidArgument();
        }
        if (_validations[requestHash].validator != address(0)) revert DuplicateRequest();
        _validations[requestHash] = Validation(validatorAddress, agentId, 0, bytes32(0), "", 0, outputHash);
        requestCreatedAt[requestHash] = block.timestamp;
        _agentRequests[agentId].push(requestHash);
        _validatorRequests[validatorAddress].push(requestHash);
        emit ValidationRequest(validatorAddress, agentId, requestURI, requestHash);
    }

    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag
    ) external {
        Validation storage item = _get(requestHash);
        if (msg.sender != item.validator) revert Unauthorized();
        if (response > 100) revert InvalidArgument();
        _respond(requestHash, item, response, responseURI, responseHash, tag);
    }

    function _respond(
        bytes32 requestHash,
        Validation storage item,
        uint8 response,
        string memory responseURI,
        bytes32 responseHash,
        string memory tag
    ) internal {
        item.response = response;
        item.responseHash = responseHash;
        item.tag = tag;
        item.lastUpdate = block.timestamp;
        emit ValidationResponse(item.validator, item.agentId, requestHash, response, responseURI, responseHash, tag);
    }

    function getValidationStatus(bytes32 requestHash)
        external
        view
        returns (
            address validatorAddress,
            uint256 agentId,
            uint8 response,
            bytes32 responseHash,
            string memory tag,
            uint256 lastUpdate
        )
    {
        Validation storage item = _get(requestHash);
        return (item.validator, item.agentId, item.response, item.responseHash, item.tag, item.lastUpdate);
    }

    function getSummary(uint256 agentId, address[] calldata validatorAddresses, string calldata tag)
        external
        view
        returns (uint64 count, uint8 averageResponse)
    {
        uint256 sum;
        bytes32[] storage requests = _agentRequests[agentId];
        for (uint256 i; i < requests.length; ++i) {
            Validation storage item = _validations[requests[i]];
            if (item.lastUpdate == 0 || (bytes(tag).length != 0 && keccak256(bytes(tag)) != keccak256(bytes(item.tag))))
            {
                continue;
            }
            bool include = validatorAddresses.length == 0;
            for (uint256 j; j < validatorAddresses.length && !include; ++j) {
                if (validatorAddresses[j] == item.validator) include = true;
            }
            if (include) {
                ++count;
                sum += item.response;
            }
        }
        if (count != 0) averageResponse = uint8(sum / count);
    }

    function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory) {
        return _agentRequests[agentId];
    }

    function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory) {
        return _validatorRequests[validatorAddress];
    }

    function verifyOutputHash(bytes32 requestHash, bytes calldata output) external view returns (bool) {
        bytes32 expected = _get(requestHash).expectedOutputHash;
        return expected != bytes32(0) && keccak256(output) == expected;
    }

    function setAttestor(address attestor, bool allowed) external onlyOwner {
        if (attestor == address(0)) revert InvalidArgument();
        trustedAttestors[attestor] = allowed;
        emit AttestorSet(attestor, allowed);
    }

    function setMeasurement(bytes32 measurement, bool allowed) external onlyOwner {
        if (measurement == bytes32(0)) revert InvalidArgument();
        allowedMeasurements[measurement] = allowed;
        emit MeasurementSet(measurement, allowed);
    }

    function attestationDigest(
        bytes32 requestHash,
        bytes32 outputHash,
        bytes32 measurement,
        bytes32 evidenceHash,
        uint64 expiresAt
    ) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ATTESTATION_TYPEHASH,
                    requestHash,
                    _get(requestHash).agentId,
                    outputHash,
                    measurement,
                    evidenceHash,
                    expiresAt
                )
            )
        );
    }

    function submitTEEAttestation(
        bytes32 requestHash,
        bytes32 outputHash,
        bytes32 measurement,
        bytes32 evidenceHash,
        uint64 expiresAt,
        bytes calldata signature
    ) external {
        Validation storage item = _get(requestHash);
        bytes32 digest = attestationDigest(requestHash, outputHash, measurement, evidenceHash, expiresAt);
        if (
            !trustedAttestors[item.validator] || !allowedMeasurements[measurement] || expiresAt < block.timestamp
                || evidenceHash == bytes32(0) || outputHash == bytes32(0) || outputHash != item.expectedOutputHash
                || consumedAttestations[digest]
                || !SignatureChecker.isValidSignatureNow(item.validator, digest, signature)
        ) revert InvalidAttestation();
        consumedAttestations[digest] = true;
        _respond(requestHash, item, 100, "", evidenceHash, "tee-attestation");
        emit TEEAttestationVerified(requestHash, item.validator, outputHash, measurement, evidenceHash);
    }

    /// @notice Zero pauses CRE delivery; it never bypasses the sender check.
    /// @dev The administrator must independently verify this is the official target-chain forwarder.
    function setCREForwarder(address forwarder) external onlyOwner {
        if (forwarder != address(0) && forwarder.code.length == 0) revert InvalidArgument();
        address previous = creForwarder;
        creForwarder = forwarder;
        emit CREForwarderSet(previous, forwarder);
    }

    /// @notice Authorize an exact workflow tuple. The workflow owner must also be the request's validator.
    /// @dev workflowName is the protocol's encoded bytes10, not a padded plaintext name.
    function setCREWorkflow(bytes32 workflowId, bytes10 workflowName, address workflowOwner, bool allowed)
        external
        onlyOwner
    {
        if (workflowId == bytes32(0) || workflowName == bytes10(0) || workflowOwner == address(0)) {
            revert InvalidArgument();
        }
        allowedCREWorkflows[creWorkflowKey(workflowId, workflowName, workflowOwner)] = allowed;
        emit CREWorkflowSet(workflowId, workflowName, workflowOwner, allowed);
    }

    function creWorkflowKey(bytes32 workflowId, bytes10 workflowName, address workflowOwner)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(workflowId, workflowName, workflowOwner));
    }

    /// @notice Receive a report after the configured KeystoneForwarder authenticates its DON signatures.
    /// @dev Supports the production 64-byte metadata layout, including the trailing bytes2 reportId.
    ///      Failed reports revert atomically and may be retried; a successful request consumes one CRE response.
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (creForwarder == address(0) || msg.sender != creForwarder) revert Unauthorized();
        if (metadata.length != 64) revert InvalidCREMetadata();
        bytes32 workflowId = bytes32(metadata[0:32]);
        bytes10 workflowName = bytes10(metadata[32:42]);
        address workflowOwner = address(bytes20(metadata[42:62]));
        bytes2 reportId = bytes2(metadata[62:64]);
        if (!allowedCREWorkflows[creWorkflowKey(workflowId, workflowName, workflowOwner)]) revert Unauthorized();
        // Nine static ABI words; reject malformed or noncanonical trailing payloads.
        if (report.length != 9 * 32) revert InvalidCREReport();
        CREReport memory result = abi.decode(report, (CREReport));
        Validation storage item = _get(result.requestHash);
        if (item.validator != workflowOwner) revert Unauthorized();
        if (
            result.chainId != block.chainid || result.receiver != address(this) || result.agentId != item.agentId
                || result.outputHash == bytes32(0) || result.outputHash != item.expectedOutputHash
                || result.responseHash == bytes32(0) || result.response > 100
                || result.observedAt < requestCreatedAt[result.requestHash] || result.observedAt > block.timestamp
                || block.timestamp - result.observedAt > CRE_MAX_REPORT_AGE || result.expiresAt < block.timestamp
                || result.expiresAt < result.observedAt || result.expiresAt - result.observedAt > CRE_MAX_REPORT_AGE
        ) revert InvalidCREReport();
        bytes32 reportHash = keccak256(report);
        if (consumedCRERequests[result.requestHash] || consumedCREReports[reportHash]) {
            revert CREReportAlreadyConsumed();
        }
        consumedCRERequests[result.requestHash] = true;
        consumedCREReports[reportHash] = true;
        _respond(result.requestHash, item, result.response, "", result.responseHash, "cre-validation");
        emit CREReportAccepted(
            result.requestHash, workflowId, workflowOwner, reportId, reportHash, result.outputHash, result.response
        );
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(ICREReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    function _get(bytes32 requestHash) internal view returns (Validation storage item) {
        item = _validations[requestHash];
        if (item.validator == address(0)) revert UnknownRequest();
    }
}
