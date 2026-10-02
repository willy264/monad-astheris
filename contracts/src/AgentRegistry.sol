// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @notice ERC-8004 identity registry. Registration files may contain IPFS agent cards and MCP services.
contract AgentRegistry is ERC721URIStorage, EIP712 {
    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }
    uint256 public totalSupply;
    mapping(uint256 => mapping(string => bytes)) private _metadata;
    mapping(uint256 => uint256) public ownershipEpoch;
    mapping(uint256 => uint256) public walletNonce;
    bytes32 public constant WALLET_TYPEHASH =
        keccak256("AgentWallet(uint256 agentId,address owner,address newWallet,uint256 nonce,uint256 deadline)");
    bytes32 private constant WALLET_KEY = keccak256("agentWallet");

    error ReservedMetadataKey();
    error InvalidWalletProof();
    error InvalidDeadline();
    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event MetadataSet(
        uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue
    );

    constructor() ERC721("Aetheris Agents", "AETH") EIP712("Aetheris Agent Registry", "1") {}

    function register() external returns (uint256) {
        return _register("");
    }

    function register(string calldata agentURI) external returns (uint256) {
        return _register(agentURI);
    }

    function register(string calldata agentURI, MetadataEntry[] calldata metadata) external returns (uint256 agentId) {
        agentId = _register(agentURI);
        for (uint256 i; i < metadata.length; ++i) {
            _setUserMetadata(agentId, metadata[i].metadataKey, metadata[i].metadataValue);
        }
    }

    function _register(string memory agentURI) internal returns (uint256 agentId) {
        agentId = ++totalSupply;
        // ERC-8004 registration is explicit consent to receive the identity; no external receiver callback.
        _mint(msg.sender, agentId);
        _setTokenURI(agentId, agentURI);
        _setMetadata(agentId, "agentWallet", abi.encodePacked(msg.sender));
        emit Registered(agentId, agentURI, msg.sender);
    }

    function setAgentURI(uint256 agentId, string calldata newURI) external {
        _checkAuthorized(ownerOf(agentId), msg.sender, agentId);
        _setTokenURI(agentId, newURI);
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    function getMetadata(uint256 agentId, string calldata metadataKey) external view returns (bytes memory) {
        _requireOwned(agentId);
        return _metadata[agentId][metadataKey];
    }

    function setMetadata(uint256 agentId, string calldata metadataKey, bytes calldata metadataValue) external {
        _checkAuthorized(ownerOf(agentId), msg.sender, agentId);
        _setUserMetadata(agentId, metadataKey, metadataValue);
    }

    function _setUserMetadata(uint256 agentId, string memory key, bytes memory value) internal {
        if (keccak256(bytes(key)) == WALLET_KEY) revert ReservedMetadataKey();
        _setMetadata(agentId, key, value);
    }

    function _setMetadata(uint256 agentId, string memory key, bytes memory value) internal {
        _metadata[agentId][key] = value;
        emit MetadataSet(agentId, key, key, value);
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        _requireOwned(agentId);
        bytes memory value = _metadata[agentId]["agentWallet"];
        return value.length == 20 ? address(bytes20(value)) : address(0);
    }

    function walletDigest(uint256 agentId, address newWallet, uint256 deadline) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(WALLET_TYPEHASH, agentId, ownerOf(agentId), newWallet, walletNonce[agentId], deadline))
        );
    }

    function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes calldata signature) external {
        address agentOwner = ownerOf(agentId);
        if (msg.sender != agentOwner) revert ERC721InsufficientApproval(msg.sender, agentId);
        if (deadline < block.timestamp || deadline > block.timestamp + 1 hours) revert InvalidDeadline();
        if (
            newWallet == address(0)
                || !SignatureChecker.isValidSignatureNow(
                    newWallet, walletDigest(agentId, newWallet, deadline), signature
                )
        ) {
            revert InvalidWalletProof();
        }
        ++walletNonce[agentId];
        _setMetadata(agentId, "agentWallet", abi.encodePacked(newWallet));
    }

    function unsetAgentWallet(uint256 agentId) external {
        if (msg.sender != ownerOf(agentId)) revert ERC721InsufficientApproval(msg.sender, agentId);
        ++walletNonce[agentId];
        _setMetadata(agentId, "agentWallet", abi.encodePacked(address(0)));
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        if (from != address(0)) {
            ++ownershipEpoch[tokenId];
            ++walletNonce[tokenId];
            _setMetadata(tokenId, "agentWallet", abi.encodePacked(address(0)));
        }
    }
}
