# Aetheris: bounty selection, answers and demonstration evidence

Reviewed October 11, 2026 against source revision `6fb5b024b42799e39baab291a39ab35cc56acda5`, the user's six selected-bounty screenshots, and the public [Metropolis organizer page](https://monad.xyz/developers/hackathons/metropolis). This document prepares answers; it does not change the saved portal entry. The authenticated catalog endpoint returned HTTP 401, so signed-in track restrictions, eligibility and the saved application must still be checked in the [submission portal](https://hackathon.monad.xyz/project).

## Which selected bounties are actually supported?

| Selected bounty | Actual integration | Recommendation |
| --- | --- | --- |
| **Envio — Best Use of Envio** | **Implemented and evidenced.** HyperIndex indexes the deployed registry/router; GraphQL drives the directory, historical task lanes, counters and Merkle status. Existing records are independently matched to chain receipts. | **Keep.** This is the strongest demonstrated sponsor integration. |
| **Dynamic — Best Use of Dynamic** | **Implemented.** One shared SDK session supplies authentication, wallet discovery, wallet clients and task/payment signing. Registration, delegation and revocation use that wallet. Real passkey enrollment/sign-in remains unverified. | **Keep, with the limitations below.** Do not claim a completed passkey ceremony or a clearance that has not happened. |
| **Chainlink — Best workflow with CRE** | **Receiver adapter only.** The Solidity `onReport` receiver and rejection tests exist, but there is no CRE workflow, authenticated CLI simulation recording or DON deployment. | **Remove from the current completed submission.** Re-add only after a meaningful workflow and the mandatory successful CLI-simulation/deployment video exist. |
| **Privy — Privy!** | **Not implemented.** There is no direct Privy SDK/provider integration in the app. Dynamic's wallet handling is not Privy usage. | **Remove.** Do not describe Dynamic as Privy. |
| **Monad Foundation — Best Mera-Powered UX on Monad** | **Partial optional preview.** Mera derives a separate EVM account from passkey PRF and can request a router delegation. Core onboarding and task payment/signing still depend on Dynamic. | **Remove from the current completed submission.** The screenshot requires Mera as the entire account layer; this implementation does not meet that requirement. |
| **Monad Foundation — Mera: One Passkey, Many Keys** | **Not implemented for this requirement.** The only Mera derivation becomes an EVM signing account. There is no separate non-account PRF namespace or non-account feature. | **Remove.** Wallet signing does not satisfy the screenshot's non-account requirement. |

These are evidence-based recommendations, not a sponsor eligibility decision. No missing SDK was installed solely to create a bounty claim, and no unrelated wallet/account migration was made.

## Envio answer — paste into the description field

```text
Aetheris uses Envio HyperIndex as the read layer for its deployed agent-task infrastructure on Monad Testnet (chain 10143). Envio powers visible application features, not just an installed dependency.

Our indexer follows the deployed AgentRegistry and AetherisRouter. It processes agent registration, metadata updates and NFT transfers, then joins ShardCreated and TaskExecuted events into agent identities, per-task storage contracts and execution records. The generated GraphQL API supplies the Agent Directory, per-agent task completion totals, historical task tiles and the shard ledger in the live dashboard. A scoped SyncStatus entity supplies the indexed-through block and lag indicator, so reviewers can distinguish indexed history from the recent execution window.

The integration also reconstructs a Merkle tree from each block's task-execution events. It records the root, leaf count and a batch identity bound to chain, router, block number and block hash. When the router emits MerkleBatchCommitted, the indexer compares the commitment with the reconstructed data and records a match or mismatch. The dashboard uses these indexed records to show commitment state and link to the actual explorer transaction. The Rust publisher separately checks canonical RPC data before committing; Envio does not sign transactions or settle payments.

Queries are scoped to the exact deployed contracts and chain, with bounded results and response validation. The frontend keeps GraphQL credentials on the server and displays the source/freshness. Network TPS and reputation reads use RPC rather than being mislabeled as Envio data.

Our October 11 read-only evidence audit matched 22 completed task lanes and 22 committed Merkle batches against canonical logs, finalized receipts and router storage. The repository includes the actual GraphQL query/response and a transaction ledger. These records remain inspectable without connecting a wallet. They demonstrate indexed task/payment infrastructure; the example workload is deterministic checksums and mined-block observations, not claimed AI inference or a measured parallel-speed benchmark.

Live app: https://monad-astheris.vercel.app/
Indexer implementation: https://github.com/willy264/monad-astheris/tree/main/indexer
GraphQL consumption: https://github.com/willy264/monad-astheris/blob/main/frontend/lib/indexer.ts
Independent chain/GraphQL evidence: https://github.com/willy264/monad-astheris/blob/main/submission/2026-10-11/final-readiness-protocol.json
Transaction ledger: https://github.com/willy264/monad-astheris/blob/main/submission/2026-10-11/verified-transactions.md
```

