# Aetheris live evidence

Updated **2026-10-11**. Agent #2 has **15 indexed task completions** on **Monad Testnet, chain 10143**. The hosted worker has now automatically published the ten latest outstanding batches; together with earlier evidence, all **16 task batches** across Agents #1 and #2 have verified commitments. The original five-task self-service run includes independently checked registration, delegation, task and payment receipts. The additional batch evidence verifies canonical tasks and commitments without reconstructing original browser signatures or payment linkage. Physical passkey enrollment and explicit delegation revocation remain unverified.

## Automatic batch publication, October 11

The user's next two runs brought Agent #2 to **15 indexed task completions** and the deployment to **16 completed task lanes** including Observer #1. Ten new source blocks were still uncommitted in the [preflight](submission/2026-10-11/agent2-automatic-worker-preflight.json).

The hosted daemon at `59b115336da2c9e5dedb79d7c17eb72d5f761a1c` now runs automatic publication. A read-only release first disabled both paid task submission and batching; after the old writer's shutdown and retirement interval, the same tested build was activated with batching and optional Envio discovery. [Deployment record](submission/2026-10-11/automatic-worker-deployment.json) and [host observations](submission/2026-10-11/automatic-worker-rollout-observations.json) retain the handoff. Render auto-deployment is disabled so future releases must preserve exclusive signer use.

The worker published all ten outstanding blocks at **00:50 UTC**. [Independent settlement verification](submission/2026-10-11/agent2-automatic-batch-settlement.json), completed at **00:53 UTC**, checked canonical source logs, reconstructed roots and batch IDs, exact commitment calldata/events, finalized successful receipts, finalized router storage and ten hosted Envio `verified: true` records.

