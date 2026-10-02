// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {AetherisRouter} from "../src/AetherisRouter.sol";
import {EphemeralShard} from "../src/EphemeralShard.sol";

contract AetherisRouterTest is Test {
    AgentRegistry internal identity;
    AetherisRouter internal router;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal delegate = makeAddr("delegate");
    uint256 internal agentId;
    bytes32 internal constant INPUT = keccak256("input");
    bytes32 internal constant OUTPUT = keccak256("output");
    bytes32 internal constant PROOF = keccak256("proof");

    function setUp() public {
        identity = new AgentRegistry();
        router = new AetherisRouter(address(identity), address(this));
        vm.prank(alice);
        agentId = identity.register("ipfs://bafy-agent-card");
    }

    function _create(bytes32 taskId, uint256 nonce) internal returns (address shard) {
        vm.prank(alice);
        shard = router.createShard(agentId, taskId, nonce, alice, INPUT);
    }

    function testCreate2PredictionAndSaltEncoding() public {
        // Shared with the daemon and indexer test vectors.
        assertEq(
            router.shardSalt(1, 0x3333333333333333333333333333333333333333333333333333333333333333, 7),
            0xc0837dccb7b05109d2ced1dfbcf109adeaa1a1258e74fa924d4f5c7f13562173
        );
        bytes32 taskId = keccak256("task");
        address predicted = router.predictShardAddress(agentId, taskId, 42, alice, INPUT);
        address shard = _create(taskId, 42);
        assertEq(shard, predicted);
        assertEq(router.shardSalt(agentId, taskId, 42), keccak256(abi.encodePacked(agentId, taskId, uint256(42))));
        assertEq(EphemeralShard(shard).router(), address(router));
        assertEq(EphemeralShard(shard).agentId(), agentId);
        assertEq(EphemeralShard(shard).taskId(), taskId);
        assertEq(EphemeralShard(shard).sequenceNonce(), 42);
    }

    /// @dev EVM unit tests execute serially. Recorded write sets prove the completion paths are disjoint;
    ///      these are not a benchmark or a guarantee about Monad's scheduler.
    function testConcurrentTasksHaveDisjointWriteSets() public {
        address first = _create(keccak256("first"), 0);
        address second = _create(keccak256("second"), 0);
        assertNotEq(first, second);
        vm.record();
        vm.prank(alice);
        router.executeTask(first, OUTPUT, PROOF);
        (, bytes32[] memory routerWrites) = vm.accesses(address(router));
        (, bytes32[] memory registryWrites) = vm.accesses(address(identity));
        (, bytes32[] memory firstWrites) = vm.accesses(first);
        (, bytes32[] memory secondWrites) = vm.accesses(second);
        assertEq(routerWrites.length, 0);
        assertEq(registryWrites.length, 0);
        assertGt(firstWrites.length, 0);
        assertEq(secondWrites.length, 0);
        assertFalse(EphemeralShard(second).completed());
        vm.record();
        vm.prank(alice);
        router.executeTask(second, keccak256("second output"), bytes32(0));
        (, firstWrites) = vm.accesses(first);
        (, secondWrites) = vm.accesses(second);
        (, routerWrites) = vm.accesses(address(router));
        assertEq(firstWrites.length, 0);
        assertGt(secondWrites.length, 0);
        assertEq(routerWrites.length, 0);
        assertEq(EphemeralShard(first).outputHash(), OUTPUT);
        assertEq(EphemeralShard(second).outputHash(), keccak256("second output"));
    }

    function testManyTasksPreserveIndependentResults() public {
        address[] memory shards = new address[](24);
        for (uint256 i; i < shards.length; ++i) {
            shards[i] = _create(keccak256(abi.encode(i)), i);
        }
        // Complete in reverse order to model arbitrary asynchronous scheduling.
        for (uint256 i = shards.length; i > 0; --i) {
            vm.prank(alice);
            router.executeTask(shards[i - 1], keccak256(abi.encode(i)), PROOF);
        }
        for (uint256 i; i < shards.length; ++i) {
            assertEq(EphemeralShard(shards[i]).outputHash(), keccak256(abi.encode(i + 1)));
        }
    }

    function testFuzzDistinctNonceIsolatesAddress(uint256 nonceA, uint256 nonceB) public {
        vm.assume(nonceA != nonceB);
        bytes32 task = keccak256("same task different attempts");
        address first = _create(task, nonceA);
        address second = _create(task, nonceB);
        assertNotEq(first, second);
    }

    function testSaltCannotBeReusedWithChangedConstructorParameters() public {
        bytes32 task = keccak256("task");
        _create(task, 0);
        vm.expectRevert(
            abi.encodeWithSelector(AetherisRouter.SaltAlreadyUsed.selector, router.shardSalt(agentId, task, 0))
        );
        vm.prank(alice);
        router.createShard(agentId, task, 0, alice, keccak256("different input"));
    }

    function testCompletionReplayRejected() public {
        address shard = _create(keccak256("task"), 0);
        vm.startPrank(alice);
        router.executeTask(shard, OUTPUT, PROOF);
        vm.expectRevert(EphemeralShard.AlreadyCompleted.selector);
        router.executeTask(shard, OUTPUT, PROOF);
        vm.stopPrank();
    }

    function testUnauthorizedCannotCreateOrExecute() public {
        vm.prank(bob);
        vm.expectRevert(AetherisRouter.Unauthorized.selector);
        router.createShard(agentId, keccak256("task"), 0, bob, INPUT);
        address shard = _create(keccak256("task"), 0);
        vm.prank(bob);
        vm.expectRevert(AetherisRouter.Unauthorized.selector);
        router.executeTask(shard, OUTPUT, PROOF);
        vm.expectRevert(EphemeralShard.OnlyRouter.selector);
        EphemeralShard(shard).complete(OUTPUT, PROOF);
    }

    function testBroadNftApprovalDoesNotDelegateTaskExecution() public {
        vm.prank(alice);
        identity.setApprovalForAll(bob, true);
        assertFalse(router.isAuthorized(agentId, bob));
    }

    function testDelegatedExecutorRevocationExpiryAndOwnershipEpoch() public {
        vm.prank(alice);
        router.setDelegate(agentId, delegate, uint64(block.timestamp + 1 hours));
        assertTrue(router.isAuthorized(agentId, delegate));
        vm.prank(delegate);
        address shard = router.createShard(agentId, keccak256("delegated"), 0, delegate, INPUT);
        vm.prank(alice);
        router.setDelegate(agentId, delegate, 0);
        vm.prank(delegate);
        vm.expectRevert(AetherisRouter.Unauthorized.selector);
        router.executeTask(shard, OUTPUT, PROOF);
        vm.prank(alice);
        router.setDelegate(agentId, delegate, uint64(block.timestamp + 1 hours));
        vm.warp(block.timestamp + 1 hours);
        assertFalse(router.isAuthorized(agentId, delegate));
        vm.prank(alice);
        router.setDelegate(agentId, delegate, uint64(block.timestamp + 1 hours));
        vm.prank(alice);
        identity.transferFrom(alice, bob, agentId);
        assertFalse(router.isAuthorized(agentId, delegate));
        vm.prank(bob);
        identity.transferFrom(bob, alice, agentId);
        assertFalse(router.isAuthorized(agentId, delegate));
    }

    function testAssignedExecutorRequiredEvenForOwner() public {
        vm.prank(alice);
        router.setDelegate(agentId, delegate, uint64(block.timestamp + 1 hours));
        vm.prank(alice);
        address shard = router.createShard(agentId, keccak256("delegated"), 0, delegate, INPUT);
        vm.prank(alice);
        vm.expectRevert(AetherisRouter.Unauthorized.selector);
        router.executeTask(shard, OUTPUT, PROOF);
        vm.prank(delegate);
        router.executeTask(shard, OUTPUT, PROOF);
        assertTrue(EphemeralShard(shard).completed());
    }

    function testUnknownShardAndEmptyOutputRejected() public {
        vm.expectRevert(AetherisRouter.UnknownShard.selector);
        router.executeTask(address(123), OUTPUT, PROOF);
        address shard = _create(keccak256("task"), 0);
        vm.prank(alice);
        vm.expectRevert(EphemeralShard.EmptyOutput.selector);
        router.executeTask(shard, bytes32(0), PROOF);
    }

    function testBatchCommitAuthorizationRangeAndReplay() public {
        vm.roll(100);
        bytes32 batchId = keccak256("batch");
        bytes32 root = keccak256("root");
        vm.prank(bob);
        vm.expectRevert(AetherisRouter.Unauthorized.selector);
        router.commitMerkleBatch(batchId, root, 3, 90, 99);
        vm.expectRevert(AetherisRouter.InvalidArgument.selector);
        router.commitMerkleBatch(batchId, root, 3, 90, 100);
        router.setCommitter(bob, true);
        vm.prank(bob);
        router.commitMerkleBatch(batchId, root, 3, 90, 99);
        (bytes32 storedRoot, uint256 count, uint256 fromBlock, uint256 toBlock) = router.merkleBatches(batchId);
        assertEq(storedRoot, root);
        assertEq(count, 3);
        assertEq(fromBlock, 90);
        assertEq(toBlock, 99);
        vm.expectRevert(AetherisRouter.BatchAlreadyCommitted.selector);
        router.commitMerkleBatch(batchId, root, 3, 90, 99);
    }
}
