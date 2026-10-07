# Aetheris live verification

## Final execution attempt, 2026-10-07

**Backend checks pass; live submission remains incomplete.** This run rechecked the four deployment receipts/runtime hashes, Agent #1 registration and public services. It did not produce a paid task, delegation, batch, feedback or validation transaction. See the regenerated [live checks](submission/LIVE_CHECKS.md), [public preflight observations](submission/2026-10-07/preflight.json) and [MCP verification](submission/2026-10-07/mcp.json).

| Requested step | Observed result | Remaining requirement |
| --- | --- | --- |
| Paid MCP task | Render `/health` and `/v1/config` returned 200. Unsigned `POST /v1/tasks` returned the expected 402 challenge. The actual submission client stopped with `Task signer and executor must both be authorized for the agent`, before calling MCP, signing or posting a paid request. | Fund the dedicated task wallet with testnet MON and USDC, and grant it expiring Agent #1 authority. Preserve the existing task journal and resume it. |
| Passkey grant/revoke | Existing owner/executor is authorized; the new task wallet is not. No physical WebAuthn ceremony or delegation transaction was performed. | Device sign-in and owner wallet approval; verify grant, authorized execution, then revoke and verify denial. CLI signing does not establish passkey authentication. |
| Envio and Merkle batch | No hosted GraphQL URL is configured. Render reports batching disabled. The owner/relayer already has committer permission and RPC supports finalized blocks. | A real task receipt, running Envio service and controlled batch-worker execution. There is no task block to publish yet. |
| Reputation and validation | `completedTasks(1) = 0`, feedback clients `[]`, validation requests `[]`; CRE forwarder is unset. | Verified completed output, independently reviewed feedback and a named validator's actual response. No scores or validation results were manufactured. |

The local task client now has the verified router, agent ID `1`, Render task URL, actual MCP tool/arguments and a maximum payment of **1,000 USDC base units (0.001 testnet USDC)**. A dedicated testnet task signer/payer was generated at **`0x44Cd39dCe9b074E27eFf4D914Ff9a3e182963605`**; Render's existing owner/relayer remains the on-chain executor. The new private key is held only in ignored `scripts/.env`; the environment and attempt directories have restricted Windows access. At the preflight the new wallet held zero MON and zero USDC. The existing owner/relayer held approximately 13.93 MON and zero USDC. These are dated balance observations, not funding guarantees.

The registered MCP service is **`https://monad-astheris.vercel.app/api/mcp`** (`get_monad_block`, `{}`). Render hosts the paid task daemon at **`https://monad-astheris-daemon.onrender.com/v1/tasks`**. The independent MCP verifier passed all **11 checks** and matched block `69052210`, hash `0xea29b3d5617eac6882ea75ebc9a2cc437f13b2f30aac483992f702d8f3d519d2`, against public RPC. This free observation is separate from the blocked paid-task attempt.