| Source task block | Automatic Merkle commitment | Commitment block |
| --- | --- | --- |
| `69884325` | [0xfb01277113?f080455](https://testnet.monadscan.com/tx/0xfb012771135051ef8e55e1ade6bc5660b64ecd3f58ccdc1fcf740f4d3f080455) | `69972691` |
| `69884353` | [0xdc9c54be5b?5acf73f](https://testnet.monadscan.com/tx/0xdc9c54be5b8007674a0b0054f55674dd13044ddde292b8a1caa2700ea5acf73f) | `69972619` |
| `69884380` | [0x00ed8d6e62?3011d7f](https://testnet.monadscan.com/tx/0x00ed8d6e62ce0a7276bc389c31e6180d80c8e19290d9e0054ffc8d50c3011d7f) | `69972633` |
| `69884408` | [0x9816c3519e?3d8f7fd](https://testnet.monadscan.com/tx/0x9816c3519efa4836699c7196a99f3099a07d78db77e41259fb9c7545f3d8f7fd) | `69972648` |
| `69884435` | [0xe155882129?1f382d1](https://testnet.monadscan.com/tx/0xe1558821297ebf9ea89fc74c4cbaa1fb306d36f1fd195872acff246bb1f382d1) | `69972731` |
| `69885142` | [0xb0f08bda7a?fe41cc1](https://testnet.monadscan.com/tx/0xb0f08bda7af9d86222c835723d5e8145b05d459274a11c5409258190dfe41cc1) | `69972676` |
| `69885170` | [0xf38ad129ec?0f2dbda](https://testnet.monadscan.com/tx/0xf38ad129eca1813f0e5a0b454992fa156f98b87e76343b2e1f08656170f2dbda) | `69972715` |
| `69885197` | [0xfbe62d443b?a49abdb](https://testnet.monadscan.com/tx/0xfbe62d443ba70508cc8b06bd623eaa5912c2ee41b8ea8ea7465358d3fa49abdb) | `69972662` |
| `69885224` | [0x3a9d46ebeb?cded320](https://testnet.monadscan.com/tx/0x3a9d46ebeb29f12e78a8f05efb64f9ffc61e93d1173e77f43dcc887a8cded320) | `69972604` |
| `69885252` | [0xd800043f86?79077fe](https://testnet.monadscan.com/tx/0xd800043f864d26374b3f6ae568cbeab287c4f0a604bb0ea63aceb347c79077fe) | `69972746` |

The ten transactions consumed owner nonces **46?55**; latest/pending both read **56** afterward. The six earlier commitments remain valid, for **16 total verified roots**. No task or x402 payment was repeated to publish these batches. Original browser signatures and per-task payment linkage for these additional runs are outside this batch evidence.

The dashboard now counts completed lanes and verified roots across the configured deployment through the indexed checkpoint. Recent executions still use a 200-block window; the batch table still shows the latest 12 rows. [Desktop/mobile checks](submission/2026-10-11/indexed-totals-ui-checks.json) passed all 17 checks, including correct uncapped totals and expandable/copyable sequence numbers. Validation passed **173 frontend tests**, **36 Rust tests**, typechecking, production build, Rust formatting/Clippy and [all component CI jobs](https://github.com/willy264/monad-astheris/actions/runs/38099328621).

Automatic operation is demonstrated; full deployment-history scan completion and durable payment-journal retention are not. The worker prioritizes recent finalized blocks and uses indexer rows only to locate older blocks for canonical RPC reconstruction. Render remains on free ephemeral storage, so restart-safe journal retention still requires persistent storage. Agent #2's recorded executor grant had expired by this check; the owner must renew it before another paid run. Grant expiry does not invalidate completed tasks or prevent authorized batch publication.

## Self-service browser execution, October 10

The [public verification artifact](submission/2026-10-10/self-service-agent2.json) records the user wallet `0xce77b053D322ae8380aD2D0458f3605966EBDD22`, exact receipts, indexed responses, reconstructed salts and CREATE2 predictions. The agent is **Aetheris Checksum Agent**, token **2**. Its registered card is an inline JSON data URI describing deterministic browser checksums; it is separate from the IPFS-backed Monad Observer, token 1.

- [Agent #2 registration](https://testnet.monadscan.com/tx/0x280d7724cf1466a7f65d663551d1235d12b412bd0b9606444071e44b416464bb): the connected wallet submitted the registration and received the ERC-721 mint.
- [Executor grant](https://testnet.monadscan.com/tx/0x32b10fd80d977a3b6d89a91d51f364f6a7653d44650a9158711967f4cfac3128): that same owner authorized the daemon wallet until **2026-10-10 16:11:09 UTC**. All five executions occurred before expiry. This is wallet delegation, not proof of a device passkey ceremony.

| Browser lane | Confirmed TaskExecuted transaction | Execution block |
| --- | --- | --- |
| Checksum task 1 | [0xdf4c591…2710188](https://testnet.monadscan.com/tx/0xdf4c591369968ad52145170913e0d3c8f5a2c9a243b1496afd28865082710188) | `69858093` |
| Checksum task 2 | [0xa9d25f5…11afb93](https://testnet.monadscan.com/tx/0xa9d25f58fa1a72e1bf746abba75a0bdbf7f7910920a9f2dce670b1da511afb93) | `69858175` |
| Checksum task 3 | [0x8eba449…d272922](https://testnet.monadscan.com/tx/0x8eba4496c5b024827beac851b1b7a81564ca56a6c50106343d88099b6d272922) | `69858203` |
| Checksum task 4 | [0xc5428fa…e1c4ae0](https://testnet.monadscan.com/tx/0xc5428faadc9172b56e5476d74a13149d967ae1edf04eb7cd139896535e1c4ae0) | `69858148` |
| Checksum task 5 | [0x3281519…662876d](https://testnet.monadscan.com/tx/0x328151947bcfe78cc1e028f959c1c671e506777e51104d5b46cb29ac5662876d) | `69858120` |

The audit checked canonical successful creation/execution receipts, executor/router addresses, every indexed task field, reconstructed `keccak256(agentId | taskId | sequenceNonce)`, predicted shard addresses and stored salt mappings. Envio reports `shardsCreated: 5` and `tasksCompleted: 5`; recomputed Merkle leaves match its results. The initial **15:35–15:40 UTC** artifact records these five batches as uncommitted; the later publication below supersedes that dated state.

Five canonical payment receipts contain the exact token transfer from this user to the configured recipient and an `AuthorizationUsed` event: **5,000 base units = 0.005 testnet USDC** total. Complete receipts and nonces are in the artifact. The original browser journal, task signatures and request IDs were unavailable to this independent verifier, so it does not independently reconstruct each payment nonce's binding to a particular task. The user's screenshot reports all five lanes as browser-verified. No new signature or transaction was generated to produce this evidence, and no AI inference, TEE proof or throughput measurement is implied.

## Agent #2 Merkle settlement, October 10

The five existing task blocks were published with the daemon's `--commit-block` command during a coordinated exclusive-signer handoff. The [settlement artifact](submission/2026-10-10/agent2-batch-settlement.json), independently checked at **17:06 UTC**, contains each canonical source log, recomputed root/batch ID, exact commitment calldata, successful finalized receipt, finalized router storage and hosted GraphQL response.

| Source task block | Merkle commitment transaction | Commitment block |
| --- | --- | --- |
| `69858093` | [0x164a9f70...224e39c](https://testnet.monadscan.com/tx/0x164a9f70a51b2e73d9d5bd32973c7d13fcbb150f9f8ecd2e18152b18f224e39c) | `69880010` |
| `69858120` | [0xb4a3ded8...374d493](https://testnet.monadscan.com/tx/0xb4a3ded82a118276fc9353aa4014c74aa4abc81e48268b45f57b3a536374d493) | `69880058` |
| `69858148` | [0x4e937f73...1a226ee](https://testnet.monadscan.com/tx/0x4e937f73ef44019e0c40346dd4bdd2c8c106f4b1d898ccde7a0bbb10f1a226ee) | `69880096` |
| `69858175` | [0xa8694f95...106a123](https://testnet.monadscan.com/tx/0xa8694f9559ac391f3a5357520601d007740966ccc4281c46f811595a7106a123) | `69880139` |
| `69858203` | [0x548cc469...315a239](https://testnet.monadscan.com/tx/0x548cc469f7b0a256a788477cc6fbe04ea949d1cdd562bad85c074e1b9315a239) | `69880185` |

Each batch contains **one leaf**. Envio returns `status: committed` and a matching `BatchCommitment` with `verified: true` for all five. No task was rerun and no additional x402 payment was requested. The owner used transaction nonces **21–25**, with latest/pending both **26** afterward. Render resumed healthy at **17:05:28 UTC**. At that time its automatic batch worker remained disabled and the CLI preserved its scan cursor. The October 11 automatic publication above supersedes the disabled-worker state; durable journal retention and full historical catch-up remain separate operational work.

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
| Dashboard | [monad-astheris.vercel.app](https://monad-astheris.vercel.app). Self-service registration and five paid browser checksum tasks are evidenced above. Live Envio configuration is recorded in the October 10 operational checks. |
| MCP observer | `https://monad-astheris.vercel.app/api/mcp`, tool `get_monad_block`, arguments `{}`. MCP uses POST; a browser GET returns 405. |
| Paid task daemon | `https://monad-astheris-daemon.onrender.com/v1/tasks`. The CLI and self-service browser execution route. Render resumed after the October 7 coordinated signing window; October 10 task receipts supersede that earlier paused snapshot. |
| Envio | `https://indexer.dev.hyperindex.xyz/635fbf6/v1/graphql`, deployed from `7569afb`. Exact frontend queries/parsers, task fields and verified commitment pass. Auto-deploy is disabled to preserve this development endpoint and quota. |

Recent activity counters use a 200-block window; completed-lane and verified-root totals now cover all matching indexed records through the checkpoint. The Envio-backed visualizer, shard ledger and Observer history separately retain the latest 200 indexed task lanes, including earlier runs. A [live query check](submission/2026-10-10/indexed-shard-history.json) returned all five Agent #2 shards and the earlier Agent #1 shard while recent executions correctly remained zero. [Frontend checks](submission/2026-10-10/frontend-recovery-checks.json) cover automatic read-only receipt recovery, permission-aware controls and historical display; they do not establish a new device ceremony or original-user browser recovery session.

The card is `ipfs://bafkreibo5gtw45fi27ykfsbubt7uo6vze3s4x44ytqf735ojnnhhylpuea`; its [committed bytes](contracts/deployments/10143.agent-card.json) hash to `0x2bcfadcd0f5f2243257bf7ca9b0a454cd01047669e0c3eefec2dfa95dd14f356`. The [domain association](frontend/public/.well-known/agent-registration.json) links the service to agent #1. Original deployment Solidity source hashes reference [revision b19b976](https://github.com/willy264/monad-astheris/tree/b19b9767606f92ee8abf71c6fa222c0ab1958a5b/contracts/src).

A read-only MCP check requires no wallet or payment:

```sh
cd scripts
pnpm install --frozen-lockfile
pnpm verify-mcp https://monad-astheris.vercel.app/api/mcp
```

Use Node 24+ for the whole repository and pnpm 10.32.1. The [October 7 MCP report](submission/2026-10-07/mcp.json) passed 11 checks. The [generated live checks](submission/LIVE_CHECKS.md) and [verification record](VERIFICATION.md) retain reproducibility details. Preserve the completed private task journal when using the client again; a new run is a new paid operation, not a way to regenerate this receipt.

## Remaining scope

- **Website security classification:** earlier user screenshots show MetaMask classifying the production domain as malicious. Investigation and provider review remain unresolved; later successful user transactions do not clear the classification. Dynamic's configured name `uiriamuzu` explains the unexpected sign-in wording; it does not establish the classification's cause. See the [review record and unsent support request](submission/2026-10-07/wallet-security-review.md). No clearance or completed device ceremony is claimed.
- **Physical passkey enrollment/sign-in:** the user reported that the registration button did not open a prompt. [PR #40](https://github.com/willy264/monad-astheris/pull/40) passed 61 frontend tests, builds and CI and merged as `4d8222d`. Vercel deployed it successfully at 21:00:54 UTC. The [production check](submission/2026-10-07/passkey-production-smoke.json) verified its assets and page/dialog rendering, then hit Dynamic settings HTTP 429 during fresh-session initialization. The complete authentication smoke and actual device ceremony remain unverified; retries stopped.
- **Explicit delegation revocation:** the grant and authorized execution are verified. Revocation was requested but is not yet verified. The saved grant expires at `2026-10-07T21:26:38Z`; scheduled expiry is not a recorded revoke transaction or a verified post-revocation rejection.
- **Browser authorization evidence:** the original five paid browser checksum tasks include independent payment-receipt evidence; all fifteen Agent #2 tasks now have canonical batch commitments. Preserve the browser journal to permit independent per-task payment/signature reconstruction; the batch publication does not reconstruct those original authorizations.
- **Durable hosting/recovery:** Render's free ephemeral filesystem does not establish durable payment-journal retention. Backups, restart recovery and exclusive signer handoff need production-grade operation.
- **Additional claims:** no independent reviewed feedback, live CRE delivery, genuine hardware TEE proof, Mera device ceremony or Privy integration is claimed. One task and one leaf are not a throughput benchmark or evidence of zero scheduler contention.
- **Submission packaging:** confirm organizer rules, deadline, access, license and recording requirements before publishing a final entry.

Earlier funding/authorization blockers in [preflight](submission/2026-10-07/preflight.json) and [funding follow-up](submission/2026-10-07/funding-followup.json) are dated history superseded by these successful receipts. The [initial Envio report](submission/2026-10-07/envio-initial.json) records the earlier missing-aggregate issue; the [current report](submission/2026-10-07/envio-settlement.json) confirms the fix. These earlier observations are not current blockers. See the [readiness checklist](docs/submission-readiness.md) for the remaining work.
