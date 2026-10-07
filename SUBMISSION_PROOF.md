# Aetheris live evidence

Updated **2026-10-07**. A registered agent completed one real MCP task through the paid daemon on **Monad Testnet, chain 10143**. It settled **0.001 testnet USDC**, created an isolated result contract, recorded completion and produced a finalized Merkle commitment that hosted Envio independently indexed. A project-controlled validator separately checked output integrity. Physical passkey enrollment, explicit delegation revocation and the production browser paid flow remain pending.

## Verified workflow

| Step | Observed result | Public evidence |
| --- | --- | --- |
| Deploy contracts | Four contracts have successful canonical receipts, verified code and registry/role links. Earliest deployment block: `67972561`. | [Live manifest](contracts/deployments/10143.json), [contract explorer links](README.md#deployment-manifest-and-explorer). |
| Register an agent | Aetheris Monad Observer is agent **1**, with an IPFS card and a public `get_monad_block` MCP tool. | [Registration manifest](contracts/deployments/10143.agent.json), [registration transaction](https://testnet.monadscan.com/tx/0xc9bbd6e8a390f4fb1788f3d305f241293ec919b49d35238c7aeda5c829f3a716), [card bytes](contracts/deployments/10143.agent-card.json). |
| Grant task authority | The owner granted the dedicated task signer expiring authority. Authorization was verified before execution; this was wallet delegation, not a completed passkey ceremony. | [Grant proof](submission/2026-10-07/delegation-grant.json), [transaction](https://testnet.monadscan.com/tx/0xed2170affe40cff87744fb919280352b3c15db69fc19598513772af7ff083961). |
| Invoke MCP and execute | The client called the actual observer, committed its input/output bytes, and verified the CREATE2 shard and task event. Execution block: **69066769**. | [Task proof](submission/2026-10-07/task-proof.json), [shard creation](https://testnet.monadscan.com/tx/0x0d33f7ed299fa96f0bd17817c2f524fe9c9e3f86124b7783861194544475854d), [execution](https://testnet.monadscan.com/tx/0xc2e82710f180b4e2e37ca13d53a80f1767fbbb6ec9f4402d8b5c83ee3e6c310a). |
| Settle payment | x402 exact/EIP-3009 settled **1,000 base units = 0.001 testnet USDC**. The client checked the token transfer and authorization nonce. | [Payment fields](submission/2026-10-07/task-proof.json), [settlement transaction](https://testnet.monadscan.com/tx/0xb3623f7b05b489fe647372c586a612463a60b6e9c9be87122ba57e1b5ad37db0). |
| Record completion | The reputation registry recorded the executed task. No independent review or client rating was submitted. | [Completion transaction](https://testnet.monadscan.com/tx/0x5c3d91a10d4e7c0057bec30c94a8ccf43a367fdb85903e4caba4172a293246ab), [task proof](submission/2026-10-07/task-proof.json). |
| Publish a Merkle batch | The one-block CLI reconstructed all router task logs for the finalized execution block and verified the publication receipt, event, canonical blocks and stored commitment. This block contained **one leaf**. | [Publication proof](submission/2026-10-07/merkle-publication.json), [commitment transaction](https://testnet.monadscan.com/tx/0x2fec55ca5081d8dbf23fe46e53f51e7570399b632a57088d6e3d4a7db75659bc). |
| Check hosted indexing | Envio returned the exact task, hashes and shard, with a matching verified commitment. Actual frontend queries and parsers passed; Agent #1 has `tasksCompleted: 1`. | [Current Envio evidence](submission/2026-10-07/envio-settlement.json), [saved task/commitment query](submission/indexer-evidence.json). |
| Validate output integrity | An authenticated project-controlled validator checked committed bytes, matching MCP text/structured output, the reported finalized RPC block and canonical task evidence. | [Validation proof](submission/2026-10-07/output-validation.json), [request](https://testnet.monadscan.com/tx/0xc1e84725ebf676ca8c684e991d402d2f13b96d21ed87dc3d0db05399bb11d4c8), [response](https://testnet.monadscan.com/tx/0xec93029a9e8ec008d2281cdb8f626309b82180a2ef7141d698dcf2c379bbcca6). |

The [owner handoff record](submission/2026-10-07/owner-handoff.json) captures the completed remote job, known successful receipts and equal latest/pending nonce before coordinated local signing. Render's worker was disabled. Publication used `daemon --commit-block 69066769`, preserving the worker cursor rather than claiming a scan of the entire deployment history. Exclusive signer use and a retained local journal remain operational requirements.

## Exact task and batch identifiers

| Field | Value |
| --- | --- |
| Router | `0xac4a33521b32122c9f014eac8800144dd9aa5ebe` |
| Agent ID | `1` |
| Task signer / payer | `0x44Cd39dCe9b074E27eFf4D914Ff9a3e182963605` |
| Owner / executor / payment receiver | `0x5D8853E81F580A12e3Affaa9a7c76E0A65E02F57` |
| Task ID | `0x1a55a675cb34c941a4de0b1e4269526a7335cb51ea177a235dba724aac244c28` |
| Request ID | `0x07f7edd33120c5d94d8c47035cda16f4e5c7150feb0e45179849e8bcf5119753` |
| Isolated shard | [0x465c5b7a951a3fbbf5a2a618ff4593c2a1ffefe8](https://testnet.monadscan.com/address/0x465c5b7a951a3fbbf5a2a618ff4593c2a1ffefe8) |
| Input hash | `0xcdf3188adf0519f15395b5812c9d57fda0615bdaed1997a39ea2c86e2978f03b` |
| Output hash | `0x123713719f129fd9b5de451cd4ab2d3187e75a27f2f2e7146d41cfe8e6ff5339` |
| Execution block / hash | `69066769` / `0x980aab91858614bd2c27234604a7b2ed8e5ed25e40e626ab37ee13b7d96026d3` |
| Batch ID | `0x3a5e3ec71f061a59e57fbbf1b3d52ab6c57d66dc4254049c7c999418ece777c3` |
| Merkle root / leaf count | `0xb3559a6b33f5a1674ec469dfbfc95556afd5e37b08a76e0745853e7f14a3bc65` / **1** |
| Payment asset | Testnet USDC `0x534b2f3a21130d7a60830c2df862319e593943a3`, six decimals |

The [task proof](submission/2026-10-07/task-proof.json) includes the EIP-712 domain, types, message and **expired task signature**. Export waited until the authorization deadline passed on both the local clock and chain; the proof generator recovered the expected signer and request ID. Payment signatures and reusable credentials are excluded. `proofHash` is zero: this task did not supply a TEE or other cryptographic execution proof.

The MCP output observed block **69066749**, hash `0x4753ce0486a20ab50ab2844c799e5a3ef55bf6329b5b6cbcd1cc740b6f8c1351`, timestamp `1791405284`, with **3 transactions**. Exact committed output bytes are included in the [validation artifact](submission/2026-10-07/output-validation.json). The observer reads blockchain metadata; it does not perform AI inference. Its public MCP read is free (`x402Support: false` on the card); the separate task-recording request incurred the daemon's x402 payment.

Validation response `100`, tagged `output-integrity`, means the documented integrity checks passed. Its signer is the project-controlled task wallet, not an independent reviewer. It does not establish subjective output quality, manufacturer TEE attestation, Chainlink CRE delivery or a reputation rating.

## Public services and reproducibility

| Contract | Monad Testnet explorer |
| --- | --- |
| AgentRegistry | [0x754d7f2fd55a9841dbff248f9cb91d497116f231](https://testnet.monadscan.com/address/0x754d7f2fd55a9841dbff248f9cb91d497116f231) |
| ReputationRegistry | [0x8f1fe9beef6df891189355129bf48f073d9ab322](https://testnet.monadscan.com/address/0x8f1fe9beef6df891189355129bf48f073d9ab322) |
| ValidationRegistry | [0xcd0cf354acd2c79145caeac7d4f0639f8957308d](https://testnet.monadscan.com/address/0xcd0cf354acd2c79145caeac7d4f0639f8957308d) |
| AetherisRouter | [0xac4a33521b32122c9f014eac8800144dd9aa5ebe](https://testnet.monadscan.com/address/0xac4a33521b32122c9f014eac8800144dd9aa5ebe) |

| Service | Endpoint and current scope |
| --- | --- |
| Dashboard | [monad-astheris.vercel.app](https://monad-astheris.vercel.app). Read-only and preview UI are live; production paid browser execution and the current Envio connection are not yet configured. |
| MCP observer | `https://monad-astheris.vercel.app/api/mcp`, tool `get_monad_block`, arguments `{}`. MCP uses POST; a browser GET returns 405. |
| Paid task daemon | `https://monad-astheris-daemon.onrender.com/v1/tasks`. The verified CLI execution route; Render is paused for coordinated owner signing at this snapshot. |
| Envio | `https://indexer.dev.hyperindex.xyz/635fbf6/v1/graphql`, deployed from `7569afb`. Exact frontend queries/parsers, task fields and verified commitment pass. Auto-deploy is disabled to preserve this development endpoint and quota. |

The saved historical query includes the known execution block. The normal dashboard uses a recent 200-block window, so an older successful task can legitimately fall outside its recent-activity counters; the evidence file records both query scopes.

The card is `ipfs://bafkreibo5gtw45fi27ykfsbubt7uo6vze3s4x44ytqf735ojnnhhylpuea`; its [committed bytes](contracts/deployments/10143.agent-card.json) hash to `0x2bcfadcd0f5f2243257bf7ca9b0a454cd01047669e0c3eefec2dfa95dd14f356`. The [domain association](frontend/public/.well-known/agent-registration.json) links the service to agent #1. Original deployment Solidity source hashes reference [revision b19b976](https://github.com/willy264/monad-astheris/tree/b19b9767606f92ee8abf71c6fa222c0ab1958a5b/contracts/src).

A read-only MCP check requires no wallet or payment:

```sh
cd scripts
pnpm install --frozen-lockfile
pnpm verify-mcp https://monad-astheris.vercel.app/api/mcp
```

Use Node 24+ for the whole repository and pnpm 10.32.1. The [October 7 MCP report](submission/2026-10-07/mcp.json) passed 11 checks. The [generated live checks](submission/LIVE_CHECKS.md) and [verification record](VERIFICATION.md) retain reproducibility details. Preserve the completed private task journal when using the client again; a new run is a new paid operation, not a way to regenerate this receipt.

## Remaining scope

- **Physical passkey enrollment/sign-in:** the user reported that the registration button did not open a prompt. [PR #40](https://github.com/willy264/monad-astheris/pull/40) passed 61 frontend tests, builds and CI and merged as `4d8222d`. Vercel deployed it successfully at 21:00:54 UTC. The [production check](submission/2026-10-07/passkey-production-smoke.json) verified its assets and page/dialog rendering, then hit Dynamic settings HTTP 429 during fresh-session initialization. The complete authentication smoke and actual device ceremony remain unverified; retries stopped.
- **Explicit delegation revocation:** the grant and authorized execution are verified. Revocation was requested but is not yet verified. The saved grant expires at `2026-10-07T21:26:38Z`; scheduled expiry is not a recorded revoke transaction or a verified post-revocation rejection.
- **Production dashboard:** set Vercel's `ENVIO_GRAPHQL_URL` to the verified endpoint, configure the paid-service policy and verify actual task/batch rendering. Vercel management authorization is unavailable. Five paid browser checksum tasks have not been demonstrated.
- **Durable hosting/recovery:** Render's free ephemeral filesystem does not establish durable payment-journal retention. Backups, restart recovery and exclusive signer handoff need production-grade operation.
- **Additional claims:** no independent reviewed feedback, live CRE delivery, genuine hardware TEE proof, Mera device ceremony or Privy integration is claimed. One task and one leaf are not a throughput benchmark or evidence of zero scheduler contention.
- **Submission packaging:** confirm organizer rules, deadline, access, license and recording requirements before publishing a final entry.

Earlier funding/authorization blockers in [preflight](submission/2026-10-07/preflight.json) and [funding follow-up](submission/2026-10-07/funding-followup.json) are dated history superseded by these successful receipts. The [initial Envio report](submission/2026-10-07/envio-initial.json) records the earlier missing-aggregate issue; the [current report](submission/2026-10-07/envio-settlement.json) confirms the fix. These earlier observations are not current blockers. See the [readiness checklist](docs/submission-readiness.md) for the remaining work.
