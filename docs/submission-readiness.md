# Submission readiness

Aetheris has an implemented codebase and passing local checks. It does **not yet have a deployed, paid, end-to-end agent demonstration**. The task client and provider-facing tools have now been implemented; the remaining live work is to configure actual services/wallets and collect evidence that the components work together.

**2026-10-03 update:** this document preserves the original readiness assessment below for scope tracking. The MCP/payment client, receipt-verified deployment/IPFS tools, Mera/CRE adapters and Envio dashboard path are now implemented, and Linux CI has passed Envio code generation/full typing. References below to those items as missing describe the initial 2026-10-02 assessment, not their current source status. Use [live-submission.md](live-submission.md), [VERIFICATION.md](../VERIFICATION.md) and [SUBMISSION_PROOF.md](../SUBMISSION_PROOF.md) for current implementation, checks and external blockers.

This assessment reflects the workspace checked on **2026-10-02**. The supplied project brief names **Monad Metropolis Hackathon, Track 04: Trust, Identity & AI Infrastructure** as its intended destination. No organizer rubric, deadline, submission URL, eligibility rules, or required video format was supplied. The checklist below is a technical acceptance plan, not a statement of official competition requirements.

Read the [architecture](architecture.md) for component boundaries, the [runbook](runbook.md) for setup and operation, and the [verification record](../VERIFICATION.md) for the checks actually completed.

## Current status

**Implemented** means code exists. **Tested locally** means the stated checks passed. **Unverified live** means the external service or deployed integration has not been exercised. **Missing** identifies an artifact or integration that still needs to be built or supplied. Several statuses can apply to one feature.

| Area | Status | Evidence and remaining limit |
| --- | --- | --- |
| Identity, reputation, validation, router and isolated task contracts | Implemented; tested locally; unverified live | Foundry: **22 tests passed**, including two fuzz tests with 256 cases each. No deployed contract addresses or transaction evidence yet. |
| Shared contract interfaces | Tested locally | **27 declarations** across frontend, Rust and indexer match compiled Solidity ABIs. This does not test deployed configuration or live calls. |
| Rust task routing, authorization, payment checks, durable job journal and Merkle worker | Implemented; tested locally; unverified live | `cargo check` passed without warnings/errors; **13 tests passed**. No paid task has crossed the entire live path. |
| Standard x402 payment path | Implemented; locally tested receipt/authorization logic; unverified live | Requires a real facilitator supporting exact EIP-3009 on Monad Testnet, a compatible payment asset, funded payer and correct domain settings. None is supplied as a working deployment. |
| Graph Tally receipt mode | Receipt checks and adapter client implemented; external adapter missing; unverified live | The required custom verification/settlement adapter and its real escrow/aggregation integration do not ship with this repository. A valid receipt signature alone does not establish settlement. |
| Envio configuration, entities, event handlers and Merkle calculation | Implemented; partially tested; generated types and live indexing unverified | **2 Merkle tests passed**, configuration schema validation passed and syntax diagnostics reported zero errors. Native Windows codegen is unsupported; the attempted WSL startup failed. Full codegen/typechecking and an indexed deployment remain. |
| Dashboard overview, agent directory and shard visualizer | Implemented; build/browser tested; deployed contract data unverified | Typechecking and production build passed. Desktop/mobile browser smoke passed for all three pages with no JavaScript exceptions or horizontal overflow. Read-only overview fetched real Monad Testnet data. Contract-specific views were checked in their unconfigured state. |
| Dashboard data integration | Direct RPC reads implemented | The dashboard currently reads RPC through its server API. It does **not** consume Envio GraphQL or submit work to the daemon. |
| Dynamic authentication, passkey actions and expiring executor delegation | Implemented; compiles; unverified live | Requires a configured Dynamic environment, allowed origin, compatible wallet and funded owner account. Enrollment, sign-in, delegation signing and revocation have not been tested against that environment. |
| Agent registration and task submission UI | Missing | The dashboard has no registration form, task creation form, task EIP-712 signer or payment client. Contract/API access can support a scripted demo once that client is written. |
| MCP invocation and actual task output production | Missing | Agent Cards can advertise MCP endpoints, but Aetheris does not invoke them. The daemon receives caller-supplied input/output/proof hashes; it does not run an agent or produce those outputs. |
| Reputation and validation demonstration | Contracts implemented and locally tested; live workflow missing | Execution does not automatically call either registry. Recording a completed task, giving feedback, requesting validation and submitting a response are separate operations. |
| TEE hardware evidence | Signature/measurement adapter implemented; real verifier integration missing | The contract verifies a trusted verifier's statement. Vendor quote verification, certificate chains, quote freshness and measurement policy must be supplied by an external service before claiming hardware-backed verification. |
| Deployment and complete demonstration | Missing | No funded service configuration, deployed four-contract manifest, paid task, hosted indexer or complete demo evidence yet. |
| Production readiness | Not established | Passing tests are not an independent security audit, a recovery drill, a production capacity benchmark or proof of external service availability. |

