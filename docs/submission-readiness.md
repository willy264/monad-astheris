# What remains before submission?

**As of 2026-10-04, all four core contracts are deployed and receipt-verified on Monad Testnet.** The [live deployment manifest](../contracts/deployments/10143.json) records their addresses, transactions and configuration. **Agent #1, Aetheris Monad Observer, is registered with a verified IPFS card and working public MCP tool.** The [registration manifest](../contracts/deployments/10143.agent.json) and [MCP report](../contracts/deployments/10143.mcp.json) preserve those results. A real paid task, settlement, hosted GraphQL indexing and matching task/batch dashboard evidence remain outstanding; the full demonstration is not complete.

This is an engineering checklist for the intended Monad Metropolis Track 04 submission. The organizer's deadline, rubric, eligibility and required assets have not been verified. Use the [live workflow](live-submission.md) for commands, the [runbook](runbook.md) for configuration and [SUBMISSION_PROOF.md](../SUBMISSION_PROOF.md) for the evidence currently available.

## What is already implemented and checked?

The integrated baseline `80570af` passed component CI and production smoke checks. [VERIFICATION.md](../VERIFICATION.md) records their scope and subsequent UI work. Local checks do not replace real task, payment and indexer receipts.

| Area | Implemented behavior | Observed verification | Remaining live work |
| --- | --- | --- | --- |
| Contracts | Agent identities, delegation, isolated task results, reputation, validation and batch commitments | 38 Foundry tests, including two 256-case fuzz tests; four live deployments with verified receipts, code, links and roles | Agent #1 is registered; exercise task, reputation and validation operations as claimed. |
| Daemon | Signed paid requests, relayer routing, durable job journal and finalized-block batching | Rust compilation, strict Clippy and 20 tests at the integrated baseline | Exercise the funded provider, relayers, payment and recovery path. |
| Client and deployment tools | Actual MCP invocation, signed x402 tasks, receipt checks, registration and proof export | 17 scripts tests and typechecking | Reuse the verified observer and registration; configure the paid-task policy and collect task/payment receipts. |
| Frontend | Shared global wallet session, express-lane overview/comparison, featured Observer #1, single MCP-task action and separate five-task checksum demo | Baseline: 52 tests, typecheck/build and 101 production smoke checks. Subsequent UI checks are dated in the verification record. | Verify an actual passkey/delegation ceremony and paid task; enable the paid service only after its prerequisites pass; connect hosted Envio. |
| Indexer | Agent/shard/execution entities, deployment-scoped GraphQL and independently calculated batch roots | Linux generation/typechecking and 2 Merkle tests | Run indexing against the deployed contracts and expose a reachable endpoint. |
| Shared interfaces | Contract ABI exports and consumer declarations | 61 declarations matched | Verify that runtime configuration points to the deployed version. |