The demonstrated product is **HyperIndex**, Envio's event-indexing framework with a generated GraphQL API ([official product description](https://docs.envio.dev/docs/HyperIndex/overview)). The configured indexer has an explicit Monad RPC source; do not additionally claim a separate direct HyperSync API or HyperRPC integration. Sources: [indexer config](../indexer/config.yaml), [handlers](../indexer/src/EventHandlers.ts), [entity schema](../indexer/schema.graphql), [Merkle implementation](../indexer/src/merkle.ts), [GraphQL reads](../frontend/lib/indexer.ts), [response and root validation](../frontend/lib/indexer-protocol.ts).

The video's [fresh GraphQL-to-chain comparison](../submission/2026-10-11/bounty-videos/envio-graphql-chain-proof.json), captured October 11 at 16:36 UTC, follows one historical task through its indexed execution, complete canonical execution block, reconstructed Merkle batch, finalized commitment receipt and router storage. All nine checks passed. This is a fresh verification of existing records; it is not a new paid run or a replacement for the separate 22-task audit.

## Dynamic answer — paste into the description field

```text
Aetheris integrates Dynamic SDK into its account and transaction flow on Monad Testnet. The frontend uses @dynamic-labs/sdk-react-core and @dynamic-labs/ethereum, with a shared DynamicContextProvider and Ethereum wallet connectors configured for chain 10143. Dynamic supplies authentication, the connected primary wallet and the wallet client used by the application.

A new user opens the Dynamic sign-in flow, connects an EVM wallet and enters guided agent setup. The app obtains that wallet's client through primaryWallet.getWalletClient() to register the user's agent and authorize its executor for a chosen expiry. Ownership and executor authority are checked on-chain. The access panel also supports a separate owner-approved revocation transaction and verifies the expected DelegateSet event before displaying success.

The same Dynamic wallet session is used in the live task flow. Each task requests an EIP-712 TaskAuthorization bound to the agent, task hashes, executor, deadline, chain and router, followed by a separate exact USDC TransferWithAuthorization signature for the configured payment recipient and amount. A five-task run therefore requests five task signatures and five payment signatures. The server checks authority again, and the browser verifies the execution and exact payment receipts before showing a verified result. Connecting or signing in alone does not delegate authority or authorize a payment.

We also integrate Dynamic's passkey registration and profile controls. We distinguish device authentication from on-chain executor permissions and have corrected modal keyboard focus and accessible dialog semantics. Our physical passkey enrollment, sign-in and reload acceptance test is not yet verified, so we are not claiming a proven one-tap passkey account flow. Mera is a separate optional preview, not part of this Dynamic integration.

Historical paid-task receipts and code demonstrate the transaction path, while the current no-wallet demonstration shows the live Dynamic authentication UI and public application evidence. At the latest readiness audit, MetaMask still blocked the domain, Dynamic's Sandbox display name needed administrator correction, the existing daemon was unhealthy, and Agent #2's executor grant had expired. Reviewers should not bypass that wallet warning or be promised a fresh paid run until those gates are resolved.

Live app: https://monad-astheris.vercel.app/
Shared Dynamic integration: https://github.com/willy264/monad-astheris/blob/main/frontend/components/WalletSession.tsx
Guided wallet onboarding: https://github.com/willy264/monad-astheris/blob/main/frontend/components/AgentOnboarding.tsx
Task/payment signing: https://github.com/willy264/monad-astheris/blob/main/frontend/lib/demo-client.ts
Authentication verification and limitations: https://github.com/willy264/monad-astheris/blob/main/frontend/docs/authentication-verification.md
Verified historical receipts: https://github.com/willy264/monad-astheris/blob/main/submission/2026-10-11/verified-transactions.md
```