Formatting checks also passed for Solidity and Rust. See [VERIFICATION.md](../VERIFICATION.md) for exact commands and environment limitations. The existing browser screenshots and report are local ignored artifacts under `frontend/.smoke/`; they are not a published submission package.

The repository includes a [verification script](../scripts/verify.sh), but no hosted CI workflow is configured. Add a supported-host CI job for contract tests, Rust checks/tests, ABI comparison, Envio codegen/typechecking/tests and the frontend build to keep future changes reproducible. This is a useful engineering follow-up, not an assumed organizer requirement.

## Priority 0: establish a reproducible live path

Complete these in dependency order. Keep the result of each step with the final demo evidence.

| Work | Acceptance evidence |
| --- | --- |
| **1. Finish Envio compilation on a supported host.** Use Linux/macOS or working WSL2; restore the pinned dependencies, run codegen, then the full generated-type check. Resolve any errors before treating the indexer as verified. | Successful `pnpm codegen`, `pnpm typecheck` and `pnpm test` logs with the repository commit and runtime versions. Docker is needed for the local database stack described in the runbook. |
| **2. Select a real payment deployment before depending on a paid demo.** Choose the daemon's x402 mode or provide the custom Graph Tally adapter. Confirm chain, asset, domains, funding and settlement behavior. | For x402: facilitator `/supported` advertises the configured exact scheme/network and a real payment can settle. For Graph Tally: adapter verification and durable receipt acceptance work against a documented real escrow/aggregation deployment. |
| **3. Deploy the four contracts on Monad Testnet, chain 10143.** Fund deployment/relayer accounts with testnet MON, run the deployment simulation, broadcast intentionally, and complete pending admin ownership transfers if configured. | Deployment receipts, earliest deployment block, explorer links and a reconciled `contracts/deployments/10143.json`. The script also writes a manifest during a dry run, so the JSON alone does not prove deployment. Verify code exists and router/reputation/validation identity references all resolve to the intended identity registry. |
| **4. Publish and register a real agent.** Create an accessible IPFS Agent Card with the agent's actual service endpoint/capabilities, register it and retain its owner account. | Registration transaction, agent ID, `ownerOf`/`tokenURI` reads, retrievable card and a successful call to the advertised MCP service. The card alone is not evidence that the service works. |
| **5. Implement the task producer/client.** Invoke the MCP service, preserve the task input and output bytes, derive their hashes, construct the exact task EIP-712 message, sign it and handle the selected payment protocol. | A checked-in runnable script or client that produces a real output, obtains a 402 challenge when unpaid, submits an authorized paid task and reports its persisted job status and receipts. Document serialization so a reviewer can recompute the hashes. |
| **6. Configure task authority and start the daemon.** Delegate each selected executor for the registered agent, use funded relayer keys exclusive to this process, preserve the journal database and configure the matching router/start block. | `isAuthorized` checks for the task signer and executor, successful `/health` and `/v1/config`, and a successful paid task with `ShardCreated` and `TaskExecuted` receipts. Never include private keys in the evidence. |
| **7. Start indexing the same deployment.** Configure matching addresses and the earliest registry deployment block; use local Envio or provision a hosted deployment. | GraphQL returns the real `Agent`, `EphemeralShard` and `TaskExecution` with matching transaction hashes, agent ID, output hash and log order. No invented entities or manually inserted activity. |
| **8. Connect the dashboard to the same contracts.** Configure server/public variables correctly and rebuild after changing public values. | Directory shows the registered card; visualizer shows real created/completed shards; overview labels the observation window. Capture desktop/mobile screenshots against the deployment. |
| **9. Exercise the integrated path and a retry.** Submit multiple distinct task attempts and repeat one identical authorized request. | Distinct CREATE2 addresses and correct independent outputs; repeated canonical task returns the original job/result without another payment or task execution. Record source inputs, task IDs, nonces, receipts and payment evidence. |

The standard x402 route is not guaranteed to be available merely because a URL or token address is configured. The daemon rejects unsupported facilitator deployments and has no free/unsigned mode. If a compatible real service cannot be obtained, report the paid path as blocked rather than demonstrating a fake settlement success.

For Graph Tally, `GRAPH_TALLY_ADAPTER_URL` refers to an **Aetheris-specific HTTP adapter**, not an official Graph Tally HTTP API or a standard x402 payment scheme. Its `/verify` operation must check collection state, authorized signer and escrow funding; `/settle` must durably accept/aggregate a receipt, deduplicate its hash and support reconciliation. The adapter implementation/deployment remains work. If settlement evidence only establishes accepted aggregation, label it accordingly; do not imply final onchain redemption. See the exact transport contract in the [daemon README](../daemon/README.md).