These results are recorded in [VERIFICATION.md](../VERIFICATION.md). The [deployment manifest](../contracts/deployments/10143.json) has status `live-verified`, earliest deployment block `67972561`, and accepted administrator ownership with no pending handoff. Contract receipt verification and observer registration are complete. They do not establish payment-provider compatibility, live indexing, a passkey ceremony, CRE delivery or production capacity. Actual address and deployment-transaction links are in the [README](../README.md#deployment-manifest-and-explorer).

## Finish the live path in this order

| Step | Action | Evidence needed to mark it complete |
| --- | --- | --- |
| 1. Configure services and funding | Choose a real x402 v2 exact facilitator supporting EIP-3009 on chain 10143 and a compatible token. The observer MCP service and its pinned card already exist. Fund transaction-sending accounts with testnet MON for gas and the task payer with the payment token. | Supported network/asset response, reachable MCP tool, working IPFS access and the two kinds of balance. A configured URL alone is insufficient. |
| 2. Contracts deployed — complete | Reuse the existing four-contract deployment and its verified manifest; do not broadcast another deployment to continue setup. | [Manifest](../contracts/deployments/10143.json) verified October 4: successful canonical receipts, creation code, five registry/router links and configured roles. Administrator ownership is accepted. Explorer links are in the [README](../README.md#deployment-manifest-and-explorer). |
| 3. Observer registration ? complete | Reuse agent #1 for its advertised Monad block observation capability. Do not mint another identity merely to resume setup. | [Registration manifest](../contracts/deployments/10143.agent.json), [receipt](../contracts/deployments/10143.agent-receipt.json), exact IPFS card bytes and matching owner/URI/wallet reads; the public MCP tool passed 11 live checks. |
| 4. Authorize and start the daemon | Grant the executor expiring authority and authorize the task signer separately when it is not the agent owner. Configure matching addresses and preserve the durable database. Keep relayer keys exclusive to this daemon. | Healthy `/health` and `/v1/config`, valid owner/delegate checks for both signer and executor, and a supported payment configuration. |
| 5. Execute a real paid MCP task | Run `scripts/submit_task.ts` through the documented package command. Retain its input/output artifacts and run directory. | Actual MCP result, task/payment authorizations, successful `ShardCreated` and `TaskExecuted` receipts, exact CREATE2 address and payment settlement checks. |
| 6. Index and publish a batch | Start Envio from the earliest deployment block. Enable the daemon batch worker and grant its committer role. | GraphQL returns matching agent, shard and execution records; a nonempty finalized block produces a commitment whose full root is independently reconstructed and matches on chain. |
| 7. Connect and exercise the dashboard | Configure the same deployment, Envio and Dynamic environment. Enable the browser demo only with a working payment policy. | Real directory/shard/batch data; a passkey sign-in and delegation/revocation ceremony if claimed; five confirmed browser checksum tasks if presenting the live browser demo. |
| 8. Export and rehearse | Run the proof collector to create `submission/LIVE_CHECKS.md`, review the results, update the curated root proof and rehearse from a fixed commit. | `SUBMISSION_PROOF.md` preserves the actual explorer links, registration/MCP evidence and any newly verified GraphQL output. No fabricated or missing evidence for the demonstrated scope. Capture the required video/screenshots after checking event rules. |

The five-task browser demo computes deterministic checksums. The directory's single-task action invokes the actual Observer MCP tool on its registered origin; the CLI also supports MCP tasks. Both paid flows require real task and payment signatures. The deployed observer reads blockchain metadata; calling it does not demonstrate AI inference.

The October 6 read-only preflight found Render healthy after a cold start, with batching disabled. The owner/live relayer has testnet MON but no configured USDC balance. The CLI needs a distinct authorized signer, a public daemon URL, agent/executor/payment settings and a valid MCP arguments file. Production browser tasks remain disabled (`/api/demo/config` returns 503), and no hosted Envio URL is configured. See the dated [submission proof](../SUBMISSION_PROOF.md#readiness-preflight-2026-10-06) for scope; an advertised payment policy does not prove settlement or durable recovery.

Keep private keys, active signatures, payment credentials, `.env` files and journals out of the submission. The proof tools can export an expired task signature after checking both local and chain time. They do not export reusable payment credentials.

## Close the remaining feature claims

| Claim included in the pitch | What must still be demonstrated |
| --- | --- |
| Passkeys and delegation | Real Dynamic enrollment/sign-in on the configured origin, a funded grant, an authorized execution and revocation/expiry rejection. Mera is a separate optional PRF-based account flow and needs its own successful ceremony if claimed. |
| Reputation | The MCP client's completion-record transaction and an eligible independent client's explicitly reviewed assessment. Execution success does not automatically produce a positive rating. |
| Validation | A real output-bound validation request and authenticated response. Matching an output hash establishes byte integrity, not correctness of a research conclusion. |
| Chainlink CRE | Confirm supported network and official forwarder, deploy/configure the actual workflow and retain a delivery receipt. The receiver exists; keep it disabled until those trust settings are established. |
| Graph Tally | Implement and operate the custom adapter against real escrow/aggregation infrastructure, then demonstrate verification and durable settlement/acceptance. This external adapter is not included, and the supplied task clients use x402 EIP-3009. |
| TEE hardware verification | Integrate a verifier for genuine manufacturer evidence, freshness and measurement policy. The existing trusted-verifier signature adapter alone does not prove hardware attestation. |
| Autonomous spending budget | Implement and test cumulative budget enforcement if promised. Current delegation is time-limited and clients pin a per-task price ceiling; those are not a total spending cap. |
| Daily aggregated settlement | Implement that schedule if promised. Current Merkle batching is per nonempty finalized block, and payment settlement follows the provider's flow. A Merkle commitment is not a token payout. |
| Throughput or collisions avoided | Measure a defined workload against a defensible baseline. The visualizer's timings/efficiency are illustrative, and no observed Monad scheduler collision counter is available. |

An agent-registration form and arbitrary MCP-task form are possible product improvements; registration and real MCP tasks already have documented CLI workflows. They need not block a CLI-based demonstration unless the intended submission promises those browser actions.

## Package and access checklist

- [x] Synchronize the prior feature branches at verified baseline `80570af` (PR #33). Preserve the separate feature history. Use the subsequently verified UI revision, rather than this historical baseline, when recording the final demo.
- [x] Confirm public repository visibility. `metropolis@hackathon.monad.xyz` can read it without an invitation. If the organizer requires collaborator access, their GitHub username and required role still need confirmation; no invitation has been sent.
- [x] Produce the [receipt-verified deployment manifest](../contracts/deployments/10143.json) for all four core contracts.
- [x] Publish the [agent registration export](../contracts/deployments/10143.agent.json), actual receipt, exact card bytes and verified live MCP output.
- [ ] Complete the paid-task and indexing proof with matching chain/contract/agent/task identifiers; registration alone does not complete those workflows.
- [ ] Provide a reachable dashboard and Envio endpoint, plus clear daemon/client startup instructions or a stated availability window.
- [ ] Include the [README](../README.md), [architecture](architecture.md), [protocol/API examples](protocol.md), [frontend judge guide](../frontend/docs/README.md) and verification record for the selected commit.
- [ ] Choose a repository-level license. There is currently no root `LICENSE`; package metadata alone does not license the whole project.
- [ ] Confirm the actual deadline/timezone, submission URL, track and sponsor criteria, team fields, recording duration and required assets. Prize eligibility has not been established by installing SDKs.

## Submission readiness versus production readiness

A coherent submission should demonstrate a registered agent, real service output, an authorized paid task, isolated recorded results and matching transaction/indexer/dashboard evidence. Include the additional live proofs above for every integration advertised. The current live milestone includes four deployed contracts and a registered working observer. The paid agent workflow still needs its own task/payment receipts and running indexer services.

Production operation requires separate security review, wallet recovery checks, capacity measurements, service monitoring and tested journal backup/reconciliation. The daemon deliberately quarantines uncertain outcomes; preserve its database and investigate them rather than deleting state or resubmitting a paid request. Passing tests and a successful hackathon demo do not establish production readiness.