Source map: [shared session](../frontend/components/WalletSession.tsx), [wallet access](../frontend/components/WalletAccess.tsx), [onboarding transactions](../frontend/lib/onboarding-client.ts), [task wallet](../frontend/components/DemoWallet.tsx), [signing implementation](../frontend/lib/demo-client.ts), [authorization domains](../frontend/lib/demo-protocol.ts). SDK integration is demonstrated; every supported external wallet, Dynamic embedded-wallet creation and every physical authenticator are not claimed as tested.

## Truthful answers for the four unsupported selections

Prefer removing these selections rather than submitting incomplete descriptions. If keeping an internal draft while developing them, the accurate status answers are:

**Chainlink CRE:** “Aetheris currently implements and tests a CRE-compatible validation receiver with forwarder and workflow authorization, output/request binding, freshness checks and replay protection. We have not implemented or successfully simulated a CRE orchestration workflow, nor deployed one to a DON. Therefore this receiver alone does not yet satisfy this bounty, and we do not have the required successful CRE CLI simulation or deployment video.” See [receiver guide](../contracts/CRE.md), [receiver](../contracts/src/ValidationRegistry.sol) and [local receiver tests](../contracts/test/CREValidation.t.sol).

**Privy:** “Aetheris currently uses Dynamic for authentication and wallet clients, with an optional separate Mera preview. It does not currently integrate Privy, so we are not claiming this bounty.”

**Mera account UX:** “Aetheris has an optional Mera passkey-PRF account preview that derives a standard EVM address and supports explicit router delegation. Mera is not the entire account layer: agent onboarding and task payment/signing still use Dynamic. A physical Mera ceremony and end-to-end Mera-owned agent run have not been verified. We therefore do not yet claim the complete account-layer bounty.” See [Mera UI](../frontend/components/MeraAccess.tsx), [derivation](../frontend/lib/mera-account.ts) and [synthetic-entropy interoperability test](../frontend/test/mera.test.ts).

**Mera non-account PRF:** “Our current Mera usage derives a blockchain signing account. We have not implemented a distinct PRF namespace for encryption, private storage or another non-account function. We therefore do not currently satisfy the non-account PRF requirement.”

Do not paste a general product demo into CRE's mandatory simulation field. A Solidity test, `eth_call`, mock forwarder or edited terminal output is not an official CRE CLI simulation. Leave optional video fields empty until a real accessible video URL exists; never enter a placeholder URL as completion evidence.

## Other technologies and unselected bounties

