# What remains before submission?

**As of 2026-10-03, Aetheris is locally tested but still needs a live, paid demonstration on Monad Testnet.** The deployment tools, MCP client, browser demo and integrations exist. Actual service configuration, deployed contracts and matching evidence are the main remaining work.

This is an engineering checklist for the intended Monad Metropolis Track 04 submission. The organizer's deadline, rubric, eligibility and required assets have not been verified. Use the [live workflow](live-submission.md) for commands, the [runbook](runbook.md) for configuration and [SUBMISSION_PROOF.md](../SUBMISSION_PROOF.md) for the evidence currently available.

## What is already implemented and checked?

| Area | Implemented behavior | Observed verification | Remaining live work |
| --- | --- | --- | --- |
| Contracts | Agent identities, delegation, isolated task results, reputation, validation and batch commitments | 38 Foundry tests, including two 256-case fuzz tests | Deploy and verify all four contracts and their configuration. |
| Daemon | Signed paid requests, relayer routing, durable job journal and finalized-block batching | Rust compilation and 13 tests passed October 3 | Exercise the funded provider, relayers, payment and recovery path. |
| Client and deployment tools | Actual MCP invocation, signed x402 tasks, receipt checks, registration and proof export | 17 scripts tests and typechecking | Supply real endpoints, keys and payment policy; collect receipts. |
| Frontend | Overview, directory, comparison visualizer, labeled preview and five-task paid browser flow | 18 tests, typecheck/build; 40 judge-flow checks and 32 branding/browser checks | Configure live contracts, wallet provider and payment service. |
| Indexer | Agent/shard/execution entities, deployment-scoped GraphQL and independently calculated batch roots | Linux generation/typechecking and 2 Merkle tests | Run indexing against the deployed contracts and expose a reachable endpoint. |
| Shared interfaces | Contract ABI exports and consumer declarations | 61 declarations matched | Verify that runtime configuration points to the deployed version. |

These results are recorded in [VERIFICATION.md](../VERIFICATION.md). They establish the stated local behavior; live provider compatibility, a real passkey ceremony, CRE delivery and production capacity remain unverified. No live `contracts/deployments/10143.json` exists yet.

## Finish the live path in this order

| Step | Action | Evidence needed to mark it complete |
| --- | --- | --- |
| 1. Configure services and funding | Choose a real x402 v2 exact facilitator supporting EIP-3009 on chain 10143, a compatible token, an MCP service and IPFS pinning. Fund transaction-sending accounts with testnet MON for gas and the task payer with the payment token. | Supported network/asset response, reachable MCP tool, working IPFS access and the two kinds of balance. A configured URL alone is insufficient. |
| 2. Deploy the contracts | Simulate, broadcast and finalize the four-contract deployment. Complete any intended two-step ownership transfers. | Canonical successful receipts, code and linkages checked by the finalizer; `contracts/deployments/10143.json` with addresses, transaction hashes, blocks and compiler settings. The proof collector adds explorer links to `SUBMISSION_PROOF.md`. The candidate file is only a deployment input. |
| 3. Register the agent | Publish a truthful Agent Card, retrieve its exact IPFS bytes and call the implemented `register(string)` method. | Registration receipt, actual agent ID, matching owner/URI/wallet reads and `10143.agent.json`. |
| 4. Authorize and start the daemon | Grant the executor expiring authority and authorize the task signer separately when it is not the agent owner. Configure matching addresses and preserve the durable database. Keep relayer keys exclusive to this daemon. | Healthy `/health` and `/v1/config`, valid owner/delegate checks for both signer and executor, and a supported payment configuration. |
| 5. Execute a real paid MCP task | Run `scripts/submit_task.ts` through the documented package command. Retain its input/output artifacts and run directory. | Actual MCP result, task/payment authorizations, successful `ShardCreated` and `TaskExecuted` receipts, exact CREATE2 address and payment settlement checks. |
| 6. Index and publish a batch | Start Envio from the earliest deployment block. Enable the daemon batch worker and grant its committer role. | GraphQL returns matching agent, shard and execution records; a nonempty finalized block produces a commitment whose full root is independently reconstructed and matches on chain. |
| 7. Connect and exercise the dashboard | Configure the same deployment, Envio and Dynamic environment. Enable the browser demo only with a working payment policy. | Real directory/shard/batch data; a passkey sign-in and delegation/revocation ceremony if claimed; five confirmed browser checksum tasks if presenting the live browser demo. |
| 8. Export and rehearse | Run the proof collector, review its output and rehearse from a fixed commit. | `SUBMISSION_PROOF.md` contains actual explorer links and GraphQL output, with no fabricated or missing evidence for the demonstrated scope. Capture the required video/screenshots after checking event rules. |

The browser workload is a small deterministic checksum demonstration. The CLI invokes an actual MCP tool. Use the CLI path when claiming AI research or other external agent work, and explain what the tool really computed.

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

- [ ] Point reviewers at the **complete branch and commit**. The feature stack is intentionally staged in separate draft PRs; `main` does not yet contain the complete implementation. Preserve that rollout until the planned merges are authorized.
- [ ] Confirm repository visibility and the organizer's actual access requirement. The repository is public, so `metropolis@hackathon.monad.xyz` can read it without an invitation. If collaborator access is required, obtain the reviewer's GitHub username and required role; no invitation has been sent.
- [ ] Include the receipt-verified deployment manifest, agent registration export and generated submission proof with matching chain/contract/task identifiers.
- [ ] Provide a reachable dashboard and Envio endpoint, plus clear daemon/client startup instructions or a stated availability window.
- [ ] Include the [README](../README.md), [architecture](architecture.md), [protocol/API examples](protocol.md), [frontend judge guide](../frontend/docs/README.md) and verification record for the selected commit.
- [ ] Choose a repository-level license. There is currently no root `LICENSE`; package metadata alone does not license the whole project.
- [ ] Confirm the actual deadline/timezone, submission URL, track and sponsor criteria, team fields, recording duration and required assets. Prize eligibility has not been established by installing SDKs.

## Submission readiness versus production readiness

A coherent submission should demonstrate a registered agent, real service output, an authorized paid task, isolated recorded results and matching transaction/indexer/dashboard evidence. Include the additional live proofs above for every integration advertised. Until those receipts and services exist, describe the project as a locally tested prototype.

Production operation requires separate security review, wallet recovery checks, capacity measurements, service monitoring and tested journal backup/reconciliation. The daemon deliberately quarantines uncertain outcomes; preserve its database and investigate them rather than deleting state or resubmitting a paid request. Passing tests and a successful hackathon demo do not establish production readiness.
