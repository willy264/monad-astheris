# Aetheris contracts

Solidity 0.8.24, Cancun bytecode, OpenZeppelin Contracts **v5.4.0** (`c64a1edb67b6e3f4a15cca8909c9482ad33a02b0`) and forge-std **v1.9.7** (`77041d2ce690e692d6e03cc812b57d1ddaa4d505`). The ERC-8004 interfaces follow the [official draft](https://eips.ethereum.org/EIPS/eip-8004) reviewed on 2026-10-02. These are application deployments of the registries; they do not pretend to be existing canonical network deployments.

For the complete system setup and current submission gaps, see the [runbook](../docs/runbook.md) and [submission checklist](../docs/submission-readiness.md).

```powershell
# Dependencies are already present in the generated workspace. Restore a fresh checkout with:
./script/install-deps.ps1
forge test
forge fmt --check
./script/export-abi.ps1
```

If Foundry is installed locally by the workspace bootstrap, add `../.tools/foundry` to your PATH first. The installation script pins dependencies rather than tracking a branch. `abi/*.json` is exported from the compiler artifacts and shared with integrations.

On Linux/macOS use `bash script/install-deps.sh` to restore the same pinned dependencies.

## Registries

- `AgentRegistry`: ERC-721 identities, incrementing IDs from 1, URI storage, arbitrary named metadata and all three registration overloads. IPFS agent cards carry MCP/A2A services. `agentWallet` is reserved. Setting it requires an EIP-712 signature from the proposed wallet (EOA or ERC-1271); nonces, a one-hour maximum validity window, and chain/contract domains prevent replay. Transfers clear the wallet and advance an ownership epoch. `walletDigest()` exposes the exact message digest; `WALLET_TYPEHASH` exposes the message layout.
- `ReputationRegistry`: signed fixed-point feedback with 0–18 decimals, revocation, response counters, filtering and mixed-precision averages. Owner/operator self-ratings are rejected. `getSummary` requires explicit nonempty, unique client addresses. Use `tag1="quality"` for a comparable quality scale and select trusted reviewers; enumerating all clients does not protect against Sybil ratings. Bulk read methods are for bounded off-chain calls. Actual completed shards can be recorded once with `recordTaskExecution`, separately from task execution.
- `ValidationRegistry`: ERC-8004 request/response APIs and an additional allowlisted attestation adapter. A hardware-attestation service must validate manufacturer certificate chains, quote signatures, freshness and enclave measurements off chain before signing `TaskAttestation`. This contract verifies the oracle's EIP-712/1271 signature, approved measurement, expiry, expected output and replay protection. It does **not** parse or validate native Intel/AMD vendor quotes itself. `verifyOutputHash` proves byte integrity, not semantic correctness. `requestOutputValidation` binds the expected output needed by the TEE adapter. Admins initially trust no attestors or measurements.

Reputation and validation are fully initialized in their constructors; their standard `initialize` entry points reject a second initialization. Administrative changes use two-step ownership transfers.

`ValidationRegistry` also exposes a Chainlink CRE receiver with an exact workflow allowlist, trusted forwarder, request/output binding, one-hour freshness limits, and replay protection. It starts disabled. See [CRE.md](CRE.md) for the ABI, configuration, provider prerequisites, and the distinction between local receiver tests and live CRE delivery. No Monad CRE forwarder or deployed workflow is assumed.

## Isolated execution

The router constructor is `AetherisRouter(identityRegistry, validationRegistry, admin)`. Both registry addresses are immutable, and construction rejects a validation registry linked to a different identity registry. `validationRegistry()` exposes the binding. Task execution and batch commitments remain separate from explicit validation requests and responses.

`createShard(agentId, taskId, sequenceNonce, executor, inputHash)` deploys `EphemeralShard` using:

```text
salt = keccak256(agentId:32 || taskId:32 || sequenceNonce:32)
address = last20(keccak256(0xff || router:20 || salt || keccak256(initCode)))
```

Constructor parameters affect `initCode`, so consumers should use `predictShardAddress`. The salt can be consumed only once even with different constructor arguments. A task attempt is identified by `(agentId, taskId, sequenceNonce)`; an intentional retry uses a new sequence nonce. Each shard accepts exactly one nonzero result hash.

Only the owner or a scoped, unexpired router delegate can create tasks. The executor must be authorized at creation and completion, and only the assigned executor can finish the shard. ERC-721 approvals do not authorize task routing. A delegation is bound to the current owner **and ownership epoch**, so transfer-away-and-back cannot resurrect it. `setDelegate(..., 0)` revokes access.

`executeTask` writes only the selected shard. Tests inspect EVM write sets and verify no writes to other shards, the router or the registry. Foundry executes test transactions serially; this is not a Monad scheduler benchmark. CREATE2 creation, transaction sender nonces, fees, balance changes and unrelated protocol accesses can still contend. There is no claim of guaranteed single-pass execution or measured collision savings.

Shards preserve their results permanently. “Ephemeral” describes task scope; no deprecated SELFDESTRUCT cleanup is used.

## Batch commitments

Only an approved committer can publish immutable `batchId` commitments. The range must end before the current block. Committers attest to log completeness/canonicality; the contract does not reconstruct past logs. Duplicate batch IDs fail. Leaf hashing used by the daemon and indexer is:

```text
inner = keccak256(chainId:32 || router:20 || shard:20 || agentId:32 || taskId:32 || inputHash:32 || outputHash:32 || proofHash:32)
leaf  = keccak256(inner:32)
parent = keccak256(min(a,b):32 || max(a,b):32)
```

Leaves follow canonical `(blockNumber, transactionIndex, logIndex)` order. Duplicate the last node on odd levels. An empty batch is not committable.

## Deployment

Copy `.env.example` to `.env` and fill the RPC URL and deployment key. Empty optional `ADMIN_ADDRESS` / `COMMITTER_ADDRESS` entries should be removed if using the deployer's address. Run a simulation first:

```powershell
forge script script/Deploy.s.sol:Deploy --rpc-url monad_testnet
# Broadcast only when the displayed deployment is intended:
forge script script/Deploy.s.sol:Deploy --rpc-url monad_testnet --broadcast
```

The script writes `deployments/<chainId>.candidate.json` during both simulation and broadcast. A candidate contains predicted addresses and expected compiler settings; it is **not proof of deployment**. The [deployment finalizer](../scripts/finalize-deployment.ts) checks actual broadcast receipts, deployed bytecode, constructor inputs, registry linkages and compiler artifacts before writing the verified deployment manifest. Run it from the repository root with `pnpm --dir scripts finalize-deployment`; the root deployment helper invokes it after a successful broadcast.

Use only finalized addresses in daemon, indexer and frontend settings, and set the indexer start block to the deployment block. If `ADMIN_ADDRESS` differs from the signer, that administrator must call `acceptOwnership()` on the router, reputation registry and validation registry. A distinct `COMMITTER_ADDRESS` receives batch permissions and the deployer's batch permission is revoked. No deployment, attestor trust, or CRE forwarder is configured automatically by tests.

This code has executable authorization, isolation and replay tests; it has not received an independent security audit.