The public Monad facilitator's `/supported` response advertises x402 v2 `exact` for `eip155:10143`. Its advertised support and the daemon's 402 challenge do not prove payment settlement. Token, domain and faucet instructions agree with the [official Monad x402 guide](https://docs.monad.xyz/guides/x402): USDC `0x534b2f3a21130d7a60830c2df862319e593943a3`, domain `USDC`, version `2`.

The owner is also Render's active relayer. Coordinate exclusive signer access before owner grant/revoke or validation-request transactions; the daemon's nonce lock only covers its own process. No Render management credential was available for this run. Keep its journal intact when coordinating a stop/restart, especially on the current free hosting plan where persistence remains unverified.

The batch worker scans blocks sequentially. Without an existing cursor, the deployment start at `67972561` is roughly 1.08 million blocks behind the observed finalized head. A verified bounded publication path or efficient complete catch-up is needed; changing the start block or discarding the cursor would not demonstrate historical coverage. Envio configuration already points to the deployment, but no hosted query result is claimed.

Resume the existing attempt only after funding and authorization are verified:

```sh
cd scripts
pnpm submit-task --run-dir .state/tasks/final-live-2026-10-07 --resume
```

The saved phase is `new`; no MCP invocation or paid submission occurred within that attempt. After verified completion, set `TASK_PROOF_PATH` to its `client-proof.json`. To publish the requested sample task signature, wait until its deadline has passed on both the local clock and chain, then run `pnpm submit-task --run-dir .state/tasks/final-live-2026-10-07 --resume --export-proof`. Normal proof deliberately omits active signatures. Add the real `ENVIO_GRAPHQL_URL` and any required server-side credential, verify the batch and indexed logs, then rerun `pnpm submission-proof`. Feedback additionally requires `REVIEWER_PRIVATE_KEY` and `REVIEW_ASSESSMENT_FILE` for an eligible reviewer who has assessed the actual output. Preserve private task/payment journals outside source control.

Fresh local verification on source `ddb4a29d087cab4b9678616b76eb5bd9e18d2e1a`: **38 Foundry tests** (including two 256-case fuzz tests), clean **`cargo check --locked`**, **20 Rust tests**, clean script typecheck and **17 script tests**. Ubuntu WSL also passed a frozen indexer install, code generation, full typecheck and **both Merkle tests**; details are in the [indexer audit](submission/2026-10-07/indexer-audit.json). These checks establish local behavior; the missing transaction hashes and GraphQL evidence above remain blockers.

## Readiness preflight, 2026-10-06

The public Render daemon returned HTTP 200 for `/health` and `/v1/config` after a cold start. It reports chain `10143`, the deployed router above, one relayer (the registered agent owner), and batching disabled. Its advertised x402 v2 exact policy charges **1,000 base units (0.001 USDC)** per task, using token `0x534b2f3a21130d7a60830c2df862319e593943a3`, signing-domain name `USDC`, version `2`. Read-only contract calls confirmed deployed token code, those domain fields and six decimals. Advertising this policy is not evidence that the facilitator has settled a payment.

At this check the owner/relayer held approximately **13.93 testnet MON and zero of that payment token**. A paid CLI run remains blocked by missing configuration for a separate authorized task signer, agent/executor/payment settings and a valid MCP argument file; the local CLI daemon URL also still targets localhost. Do not reuse the live relayer key in the task producer. Configure the documented public daemon endpoint and fund the intended payer before collecting real receipts.

The production browser task configuration returned **503, `enabled:false`**. No hosted Envio URL is configured. Render journal durability and recovery are not observable through its public health endpoints and remain unverified. The GitHub repository is public. This preflight made no wallet signatures, payments, registrations or chain transactions.

The redesigned dashboard adds a global Dynamic session and a single Observer MCP task action, gated by the existing paid-service configuration. UI availability does not establish a completed device passkey ceremony, delegated execution or paid-task receipt. The dated deployment and registration evidence below remains unchanged.

## Deployment evidence, 2026-10-04

Observed on **2026-10-04**, Monad Testnet, chain **10143**. Four contracts are deployed, the public MCP observer works, and its ERC-8004 identity is registered. A paid task and complete settlement/indexing demonstration remain outstanding.

## Deployed contracts

| Contract | Monad Testnet explorer |
| --- | --- |
| AgentRegistry | [0x754d7f2fd55a9841dbff248f9cb91d497116f231](https://testnet.monadscan.com/address/0x754d7f2fd55a9841dbff248f9cb91d497116f231) |
| ReputationRegistry | [0x8f1fe9beef6df891189355129bf48f073d9ab322](https://testnet.monadscan.com/address/0x8f1fe9beef6df891189355129bf48f073d9ab322) |
| ValidationRegistry | [0xcd0cf354acd2c79145caeac7d4f0639f8957308d](https://testnet.monadscan.com/address/0xcd0cf354acd2c79145caeac7d4f0639f8957308d) |
| AetherisRouter | [0xac4a33521b32122c9f014eac8800144dd9aa5ebe](https://testnet.monadscan.com/address/0xac4a33521b32122c9f014eac8800144dd9aa5ebe) |

The [deployment manifest](contracts/deployments/10143.json) records deployment transaction/block evidence, runtime/source hashes, compiler settings and verified router linkages. Earliest deployment block: **67972561**. Compiler: Solidity **0.8.24**, optimizer enabled with **200** runs, `viaIR: true`, EVM target `cancun`. Receipt/runtime verification does not imply explorer source verification or an external audit.

The six project Solidity source files in the manifest match [revision `b19b976`](https://github.com/willy264/monad-astheris/tree/b19b9767606f92ee8abf71c6fa222c0ab1958a5b/contracts/src) byte-for-byte by Keccak hash. That revision is the original deployment source reference. The integrated repository includes that contract implementation together with the task client, judge dashboard and production service fixes. These historical deployment hashes remain the reference when checking that later source changes match the live code.

## Registered agent

| Field | Verified value |
| --- | --- |
| Name | Aetheris Monad Observer |
| Agent ID | **1** |
| Owner and agent wallet | `0x5D8853E81F580A12e3Affaa9a7c76E0A65E02F57` |
| Registry | `0x754d7f2fd55a9841dbff248f9cb91d497116f231` |
| Agent Card URI | `ipfs://bafkreibo5gtw45fi27ykfsbubt7uo6vze3s4x44ytqf735ojnnhhylpuea` |
| Registration transaction | [0xc9bbd6e8a390f4fb1788f3d305f241293ec919b49d35238c7aeda5c829f3a716](https://testnet.monadscan.com/tx/0xc9bbd6e8a390f4fb1788f3d305f241293ec919b49d35238c7aeda5c829f3a716) |
| Registration block | **68105690** |
| MCP service | `https://monad-astheris.vercel.app/api/mcp` |
| Tool and arguments | `get_monad_block`, `{}` |
| Declared capability | `monad-testnet-block-observation` |
| Payment support | `x402Support: false`; this MCP read is free |

The registration command waited for 12 confirmations and checked the `Registered` event, `ownerOf(1)`, `tokenURI(1)`, `getAgentWallet(1)` and canonical receipt block hash. It minted exactly one identity using `register(string)`.

Public evidence:

- [Registration manifest](contracts/deployments/10143.agent.json) and [complete transaction receipt](contracts/deployments/10143.agent-receipt.json).
- [Exact Agent Card bytes](contracts/deployments/10143.agent-card.json), retrieved through [Pinata's public IPFS gateway](https://gateway.pinata.cloud/ipfs/bafkreibo5gtw45fi27ykfsbubt7uo6vze3s4x44ytqf735ojnnhhylpuea). The first gateway, `ipfs.io`, returned HTTP 429; the same CID was successfully verified through Pinata without uploading another card.
- Card Keccak-256: `0x2bcfadcd0f5f2243257bf7ca9b0a454cd01047669e0c3eefec2dfa95dd14f356`. The committed file preserves LF bytes to reproduce that hash.
- [Domain association](frontend/public/.well-known/agent-registration.json), served from `https://monad-astheris.vercel.app/.well-known/agent-registration.json` after deployment.

Private keys, Pinata credentials and signed raw transaction journals are excluded from these artifacts.

## Live MCP verification

The official MCP SDK negotiated protocol **2025-11-25**, discovered the single read-only tool and invoked it against the production endpoint. The committed [verification report](contracts/deployments/10143.mcp.json) passed **11 checks**, including independent Monad RPC lookups by both block number and block hash.

Actual observed output:

```json
{
  "chainId": 10143,
  "blockNumber": "68105485",
  "blockHash": "0x06192e2cef3e705d92b729eb2554facf6624d73897313fb12cddf145af3810a7",
  "timestamp": "1791113935",
  "transactionCount": 1
}
```

This is a point-in-time blockchain observation. It proves the tool returned matching block data; it does not prove AI inference, finalized output, task authorization or payment settlement. A browser GET to `/api/mcp` returns 405 because the MCP service accepts protocol requests through POST.

Reproduce with Node 22+ and pnpm 10.32.1:

```sh
cd scripts
pnpm install --frozen-lockfile
pnpm typecheck
pnpm verify-mcp https://monad-astheris.vercel.app/api/mcp
```

The verifier needs no signing key or environment file. It saves observations under ignored `scripts/.artifacts/mcp/`. See the [MCP service guide](frontend/docs/mcp-agent.md) and [registration runbook](scripts/README.md).

## Validation and remaining submission work

The MCP feature passed **15 integration/security tests**, including malformed requests, wrong-chain responses, bounded inputs and batch-amplification rejection. The **6 existing RPC pagination tests**, frontend typecheck and MCP Vercel build also passed. Registration tooling typecheck and focused public-URL validation checks passed. The directory gateway fix passed **10 tests** covering transient fallback, operator gateway isolation, bounded responses and deadlines. Solidity and Rust were not changed for this service/registration feature; historical local results are recorded separately in the README and are not live-task evidence.

Directory reliability fixes accompany registration: live RPC requests explicitly bypass Next.js's persistent data cache, and the default IPFS gateway can fall back to Pinata within one 12-second budget. Application-level agent caching still lasts up to 30 seconds. A separately configured gateway remains exclusive, and an unavailable card is reported as an error rather than substituted with invented metadata.

These acceptance checks remain before claiming a complete submission:

1. Complete an actual Dynamic passkey ceremony and verify expiring wallet-signed executor delegation. Enabling the provider and opening its modal do not establish these outcomes.
2. Configure and fund the intended payment path, invoke this MCP tool from the task producer, sign the exact EIP-712 authorization, and submit it to the daemon. Capture confirmed `ShardCreated` and `TaskExecuted` receipts plus the actual payment settlement result. No paid-task hash or signed sample is claimed in this record.
3. Configure Envio with the deployed addresses/start block and publish GraphQL output matching agent, shard and execution logs. Code generation, generated-type checking and two Merkle tests already passed on [Ubuntu CI](https://github.com/willy264/monad-astheris/actions/runs/37158285726); a local/CI generation result does not supply a running hosted endpoint.
4. Verify a committed Merkle root against canonical execution events; separately record any reputation feedback and validation/CRE/TEE results claimed in the submission. Registering this observer does not perform those workflows.
5. Verify daemon persistence/recovery on its hosting plan, complete the demo video and submission form, and confirm organizer access requirements. A public repository is accessible for reading, but no email-specific access invitation is claimed.

The deployed observer and its identity provide a real starting point for the task demonstration. They do not establish network-wide collision-free execution or a measured throughput/settlement guarantee.

## Integration verification

The live artifacts above remain the evidence of deployment, registration and the MCP observation. The combined feature/production integration must be checked on its own revision; component results from earlier commits are not substituted for that run. Record completed integration checks and their actual outcomes in [VERIFICATION.md](VERIFICATION.md). The [submission checklist](docs/submission-readiness.md) distinguishes remaining service configuration and live receipts from source integration.

`pnpm submission-proof` writes a separate generated report at `submission/LIVE_CHECKS.md`. It does not overwrite this curated deployment, registration and MCP record. Review that report and link only newly verified outcomes when expanding this submission proof.
