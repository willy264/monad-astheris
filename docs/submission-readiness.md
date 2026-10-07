# What remains before submission?

**As of October 7, 2026, the core paid CLI workflow has live evidence.** Agent #1 called the real Monad Observer MCP service; its signed task settled **0.001 testnet USDC**, created isolated storage, recorded completion and produced a finalized one-leaf Merkle commitment. Hosted Envio returned matching task and commitment data. A project-controlled validator separately recorded output-integrity checks. [SUBMISSION_PROOF.md](../SUBMISSION_PROOF.md) contains exact evidence and explorer links.

Remaining demonstration work is physical passkey enrollment, explicit grant revocation, the production dashboard's Envio configuration and the chosen browser paid flow. Durable hosting and additional integration claims need separate work. The organizer's deadline, rubric, eligibility and required assets have not been verified.

The passkey fix is deployed. Its [production browser check](../submission/2026-10-07/passkey-production-smoke.json) verified the new assets and rendered dialogs, but Dynamic settings subsequently returned HTTP 429 and blocked fresh-session initialization. Wait for provider availability before retrying the physical ceremony; the partial check is not an authentication pass.

## Implemented and observed

| Area | Current evidence | Remaining boundary |
| --- | --- | --- |
| Contracts and identity | Four receipt-verified deployments, Observer #1 and **38 Foundry tests**. [Manifest](../contracts/deployments/10143.json). | Registration verifies ownership/profile linkage, not every advertised capability or output. |
| Daemon and batching | Real paid execution and finalized publication. PR #39 passed compilation, strict Clippy and **27 Rust tests**. | Free Render storage is ephemeral. One-block publication is not historical catch-up. |
| MCP/payment client | Actual observer output, exact shard/task receipts, x402 transfer/nonce checks; **17 scripts tests**. [Proof](../submission/2026-10-07/task-proof.json). | One CLI task is evidenced; five paid browser checksum tasks are not. |
| Reputation | A real task-completion record. | No independent client's reviewed feedback/rating. |
| Validation | Output-bound request and authenticated integrity response. [Proof](../submission/2026-10-07/output-validation.json). | Project-controlled validator; response `100` means documented integrity checks passed. |
| Hosted Envio | Exact frontend queries/parsers and matching verified batch at `635fbf6/v1/graphql`. [Evidence](../submission/2026-10-07/envio-settlement.json). | Production Vercel still needs the endpoint environment setting. |
| Frontend | Historical **592 production browser checks**. PR #40 passed **61 tests**, typecheck, builds and component CI, merged `4d8222d` and deployed to production at 21:00:54 UTC. | Complete a real physical passkey ceremony. Paid browser flows remain disabled/unverified. |
| Shared interfaces | **63 declarations** match compiled Solidity ABIs. | Runtime settings must retain the deployed chain/contracts. |

[VERIFICATION.md](../VERIFICATION.md) records revisions and scope. PR #39 merged at `7569afb`; PR #40 source `6e7abe5` passed checks before merging. The live manifest retains earliest deployment block `67972561`; reuse the deployment and agent #1 rather than redeploying or minting a duplicate to resume setup.

## Finish the demonstration

| Step | Current status | Completion evidence |
| --- | --- | --- |
| Paid MCP task and settlement | **Complete for one CLI task**, execution block `69066769`. | [Task proof](../submission/2026-10-07/task-proof.json), creation/execution/payment receipts. |
| Finalized Merkle publication | **Complete**, one leaf; canonical receipt/event and stored root verified. | [Publication](../submission/2026-10-07/merkle-publication.json), matching [indexed commitment](../submission/2026-10-07/envio-settlement.json). |
| Hosted Envio | **Verified for this task and frontend query compatibility.** Deployment `7569afb`, endpoint `https://indexer.dev.hyperindex.xyz/635fbf6/v1/graphql`. | [Exact queries, parser results and matching task/root](../submission/2026-10-07/envio-settlement.json). Auto-deploy is disabled to preserve the verified development endpoint/quota. |
| Owner delegation | **Grant and authorized execution complete; explicit revocation pending.** Grant expiry: `2026-10-07T21:26:38Z`. | [Grant](../submission/2026-10-07/delegation-grant.json); add the actual revoke receipt, authorization state and rejected new request. Scheduled expiry is not that test. |
| Physical passkey | **Pending.** User reported no prompt from registration; fix deployed from PR #40. | Enroll/sign in on a supported device and configured origin. Keep ceremony evidence separate from wallet delegation. |
| Production dashboard | **Configuration pending.** Vercel management authorization is unavailable. | Set `ENVIO_GRAPHQL_URL` to the verified endpoint, configure daemon/payment policy, redeploy and inspect real task/batch panels with source/freshness labels. |
| Browser paid flow | **Not enabled or demonstrated.** | Verify policy/funding, then capture the chosen single MCP task or five-checksum flow with actual signatures, payments and receipts. Label its workload accurately. |
| Availability and persistence | **Unfinished.** Render is paused for coordinated owner signing; free storage is ephemeral. | State availability, resume safely, use persistent storage and test backup/restart/reconciliation. Retain private recovery journals. |
| Final package | **Pending.** | Select the reviewed/deployed commit, update evidence, rehearse and prepare required submission assets. |

