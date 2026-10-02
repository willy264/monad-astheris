// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {ValidationRegistry} from "../src/ValidationRegistry.sol";
import {AetherisRouter} from "../src/AetherisRouter.sol";

contract RegistriesTest is Test {
    AgentRegistry internal identity;
    ReputationRegistry internal reputation;
    ValidationRegistry internal validation;
    AetherisRouter internal router;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    uint256 internal attestorKey = 0xA77E57;
    address internal attestor;
    uint256 internal agentId;

    function setUp() public {
        identity = new AgentRegistry();
        reputation = new ReputationRegistry(address(identity), address(this));
        validation = new ValidationRegistry(address(identity), address(this));
        router = new AetherisRouter(address(identity), address(this));
        reputation.setTaskRouter(address(router));
        attestor = vm.addr(attestorKey);
        vm.prank(alice);
        agentId = identity.register("ipfs://bafy-agent-card");
    }

    function testRegistrationMetadataAndApprovals() public {
        assertEq(identity.totalSupply(), 1);
        assertEq(identity.ownerOf(agentId), alice);
        assertEq(identity.getAgentWallet(agentId), alice);
        assertEq(identity.tokenURI(agentId), "ipfs://bafy-agent-card");
        vm.prank(alice);
        identity.setMetadata(agentId, "MCP", bytes("https://agent.example/mcp"));
        assertEq(identity.getMetadata(agentId, "MCP"), bytes("https://agent.example/mcp"));
        vm.prank(alice);
        vm.expectRevert(AgentRegistry.ReservedMetadataKey.selector);
        identity.setMetadata(agentId, "agentWallet", abi.encodePacked(bob));
        vm.prank(alice);
        identity.approve(bob, agentId);
        vm.prank(bob);
        identity.setAgentURI(agentId, "ipfs://updated");
        assertEq(identity.tokenURI(agentId), "ipfs://updated");
        vm.prank(bob);
        identity.transferFrom(alice, bob, agentId);
        assertEq(identity.getAgentWallet(agentId), address(0));
        assertEq(identity.ownershipEpoch(agentId), 1);
    }

    function testMetadataRegistrationReservedKeyRevertsAtomically() public {
        AgentRegistry.MetadataEntry[] memory metadata = new AgentRegistry.MetadataEntry[](1);
        metadata[0] = AgentRegistry.MetadataEntry("agentWallet", abi.encodePacked(bob));
        vm.expectRevert(AgentRegistry.ReservedMetadataKey.selector);
        identity.register("ipfs://bad", metadata);
        assertEq(identity.totalSupply(), 1);
    }

    function testWalletProofIsNonceProtectedAndTransferClears() public {
        uint256 deadline = block.timestamp + 30 minutes;
        bytes32 digest = identity.walletDigest(agentId, attestor, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attestorKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);
        vm.prank(alice);
        identity.setAgentWallet(agentId, attestor, deadline, signature);
        assertEq(identity.getAgentWallet(agentId), attestor);
        vm.prank(alice);
        vm.expectRevert(AgentRegistry.InvalidWalletProof.selector);
        identity.setAgentWallet(agentId, attestor, deadline, signature);
        vm.prank(alice);
        identity.transferFrom(alice, bob, agentId);
        assertEq(identity.getAgentWallet(agentId), address(0));
    }

    function testSelfFeedbackAndInvalidPrecisionRejected() public {
        vm.prank(alice);
        vm.expectRevert(ReputationRegistry.SelfFeedback.selector);
        reputation.giveFeedback(agentId, 100, 0, "quality", "", "", "", bytes32(0));
        vm.prank(alice);
        identity.setApprovalForAll(bob, true);
        vm.prank(bob);
        vm.expectRevert(ReputationRegistry.SelfFeedback.selector);
        reputation.giveFeedback(agentId, 100, 0, "quality", "", "", "", bytes32(0));
        vm.expectRevert(ReputationRegistry.InvalidArgument.selector);
        reputation.giveFeedback(agentId, 100, 19, "quality", "", "", "", bytes32(0));
    }

    function testReputationMixedPrecisionRevocationAndResponses() public {
        vm.startPrank(bob);
        reputation.giveFeedback(agentId, 875, 1, "quality", "", "", "ipfs://feedback", bytes32(0));
        reputation.giveFeedback(agentId, 95, 0, "quality", "", "", "", bytes32(0));
        vm.stopPrank();
        address[] memory clients = new address[](1);
        clients[0] = bob;
        (uint64 count, int128 value, uint8 decimals) = reputation.getSummary(agentId, clients, "quality", "");
        assertEq(count, 2);
        assertEq(value, 9125);
        assertEq(decimals, 2);
        vm.prank(bob);
        reputation.revokeFeedback(agentId, 1);
        (count, value, decimals) = reputation.getSummary(agentId, clients, "quality", "");
        assertEq(count, 1);
        assertEq(value, 95);
        assertEq(decimals, 0);
        reputation.appendResponse(agentId, bob, 1, "ipfs://response", bytes32(0));
        address[] memory anyResponder = new address[](0);
        assertEq(reputation.getResponseCount(agentId, address(0), 0, anyResponder), 1);
        (address[] memory authors, uint64[] memory indexes,,,,,) =
            reputation.readAllFeedback(agentId, clients, "quality", "", false);
        assertEq(authors.length, 1);
        assertEq(indexes[0], 2);
        vm.expectRevert(ReputationRegistry.InvalidArgument.selector);
        reputation.getSummary(agentId, anyResponder, "", "");
    }

    function testFuzzReputationExtremeValuesDoNotOverflow(int128 value, uint8 decimals) public {
        decimals = uint8(bound(decimals, 0, 18));
        vm.prank(bob);
        reputation.giveFeedback(agentId, value, decimals, "quality", "", "", "", bytes32(0));
        address[] memory clients = new address[](1);
        clients[0] = bob;
        (uint64 count, int128 average, uint8 precision) = reputation.getSummary(agentId, clients, "quality", "");
        assertEq(count, 1);
        assertEq(
            int256(average) * int256(uint256(10) ** (18 - precision)),
            int256(value) * int256(uint256(10) ** (18 - decimals))
        );
    }

    function testTaskLogsRequireActualCompletedShardAndPreventDoubleCount() public {
        vm.prank(alice);
        address shard = router.createShard(agentId, keccak256("task"), 0, alice, keccak256("input"));
        vm.expectRevert(ReputationRegistry.InvalidArgument.selector);
        reputation.recordTaskExecution(shard);
        vm.prank(alice);
        router.executeTask(shard, keccak256("output"), keccak256("proof"));
        reputation.recordTaskExecution(shard);
        assertEq(reputation.completedTasks(agentId), 1);
        vm.expectRevert(ReputationRegistry.AlreadyRecorded.selector);
        reputation.recordTaskExecution(shard);
    }

    function testValidationRequestsResponsesAndFiltering() public {
        bytes32 request = keccak256("request");
        vm.prank(alice);
        validation.validationRequest(bob, agentId, "ipfs://request", request);
        vm.prank(alice);
        vm.expectRevert(ValidationRegistry.DuplicateRequest.selector);
        validation.validationRequest(bob, agentId, "ipfs://request", request);
        vm.expectRevert(ValidationRegistry.Unauthorized.selector);
        validation.validationResponse(request, 100, "", bytes32(0), "");
        vm.prank(bob);
        validation.validationResponse(request, 75, "ipfs://evidence", keccak256("response"), "soft");
        vm.prank(bob);
        validation.validationResponse(request, 100, "ipfs://evidence", keccak256("response"), "hard");
        address[] memory validators = new address[](0);
        (uint64 count, uint8 average) = validation.getSummary(agentId, validators, "hard");
        assertEq(count, 1);
        assertEq(average, 100);
        (count,) = validation.getSummary(agentId, validators, "soft");
        assertEq(count, 0);
        assertEq(validation.getAgentValidations(agentId)[0], request);
    }

    function _prepareAttestation()
        internal
        returns (
            bytes32 request,
            bytes32 output,
            bytes32 measurement,
            bytes32 evidence,
            uint64 expiresAt,
            bytes memory signature
        )
    {
        request = keccak256("request");
        output = keccak256("output");
        measurement = keccak256("approved enclave");
        evidence = keccak256("vendor quote");
        expiresAt = uint64(block.timestamp + 1 hours);
        validation.setAttestor(attestor, true);
        validation.setMeasurement(measurement, true);
        vm.prank(alice);
        validation.requestOutputValidation(attestor, agentId, "ipfs://request", request, output);
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(attestorKey, validation.attestationDigest(request, output, measurement, evidence, expiresAt));
        signature = abi.encodePacked(r, s, v);
    }

    function testTEEAttestationOutputIntegrityReplayAndDomainSeparation() public {
        (
            bytes32 request,
            bytes32 output,
            bytes32 measurement,
            bytes32 evidence,
            uint64 expiresAt,
            bytes memory signature
        ) = _prepareAttestation();
        assertTrue(validation.verifyOutputHash(request, bytes("output")));
        assertFalse(validation.verifyOutputHash(request, bytes("tampered")));
        validation.submitTEEAttestation(request, output, measurement, evidence, expiresAt, signature);
        (,, uint8 response,, string memory tag,) = validation.getValidationStatus(request);
        assertEq(response, 100);
        assertEq(tag, "tee-attestation");
        vm.expectRevert(ValidationRegistry.InvalidAttestation.selector);
        validation.submitTEEAttestation(request, output, measurement, evidence, expiresAt, signature);
        ValidationRegistry another = new ValidationRegistry(address(identity), address(this));
        another.setAttestor(attestor, true);
        another.setMeasurement(measurement, true);
        vm.prank(alice);
        another.requestOutputValidation(attestor, agentId, "ipfs://request", request, output);
        vm.expectRevert(ValidationRegistry.InvalidAttestation.selector);
        another.submitTEEAttestation(request, output, measurement, evidence, expiresAt, signature);
    }

    function testTEERejectsRevokedMeasurementAttestorAndExpiredProof() public {
        (
            bytes32 request,
            bytes32 output,
            bytes32 measurement,
            bytes32 evidence,
            uint64 expiresAt,
            bytes memory signature
        ) = _prepareAttestation();
        validation.setMeasurement(measurement, false);
        vm.expectRevert(ValidationRegistry.InvalidAttestation.selector);
        validation.submitTEEAttestation(request, output, measurement, evidence, expiresAt, signature);
        validation.setMeasurement(measurement, true);
        validation.setAttestor(attestor, false);
        vm.expectRevert(ValidationRegistry.InvalidAttestation.selector);
        validation.submitTEEAttestation(request, output, measurement, evidence, expiresAt, signature);
        validation.setAttestor(attestor, true);
        vm.warp(uint256(expiresAt) + 1);
        vm.expectRevert(ValidationRegistry.InvalidAttestation.selector);
        validation.submitTEEAttestation(request, output, measurement, evidence, expiresAt, signature);
    }
}