| Technology actually present | What can be said | Additional current bounty? |
| --- | --- | --- |
| Monad Testnet and ERC-8004-style registries | Four deployed contracts; deterministic CREATE2 task storage and public receipts | Fits the existing Trust, Identity & AI Infrastructure primary track. It does not automatically qualify either Mera-specific bounty. |
| x402 v2 / EIP-3009 / testnet USDC | Real payment authorization and settlement evidence; custom Rust integration | The reviewed organizer page does not list a separate x402 or Circle bounty. USDC payments alone do not establish Agora usage. |
| IPFS / Pinata | Agent metadata, published IPFS URI and Pinata upload tooling | No separate Pinata/IPFS bounty shown on the reviewed organizer page. |
| Model Context Protocol | Working read-only Monad block observer and MCP client | No separate MCP bounty shown. This is not evidence that Hunyuan, Kimi or Qwen performed inference. |
| MetaMask wallet connection | Available via Dynamic's external-wallet connector | **Not** the MetaMask “Best Agent Wallet Plugin” bounty; no Agent Wallet plugin integration exists. |
| The Graph Tally adapter | Interface/adapter work exists; real Tally settlement is not demonstrated | Do not claim Envio is The Graph, or claim live Tally usage from x402 receipts. No Graph bounty shown. |

The organizer page also lists Alchemy, Cleanverse, Kuru, Perpl, Nansen, Agora, Tencent/Hunyuan, Kimi, Alibaba/Qwen and Aurora Intents integration bounties. No corresponding meaningful implementation was found in this project. There is **no verified additional integration bounty to add now**. “Best Community Team Project” depends on the team's eligibility and participation, which the code cannot establish. Envio's free hosting for winning teams and the listed infrastructure access/credits are benefits; they are not evidence of an extra implemented integration.

## What additions would be needed?

| Candidate | Minimum meaningful addition | Why it is not a completed claim now |
| --- | --- | --- |
| CRE | A real workflow that audits a task's canonical receipt and Merkle commitment, with a trigger, external reads, deterministic checks and an integrity result; then record successful official CLI simulation or deployment | Official [simulation prerequisites](https://docs.chain.link/cre/guides/operations/simulating-workflows) require a CRE account and authenticated CLI. No CRE CLI session/workflow is available here. A read-only design can avoid private keys and broadcasting, but cannot substitute a fabricated success. |
| Mera account UX | Carry the Mera-derived wallet through registration, executor grants, task and payment signatures, account continuity and error/recovery states; verify all on a PRF-capable device | This is a substantive account-layer project, not an environment toggle. Existing Dynamic transaction evidence cannot prove Mera ownership/signing. |
| Mera non-account PRF | A useful feature such as encrypted task notes, using a distinct domain-separated PRF namespace, authenticated encryption and actual lock/unlock/reload tests | No such feature exists. A hash or wallet-key derivation relabeled as encryption would not satisfy the stated purpose. |
| Privy | A real Privy-authenticated wallet path used by a meaningful product feature, with configured provider and actual signing/onboarding evidence | Adding a dependency or a second unused login button is insufficient and would complicate the current account model. |

For a future read-only CRE workflow, a bounded cron handler could use CRE's HTTP capability to retrieve one configured historical task, read its Monad receipt and router state, check the chain/router/events/root/count and emit an integrity report. It must use actual public responses and fail on disagreement. This avoids assuming Monad has a production CRE forwarder; it does not demonstrate DON delivery into the current receiver. Official references: [CRE simulation](https://docs.chain.link/cre/guides/operations/simulating-workflows), [TypeScript SDK](https://github.com/smartcontractkit/cre-sdk-typescript), and [supported networks](https://docs.chain.link/cre/supported-networks). No workflow or simulation was added in this audit.

## Silent sponsor video shots — each under two minutes

Use actual captured screens with concise captions and no voice-over. Existing receipts must be labelled **historical on-chain evidence**, and code views must be labelled **implementation**, rather than implying that the recording created a transaction. The wallet-security gate remains in force: opening the public authentication modal is not a wallet connection; do not sign, enroll a device or submit a payment to make a more impressive recording.

**Envio (target 90–110 seconds):**

