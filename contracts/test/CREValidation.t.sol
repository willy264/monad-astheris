// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {ValidationRegistry} from "../src/ValidationRegistry.sol";
import {ICREReceiver} from "../src/interfaces/ICREReceiver.sol";

/// @dev A test-only transport harness. This does not validate DON signatures or model a live CRE deployment.
contract CREForwarderHarness {
    function deliver(address receiver, bytes calldata metadata, bytes calldata report) external {
        ICREReceiver(receiver).onReport(metadata, report);
    }
}

contract CREValidationTest is Test {
    AgentRegistry internal identity;
    ValidationRegistry internal validation;
    CREForwarderHarness internal forwarder;
    address internal alice = makeAddr("alice");
    address internal workflowOwner = makeAddr("workflowOwner");
    address internal stranger = makeAddr("stranger");
    uint256 internal agentId;
    bytes32 internal workflowId = keccak256("registered workflow definition");
    bytes10 internal workflowName = bytes10("0123456789");
    bytes32 internal requestHash = keccak256("globally unique validation request");
    bytes32 internal outputHash = keccak256("task output");

    function setUp() public {
        vm.warp(10_000);
        identity = new AgentRegistry();
        validation = new ValidationRegistry(address(identity), address(this));
        forwarder = new CREForwarderHarness();
        validation.setCREForwarder(address(forwarder));
        validation.setCREWorkflow(workflowId, workflowName, workflowOwner, true);
        vm.prank(alice);
        agentId = identity.register("ipfs://agent-card");
        vm.prank(alice);
        validation.requestOutputValidation(workflowOwner, agentId, "ipfs://request", requestHash, outputHash);
    }

    function _metadata() internal view returns (bytes memory) {
        return abi.encodePacked(workflowId, workflowName, workflowOwner, bytes2(0x0001));
    }

    function _report() internal view returns (ValidationRegistry.CREReport memory) {
        return ValidationRegistry.CREReport({
            chainId: block.chainid,
            receiver: address(validation),
            requestHash: requestHash,
            agentId: agentId,
            outputHash: outputHash,
            responseHash: keccak256("workflow evidence"),
            observedAt: uint64(block.timestamp),
            expiresAt: uint64(block.timestamp + 15 minutes),
            response: 93
        });
    }

    function _deliver(ValidationRegistry.CREReport memory report) internal {
        forwarder.deliver(address(validation), _metadata(), abi.encode(report));
    }

    function _reject(ValidationRegistry.CREReport memory report) internal {
        vm.expectRevert(ValidationRegistry.InvalidCREReport.selector);
        _deliver(report);
        assertFalse(validation.consumedCRERequests(requestHash));
    }

    function testCREAcceptsProductionMetadataAndStoresEvidence() public {
        ValidationRegistry.CREReport memory report = _report();
        assertEq(_metadata().length, 64);
        assertEq(abi.encode(report).length, 288);
        assertTrue(validation.supportsInterface(type(ICREReceiver).interfaceId));
        assertTrue(validation.supportsInterface(type(IERC165).interfaceId));
        assertFalse(validation.supportsInterface(0xffffffff));
        _deliver(report);
        (
            address validator,
            uint256 returnedAgentId,
            uint8 response,
            bytes32 evidence,
            string memory tag,
            uint256 updated
        ) = validation.getValidationStatus(requestHash);
        assertEq(validator, workflowOwner);
        assertEq(returnedAgentId, agentId);
        assertEq(response, 93);
        assertEq(evidence, report.responseHash);
        assertEq(tag, "cre-validation");
        assertEq(updated, block.timestamp);
        assertTrue(validation.consumedCRERequests(requestHash));
        assertTrue(validation.consumedCREReports(keccak256(abi.encode(report))));
    }

    function testCREDirectCallerCannotForgeTrustedMetadata() public {
        bytes memory metadata = _metadata();
        bytes memory report = abi.encode(_report());
        vm.prank(workflowOwner);
        vm.expectRevert(ValidationRegistry.Unauthorized.selector);
        validation.onReport(metadata, report);
        CREForwarderHarness anotherForwarder = new CREForwarderHarness();
        vm.expectRevert(ValidationRegistry.Unauthorized.selector);
        anotherForwarder.deliver(address(validation), metadata, report);
    }

    function testCREPausedAndRotatedForwardersCannotDeliver() public {
        ValidationRegistry.CREReport memory report = _report();
        validation.setCREForwarder(address(0));
        vm.expectRevert(ValidationRegistry.Unauthorized.selector);
        _deliver(report);
        CREForwarderHarness anotherForwarder = new CREForwarderHarness();
        validation.setCREForwarder(address(anotherForwarder));
        vm.expectRevert(ValidationRegistry.Unauthorized.selector);
        _deliver(report);
        anotherForwarder.deliver(address(validation), _metadata(), abi.encode(report));
        assertTrue(validation.consumedCRERequests(requestHash));
    }

    function testCREConfigurationRequiresAdministratorAndDeployedForwarder() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        validation.setCREForwarder(address(forwarder));
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        validation.setCREWorkflow(workflowId, workflowName, workflowOwner, true);
        vm.expectRevert(ValidationRegistry.InvalidArgument.selector);
        validation.setCREForwarder(stranger);
        vm.expectRevert(ValidationRegistry.InvalidArgument.selector);
        validation.setCREWorkflow(bytes32(0), workflowName, workflowOwner, true);
        vm.expectRevert(ValidationRegistry.InvalidArgument.selector);
        validation.setCREWorkflow(workflowId, bytes10(0), workflowOwner, true);
        vm.expectRevert(ValidationRegistry.InvalidArgument.selector);
        validation.setCREWorkflow(workflowId, workflowName, address(0), true);
    }

    function testCRERejectsWrongWorkflowIdNameAndOwner() public {
        bytes memory report = abi.encode(_report());
        bytes memory wrongId = abi.encodePacked(keccak256("another workflow"), workflowName, workflowOwner, bytes2(0));
        vm.expectRevert(ValidationRegistry.Unauthorized.selector);
        forwarder.deliver(address(validation), wrongId, report);
        bytes memory wrongName = abi.encodePacked(workflowId, bytes10("9876543210"), workflowOwner, bytes2(0));
        vm.expectRevert(ValidationRegistry.Unauthorized.selector);
        forwarder.deliver(address(validation), wrongName, report);
        bytes memory wrongOwner = abi.encodePacked(workflowId, workflowName, stranger, bytes2(0));
        vm.expectRevert(ValidationRegistry.Unauthorized.selector);
        forwarder.deliver(address(validation), wrongOwner, report);
        validation.setCREWorkflow(workflowId, workflowName, workflowOwner, false);
        vm.expectRevert(ValidationRegistry.Unauthorized.selector);
        _deliver(_report());
    }

    function testCREWhitelistedWorkflowMustMatchExactRequestValidator() public {
        validation.setCREWorkflow(workflowId, workflowName, stranger, true);
        bytes memory wrongValidator = abi.encodePacked(workflowId, workflowName, stranger, bytes2(0));
        vm.expectRevert(ValidationRegistry.Unauthorized.selector);
        forwarder.deliver(address(validation), wrongValidator, abi.encode(_report()));
    }

    function testCRERejectsMalformedMetadataAndPayload() public {
        bytes memory report = abi.encode(_report());
        bytes memory metadata62 = abi.encodePacked(workflowId, workflowName, workflowOwner);
        vm.expectRevert(ValidationRegistry.InvalidCREMetadata.selector);
        forwarder.deliver(address(validation), metadata62, report);
        bytes memory metadata65 = bytes.concat(_metadata(), hex"00");
        vm.expectRevert(ValidationRegistry.InvalidCREMetadata.selector);
        forwarder.deliver(address(validation), metadata65, report);
        vm.expectRevert(ValidationRegistry.InvalidCREMetadata.selector);
        forwarder.deliver(address(validation), "", report);
        vm.expectRevert(ValidationRegistry.InvalidCREReport.selector);
        forwarder.deliver(address(validation), _metadata(), new bytes(287));
        vm.expectRevert(ValidationRegistry.InvalidCREReport.selector);
        forwarder.deliver(address(validation), _metadata(), bytes.concat(report, hex"00"));
    }

    function testCREBindsChainReceiverAgentAndOutput() public {
        ValidationRegistry.CREReport memory report = _report();
        report.chainId = block.chainid + 1;
        _reject(report);
        report = _report();
        report.receiver = stranger;
        _reject(report);
        report = _report();
        report.agentId = agentId + 1;
        _reject(report);
        report = _report();
        report.outputHash = keccak256("different output");
        _reject(report);
        report.outputHash = bytes32(0);
        _reject(report);
        _deliver(_report());
    }

    function testCRERequiresKnownOutputBoundRequest() public {
        ValidationRegistry.CREReport memory report = _report();
        report.requestHash = keccak256("nonexistent request");
        vm.expectRevert(ValidationRegistry.UnknownRequest.selector);
        _deliver(report);
        vm.prank(alice);
        validation.validationRequest(workflowOwner, agentId, "ipfs://unbound", report.requestHash);
        _reject(report);
    }

    function testCRERequiresEvidenceAndBoundedResponse() public {
        ValidationRegistry.CREReport memory report = _report();
        report.responseHash = bytes32(0);
        _reject(report);
        report = _report();
        report.response = 101;
        _reject(report);
        report.response = 0;
        _deliver(report);
        (,, uint8 response,,,) = validation.getValidationStatus(requestHash);
        assertEq(response, 0);
        assertTrue(validation.consumedCRERequests(requestHash));
    }

    function testCRERejectsExpiredStaleAndExcessiveLifetime() public {
        ValidationRegistry.CREReport memory report = _report();
        report.expiresAt = uint64(block.timestamp + 1 hours + 1);
        _reject(report);
        report = _report();
        vm.warp(uint256(report.expiresAt) + 1);
        _reject(report);
        vm.warp(uint256(report.observedAt) + 1 hours + 1);
        _reject(report);
        _deliver(_report());
    }

    function testCRERejectsFutureAndPreRequestObservations() public {
        ValidationRegistry.CREReport memory report = _report();
        report.observedAt = uint64(block.timestamp + 1);
        _reject(report);
        report = _report();
        report.observedAt = uint64(block.timestamp - 1);
        _reject(report);
        report = _report();
        report.expiresAt = uint64(block.timestamp - 1);
        _reject(report);
    }

    function testCREConsumesRequestAcrossReportIdsAndChangedPayloads() public {
        ValidationRegistry.CREReport memory report = _report();
        _deliver(report);
        vm.expectRevert(ValidationRegistry.CREReportAlreadyConsumed.selector);
        _deliver(report);
        bytes memory newReportId = abi.encodePacked(workflowId, workflowName, workflowOwner, bytes2(0x0002));
        vm.expectRevert(ValidationRegistry.CREReportAlreadyConsumed.selector);
        forwarder.deliver(address(validation), newReportId, abi.encode(report));
        report.responseHash = keccak256("changed evidence");
        report.response = 100;
        vm.expectRevert(ValidationRegistry.CREReportAlreadyConsumed.selector);
        _deliver(report);
        (,, uint8 response, bytes32 evidence,,) = validation.getValidationStatus(requestHash);
        assertEq(response, 93);
        assertEq(evidence, keccak256("workflow evidence"));
        assertFalse(validation.consumedCREReports(keccak256(abi.encode(report))));
    }

    function testCREIndependentRequestsAcceptIndependentReports() public {
        _deliver(_report());
        ValidationRegistry.CREReport memory nextReport = _report();
        nextReport.requestHash = keccak256("next globally unique request");
        nextReport.outputHash = keccak256("next output");
        vm.prank(alice);
        validation.requestOutputValidation(
            workflowOwner, agentId, "ipfs://next-request", nextReport.requestHash, nextReport.outputHash
        );
        _deliver(nextReport);
        assertTrue(validation.consumedCRERequests(requestHash));
        assertTrue(validation.consumedCRERequests(nextReport.requestHash));
    }

    function testCRECrossRegistryReplayIsRejected() public {
        ValidationRegistry.CREReport memory report = _report();
        _deliver(report);
        ValidationRegistry another = new ValidationRegistry(address(identity), address(this));
        another.setCREForwarder(address(forwarder));
        another.setCREWorkflow(workflowId, workflowName, workflowOwner, true);
        vm.prank(alice);
        another.requestOutputValidation(workflowOwner, agentId, "ipfs://request", requestHash, outputHash);
        vm.expectRevert(ValidationRegistry.InvalidCREReport.selector);
        forwarder.deliver(address(another), _metadata(), abi.encode(report));
        assertFalse(another.consumedCRERequests(requestHash));
        report.receiver = address(another);
        forwarder.deliver(address(another), _metadata(), abi.encode(report));
        assertTrue(another.consumedCRERequests(requestHash));
    }
}
