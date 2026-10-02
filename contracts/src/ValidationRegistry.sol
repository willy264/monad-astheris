// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/// @notice ERC-8004 validation hooks with an explicitly trusted hardware-attestation oracle adapter.
/// @dev Authorized oracles validate vendor quotes OFF CHAIN and sign this chain/registry-bound EIP-712 message.
contract ValidationRegistry is Ownable2Step, EIP712 {
    struct Validation {
        address validator;
        uint256 agentId;
        uint8 response;
        bytes32 responseHash;
        string tag;
        uint256 lastUpdate;
        bytes32 expectedOutputHash;
    }
    AgentRegistry private _identity;
    mapping(bytes32 => Validation) private _validations;
    mapping(uint256 => bytes32[]) private _agentRequests;
    mapping(address => bytes32[]) private _validatorRequests;
    mapping(address => bool) public trustedAttestors;
    mapping(bytes32 => bool) public allowedMeasurements;
    mapping(bytes32 => bool) public consumedAttestations;
    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "TaskAttestation(bytes32 requestHash,uint256 agentId,bytes32 outputHash,bytes32 measurement,bytes32 evidenceHash,uint64 expiresAt)"
    );
    error AlreadyInitialized();
    error Unauthorized();
    error InvalidArgument();
    error DuplicateRequest();
    error UnknownRequest();
    error InvalidAttestation();
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

    function _get(bytes32 requestHash) internal view returns (Validation storage item) {
        item = _validations[requestHash];
        if (item.validator == address(0)) revert UnknownRequest();
    }
}
