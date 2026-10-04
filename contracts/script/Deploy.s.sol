// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {ValidationRegistry} from "../src/ValidationRegistry.sol";
import {AetherisRouter} from "../src/AetherisRouter.sol";

contract Deploy is Script {
    function run()
        external
        returns (
            AgentRegistry identity,
            ReputationRegistry reputation,
            ValidationRegistry validation,
            AetherisRouter router
        )
    {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);
        address admin = vm.envOr("ADMIN_ADDRESS", deployer);
        address committer = vm.envOr("COMMITTER_ADDRESS", deployer);
        vm.startBroadcast(privateKey);
        identity = new AgentRegistry();
        reputation = new ReputationRegistry(address(identity), deployer);
        validation = new ValidationRegistry(address(identity), deployer);
        router = new AetherisRouter(address(identity), address(validation), deployer);
        reputation.setTaskRouter(address(router));
        if (committer != deployer) {
            router.setCommitter(committer, true);
            router.setCommitter(deployer, false);
        }
        if (admin != deployer) {
            router.transferOwnership(admin);
            reputation.transferOwnership(admin);
            validation.transferOwnership(admin);
        }
        vm.stopBroadcast();
        // forge script also runs locally without --broadcast. Never label these predicted addresses live.
        string memory key = "deployment";
        vm.serializeUint(key, "schemaVersion", 1);
        vm.serializeString(key, "status", "candidate");
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "deployer", deployer);
        vm.serializeAddress(key, "admin", admin);
        vm.serializeAddress(key, "identityRegistry", address(identity));
        vm.serializeAddress(key, "reputationRegistry", address(reputation));
        vm.serializeAddress(key, "validationRegistry", address(validation));
        vm.serializeAddress(key, "router", address(router));
        vm.serializeAddress(key, "committer", committer);
        vm.serializeString(key, "expectedSolcVersion", "0.8.24");
        vm.serializeString(key, "expectedEvmVersion", "cancun");
        vm.serializeBool(key, "expectedOptimizer", true);
        vm.serializeUint(key, "expectedOptimizerRuns", 200);
        string memory json = vm.serializeBool(key, "expectedViaIR", true);
        vm.createDir("deployments", true);
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".candidate.json"));
    }
}