Use the [live workflow](live-submission.md), [runbook](runbook.md), [service-access instructions](live-service-access.md) and [frontend guide](../frontend/docs/README.md) for operations. The observer returns blockchain metadata, not AI inference. Its MCP read is free; recording the result through the daemon incurs the configured x402 payment.

The [owner handoff](../submission/2026-10-07/owner-handoff.json) reconciled all known session operations before local signing. Suspend other processes sharing the signer and run local tools sequentially; Rust and JavaScript signer locks use separate stores. Never delete an unresolved journal or change databases to bypass an ambiguous transaction. The successful task does not establish restart durability on Render.

Keep private keys, active signatures, payment credentials, `.env` files and raw transaction journals out of the submission. Public proof includes typed authorization fields and omits reusable credentials. Preserve the completed private run directory; a new run creates a new paid request.

## Close only claims included in the pitch

| Claim | Evidence still required or limitation |
| --- | --- |
| Passkeys and delegation | Physical Dynamic enrollment/sign-in, explicit revocation and rejected use afterward. Grant and one authorized execution are already evidenced. |
| Independent reputation | An eligible independent reviewer must assess the actual output and explicitly supply a rating. Completion alone must not become a positive review. |
| Output validation | Byte/RPC integrity validation is evidenced. Independent quality approval needs an independent validator and stated evaluation method. |
| Chainlink CRE | Network support, official forwarder, deployed workflow and actual authenticated delivery. The receiver implementation alone is insufficient. |
| Hardware TEE | Genuine manufacturer-evidence verification, freshness and measurement policy; trusted-verifier signatures alone do not prove hardware attestation. |
| Mera or Privy | Mera's optional device/PRF flow needs its own ceremony. No Privy integration is included. |
| Graph Tally | Supply the documented adapter backed by real escrow/aggregation and demonstrate acceptance/settlement. The successful task used x402 EIP-3009. |
| Cumulative spending budget | Grants expire and clients pin per-task prices. A cumulative spending-cap contract is not implemented. |
| Daily settlement | Merkle batching is per nonempty finalized block; token settlement follows the payment provider. A root is not a token payout. |
| Throughput/collisions avoided | Benchmark a defined workload/baseline. One task, storage-isolation tests and illustrative animation do not measure Monad scheduler contention. |

## Package checklist

- [x] Four-contract deployment manifest and explorer links.
- [x] Registered agent, exact IPFS card, domain association and actual MCP output.
- [x] Authorized paid task with checked shard/execution/payment receipts.
- [x] Reputation completion and disclosed project-controlled integrity validation.
- [x] Finalized Merkle commitment and matching hosted Envio evidence, including frontend query/parser compatibility.
- [ ] Explicit grant revocation and supported-device passkey enrollment/sign-in.
- [ ] Vercel configuration and production task/batch UI evidence.
- [ ] Browser paid-flow evidence if included in the demonstration.
- [ ] Durable daemon journal, recovery checks and stated service availability.
- [ ] Final reviewed/deployed source revision packaged with current documentation.
- [ ] Repository-level license; no root `LICENSE` has been supplied.
- [ ] Confirm organizer deadline/timezone, URL, track/sponsor criteria, team fields, recording length and required assets. Public repository visibility is not an email-specific collaborator invitation.

A submission can accurately demonstrate the evidenced paid CLI workflow while marking unfinished UI and integration claims. Production readiness additionally requires security review, wallet recovery, capacity measurements, monitoring and durable recovery operations. A successful testnet demonstration does not establish those guarantees.