The task client is also a real implementation gap. It needs two independent authorizations: the task signature grants scoped execution, while the payment credential authorizes payment. The daemon currently accepts 65-byte ECDSA task signatures from an authorized Ethereum account, not raw WebAuthn signatures or ERC-1271 task signatures. Use a compatible EOA owner/delegate or implement and test any additional signing flow before relying on it.

## Priority 1: demonstrate the advertised feature set

These items complete the features already present in the architecture or explain why a narrower demonstration omits them.

| Feature | Remaining work | Acceptance evidence |
| --- | --- | --- |
| Dynamic passkeys and scoped delegation | Configure a real Dynamic project and HTTPS origin, enroll/sign in with a supported passkey flow, connect the agent owner and exercise grants/revocation. | Successful enrollment and subsequent sign-in; Monad transaction granting an expiring delegate; an authorized task; revocation transaction; rejected execution after revocation/expiry. Do not claim the app exports or verifies a raw P-256 private key/signature. |
| Merkle batch publication | Enable the daemon batch worker, grant its first relayer the separate router committer role and use an RPC supporting `finalized`. | A real nonempty finalized block produces `MerkleBatchCommitted`. Its ID, root, block range and leaf count match indexed data, and the corresponding `BatchCommitment.verified` is `true`. |
| Reputation | Explicitly call `recordTaskExecution(shard)` after a confirmed completion and submit feedback from an eligible independent client. The current daemon/indexer do not do this automatically. | Task execution record and feedback transactions; `completedTasks` changes once; quality-tag summary appears in the directory. Describe the reviewer policy and avoid presenting an uncurated mean as a trust guarantee. |
| Validation and output integrity | Create an output-bound validation request and submit the selected validator's response. Preserve the bytes being checked. | Request/response transactions, matching expected output hash, and `verifyOutputHash` succeeds for the actual output and fails for altered bytes. A matching hash proves byte integrity, not semantic correctness. |
| TEE verification, if retained in the demonstration claim | Integrate a verifier that validates real manufacturer evidence, configure its trusted address and approved measurement, and submit a bound, fresh signed statement. | Genuine evidence reference, documented verifier/measurement policy, successful `TEEAttestationVerified` receipt and failure for an invalid/expired or replayed statement. A manually signed test statement is insufficient evidence of hardware attestation. |
| Product task/registration experience | Add the missing registration and task submission UI if the intended demo requires users to perform those actions in the browser. Otherwise provide a documented, reproducible CLI/script. | A reviewer can register an agent and submit a paid task using the delivered interface without editing application source or handcrafting undocumented signatures. |
| GraphQL in the dashboard, if promised | Implement the frontend Envio query path and its loading/error behavior, or describe the current RPC data path accurately. | Browser requests and displayed records demonstrably come from the configured indexer. A running indexer alongside the current dashboard does not establish this integration. |

Merkle commitments land in **AetherisRouter**, not automatically in the reputation or validation registries. A `proofHash` in a completed shard is only a commitment supplied by the caller; it does not trigger TEE verification. Keep these boundaries explicit in the pitch and demo.

## A practical demo sequence

Prepare accounts, deployments, the IPFS card and payment funding before recording. Use the same agent ID and deployment throughout so the evidence is easy to follow.

1. **Show the deployment.** Display chain 10143, the four contract addresses, repository commit and a healthy daemon. Open the registered agent's card in the directory and show its real MCP endpoint.
2. **Grant access.** Sign in through configured Dynamic authentication, then show the owner granting a short-lived executor delegation. If passkeys are not verified, omit that claim and state the authentication method actually used.
3. **Produce real work.** Run the task client against the MCP endpoint and show the input/output artifacts and their hashes. Explain what the agent actually computed.
4. **Show payment gating.** Make the unpaid request, show the 402 challenge, then let the client supply the real task and payment authorizations. Avoid displaying secrets or reusable credentials.
5. **Submit several task attempts.** Use distinct task IDs or sequence nonces. Show the resulting CREATE2 addresses, successful receipts and independently stored outputs. The client can issue concurrent requests; the evidence demonstrates isolation, not measured Monad scheduler internals.
6. **Follow one task through all components.** Match its daemon job, router events, GraphQL `TaskExecution` and dashboard shard. Repeat the canonical request and show the same job/result without duplicate execution/payment.
7. **Show the batch.** After finality and publication, compare the onchain root with the indexer's verified commitment. Allow time for confirmations/finality in the recording plan.
8. **Show reputation and validation.** Record the completion, give eligible client feedback and show the validation response. Include real TEE evidence only if the verifier integration above is complete.
9. **Revoke access.** Revoke the executor grant and show that a new unauthorized attempt cannot execute. End on the evidence links and the explicitly documented remaining limitations.