| Time | Screen and caption |
| --- | --- |
| 0:00–0:12 | Live Agent Directory and source banner: “Envio HyperIndex powers agent history on Monad Testnet.” |
| 0:12–0:28 | Registry/router event config and handler code: “Registration, shard creation and execution become indexed entities.” |
| 0:28–0:48 | Sanitized actual GraphQL query and response from the evidence or a fresh read: highlight the same agent ID, shard and transaction hash used next. Do not show access headers or environment files. |
| 0:48–1:08 | Live shard visualizer, scroll bounded lane grid, select that shard: “These are indexed task records, not simulated lanes.” |
| 1:08–1:28 | Merkle row and the matching commitment receipt/root: “Indexed root and leaf count match the on-chain commitment.” |
| 1:28–1:45 | Evidence ledger and repository: “Independent verification: 22 historical task lanes / 22 matching commitments at the October 11 audit.” Use current counts if freshly checked; keep the timestamp clear. |

**Dynamic (target 90–110 seconds):**

| Time | Screen and caption |
| --- | --- |
| 0:00–0:15 | Live app's sign-in control opens the actual Dynamic modal: “Dynamic provides the shared authentication and wallet session.” No wallet is connected. |
| 0:15–0:30 | Public modal options; close it and show guided onboarding steps: “The wallet becomes the agent owner; executor authorization is separate.” |
| 0:30–0:48 | `WalletSession.tsx` and `AgentOnboarding.tsx`: highlight the provider, chain 10143 and `primaryWallet.getWalletClient()`. Label this an implementation view. |
| 0:48–1:08 | `demo-client.ts`: highlight task and payment `signTypedData` calls. Caption: “One task signature + one exact USDC payment signature per task.” |
| 1:08–1:25 | Existing explorer execution/payment evidence and indexed agent: “Historical paid-task receipts; this recording submits no transaction.” |
| 1:25–1:45 | End card with repository and limits: “Physical passkey acceptance remains unverified. Fresh wallet testing resumes after security/provider and daemon readiness gates clear.” |

The Dynamic no-wallet video demonstrates real UI plus code and historical evidence; it is **not** a newly recorded authenticated signing session. The optional video field allows this limitation to be stated plainly. A stronger end-to-end signing recording requires the outstanding gates and explicit transaction authorization.

The recording deliverables are `submission/2026-10-11/bounty-videos/envio-demo.mp4` and `submission/2026-10-11/bounty-videos/dynamic-demo.mp4`; recording and playback verification are tracked separately from this evidence audit. These are local files, not hosted video URLs. No authenticated Loom or Vimeo upload session is available, so an actual accessible HTTPS upload link is still needed before completing the portal video field. Do not paste a filesystem path as a video URL. See the [submission kit](../submission/2026-10-11/submission-package.md) for the main technical and pitch videos, which are separate portal fields.

## Completed recordings and layout update (October 12)

The [Envio MP4](../submission/2026-10-11/bounty-videos/envio-demo.mp4) is 96.21 seconds; the [Dynamic MP4](../submission/2026-10-11/bounty-videos/dynamic-demo.mp4) is 69 seconds. Both are silent, captioned, full-file-decoded H.264 recordings under the two-minute limit. The shot lists above are planning guides; recording manifests in the [video package](../submission/2026-10-11/bounty-videos/README.md) record the actual scenes and timing. The package also contains exact titles, descriptions and upload instructions. Hosted Loom/Vimeo URLs remain outstanding.

The shard map now has a bounded, keyboard-accessible scroll area. The shared navbar sticks to the top on all three pages, and measured header height keeps anchors visible on desktop and mobile. The production build and four GitHub CI jobs passed for UI commit `f1e97db`; the production layout recheck passed 39 checks, with the initial notification-test timing failures retained in its report. No sponsor integration code was added to imply eligibility for the unsupported categories.

## Changes made by this audit

Added this sponsor-by-sponsor evidence map, two complete paste-ready answers, accurate status text for the four unsupported selections, additional-bounty assessment, development scope and silent recording shot lists. No portal selections, accounts, permissions, signatures or contract state were changed. No sponsor integration was invented, and no user-provided screenshot was treated as proof of a successful device or CRE ceremony.