Record only steps that actually succeed against the deployed system. A shorter working demonstration with clear boundaries is a valid technical artifact; it does not by itself satisfy any unknown event rubric or complete omitted promised features.

## Submission package to assemble

These are recommended evidence artifacts. Check the organizer's actual requirements when they become available.

- [ ] **Accessible repository and fixed commit/tag.** Include component source, lockfiles, ABI exports, environment examples, setup instructions and the current verification record. Exclude private keys, real `.env` files, database contents and reusable payment/signing credentials.
- [ ] **Repository sharing and license decision.** Choose repository visibility appropriate to the submission rules and select/add a project-level license with the project owner's agreement. There is currently no root `LICENSE`; the Rust package's MIT metadata does not establish a repository-wide license. Preserve third-party dependency notices.
- [ ] **Clear README and architecture.** Explain the problem, actual data flow, CREATE2 isolation boundary, payment/verifier trust assumptions and current feature limits. Link the [runbook](runbook.md), [protocol](protocol.md) and this checklist.
- [ ] **Public deployment manifest.** Include chain ID, all four addresses, deployment transaction hashes, earliest deployment block, source commit/compiler configuration, public role addresses and explorer links. The deploy script's address JSON is also produced by a dry run; establish actual deployment through successful receipts and onchain code before publishing it as a live manifest.
- [ ] **Reproducible demo inputs and client.** Include the agent ID/card URI, service invocation instructions, task input/output artifacts, hashing rules and one runnable signed/paid task flow. Use fresh credentials supplied by the reviewer/operator.
- [ ] **Transaction and indexing evidence.** Link registration, delegation, shard creation, execution, payment settlement/acceptance, batch, feedback, validation and revocation records for features claimed. Preserve matching GraphQL responses with block/transaction identifiers.
- [ ] **Reachable demonstration.** Supply the frontend URL and clear access/start instructions for required services. State any availability window or operator-assisted payment/credential setup. Keep administrative GraphQL access and service secrets private.
- [ ] **Demo recording and screenshots.** Show the actual deployed flow and desktop/mobile dashboard. Choose duration/format only after checking the event rules; no format has been specified here.
- [ ] **Check logs and known gaps.** Save supported-host Envio codegen/typecheck output, local test/build results and live integration outcomes. Update the verification record with what ran and the deployment/commit checked.
- [ ] **Organizer checklist.** Confirm the actual submission URL, deadline/timezone, track fit, required team/project fields, repository visibility, licensing and any required assets from the published rubric. These are still unknown.

## Minimum demo, complete scope and production

**Minimum coherent submission demo:** a deployed identity, a real MCP-produced output, an authorized paid task, independently stored CREATE2 task results, and matching observable transaction/data evidence. A documented CLI can supply missing browser actions. To present all four project components as integrated, also complete supported-host Envio verification, live indexing and the matching dashboard deployment. Describe any omitted feature explicitly.

**Complete advertised project scope:** add the passkey/delegation flow, verified batch commitment, reputation/validation examples and each payment/attestation mode claimed in the pitch. Graph Tally and TEE claims require the external implementations identified above. The minimum demo is not a substitute for those promised integrations.

**Production work is separate.** Before handling meaningful funds or depending on the service operationally, arrange independent contract/application security review; test permissions and wallet recovery against the chosen providers; review the supported framework/dependency versions; secure public endpoints with TLS, rate limits and request limits; and establish monitoring and incident response. Exercise journal backup/restore, relayer key custody, nonce reconciliation, interrupted broadcasts, settlement uncertainty and finalized-chain disagreement. Benchmark actual workload, provider limits, costs and sustained throughput. Existing checks do not establish those properties.

The current recovery model deliberately stops uncertain work for operator reconciliation. Preserve the durable journal and use relayer keys exclusive to a daemon process. Do not advertise automatic exactly-once recovery across blockchain and payment systems until that property has been separately designed and demonstrated.

**Conditional original extras:** Category Labs threshold encryption and a Privy fallback appeared in the supplied broader concept, but neither is integrated. They require their own concrete protocol/provider configuration and implementation if retained as submission promises. They are not prerequisites for explaining the current Dynamic-based, plaintext-hash coordination engine unless the actual rubric or revised scope requires them.

Likewise, a numeric “state collisions saved” figure or a guaranteed parallel-execution speedup would require real scheduler telemetry and a defensible baseline. The dashboard correctly shows that metric as unavailable. Current tests establish storage isolation; “ephemeral” describes task scope, and deployed shards retain their audit state permanently.
