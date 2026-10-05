# Live testnet and submission workflow

This guide covers the combined task client, contract, dashboard and observer implementation. **Four contracts and agent #1 are already receipt-verified on Monad Testnet; the public observer MCP tool is live.** See [SUBMISSION_PROOF.md](../SUBMISSION_PROOF.md) for the actual addresses, registration transaction, IPFS card and tool output. Paid completion still requires funded authorized wallets, a compatible payment service, actual authentication/delegation checks and hosted indexing. No paid task is claimed.

Use Node **24 or newer** for the complete workspace because the Mera package requires it. The scripts package itself supports Node 22+. The [runbook](runbook.md) covers component startup and the [scripts README](../scripts/README.md) describes all client settings and recovery behavior.

## 1. Reuse the verified contracts

The [existing live manifest](../contracts/deployments/10143.json) records all four addresses and earliest block `67972561`. Reuse those contracts to continue this project. The commands below are for an intentionally separate deployment, not a prerequisite for submitting a task.

The router constructor takes `(identityRegistry, validationRegistry, admin)`. Both registry references are immutable and the constructor checks their identity consistency. The validation registry includes the optional CRE receiver; configure its trust settings separately after a real provider is selected.

Set a funded testnet `PRIVATE_KEY` in ignored `contracts/.env`. Set `MONAD_RPC_URL` to Monad Testnet, chain 10143. Remove blank optional `ADMIN_ADDRESS` and `COMMITTER_ADDRESS` entries when using defaults. From `scripts`:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm run deploy
pnpm run deploy --broadcast
```

The first command simulates; the second submits funded testnet transactions. A durable, exclusive broadcast marker prevents a second invocation from silently redeploying. A failure requires inspection of the preserved Foundry receipts and ignored `.tools/deployment/forge.log`.

Foundry writes `contracts/deployments/10143.candidate.json`, explicitly labeled a candidate. The finalizer creates `contracts/deployments/10143.json` only after checking all four deployment receipts, canonical blocks, nonempty code, exact creation bytecode/constructor arguments, compiler metadata, five registry/router links, and configured owner/committer state. It also records the earliest deployment block and source hashes. Pending two-step ownership transfers remain explicit in `roles`; the new administrator must accept them.

If broadcast succeeded but finalization was interrupted, run `pnpm finalize-deployment`. Do not delete the broadcast marker to repeat an uncertain deployment. Keep Foundry's broadcast receipts; a candidate file or a simulation log is not proof of deployment.

## 2. Reuse or register an Agent Card

Agent **1**, Aetheris Monad Observer, is already registered. Its card advertises `get_monad_block` at `https://monad-astheris.vercel.app/api/mcp`; the exact card and registration evidence are linked from [SUBMISSION_PROOF.md](../SUBMISSION_PROOF.md). Use that identity for this observer workload.

For an intentionally new agent, copy `scripts/.env.example` to ignored `scripts/.env` only if it is absent, then configure the real agent name, description, capabilities, owner address, public HTTPS MCP endpoint, optional public image, `PINATA_JWT` and funded `AGENT_OWNER_PRIVATE_KEY`.

```powershell
pnpm agent-card prepare
pnpm agent-card pin
pnpm agent-card register
```

The card declares its actual MCP endpoint and owner wallet. It does not invent an agent ID before minting. Pinning uses Pinata's public file upload endpoint, then retrieves the exact bytes through IPFS and compares their hash. A public read gateway by itself is not an upload service. Registration uses the implemented `register(string)` ABI; there is no `registerAgent(string)` method.

The tool signs and saves registration transaction bytes before broadcasting. Recovery checks the exact signer, chain, target, calldata and hash, and can resend only those identical bytes. It decodes the actual `Registered` event, checks ownership/wallet/URI, and exports `contracts/deployments/10143.agent.json`. The private registration journal stays under ignored `scripts/.state`; do not publish it.

An accessible card does not establish a working MCP service. The deployed observer has a recorded SDK initialization/tool invocation and independent block-data checks; reproduce them with `pnpm verify-mcp https://monad-astheris.vercel.app/api/mcp`. The task client below must still invoke its configured tool for each newly prepared task. The published card's wallet field is metadata; the registry's `getAgentWallet` is checked separately.

## 3. Configure authority, payment, and the task client

Copy the verified addresses and earliest block into the daemon, indexer and frontend environment files. Fund each daemon relayer with testnet MON and have the current agent owner call `setDelegate` for the selected executor. The HTTP task signer must independently be the owner or an authorized delegate. Use a signer distinct from every daemon relayer to avoid competing transaction nonces.

Configure a real x402 v2 `exact` facilitator supporting EIP-3009 on chain 10143, the compatible payment token/domain, price and receiver. The client independently pins the asset, recipient, maximum amount, validity and task URL; it does not accept arbitrary payment requirements from a server. Start the daemon from its directory with `cargo run --locked --release --jobs 1` and verify `/health` and `/v1/config`.

For the existing observer use `AGENT_ID=1`, `MCP_SERVER_URL=https://monad-astheris.vercel.app/api/mcp`, `MCP_TOOL_NAME=get_monad_block` and a JSON argument file containing `{}`. This tool returns real block metadata and does not perform AI inference. Its free read (`x402Support: false`) is separate from the daemon's paid task-routing service. Configure the task signer, executor, registry, daemon and independently pinned payment-policy variables. Then, from `scripts`:

```powershell
pnpm submit-task --run-dir .state/tasks/first-run
```

The client invokes the actual MCP tool, stores exact canonical input/output bytes and hashes, signs the daemon's EIP-712 message, obtains and validates the 402 challenge, and posts to **`/v1/tasks`**. It verifies creation/execution receipts, CREATE2 salt/address, task commitments, the payer's token transfer and the EIP-3009 authorization nonce. It automatically records the completed shard in `ReputationRegistry`.

Feedback is optional and requires both an eligible independent `REVIEWER_PRIVATE_KEY` and a reviewed assessment file bound to the task/output. The script sends that explicit assessment; it does not derive a positive quality score merely from execution success. Use `--prepare-only` to inspect the output before making an assessment, then continue the same run with `--resume`.

An interrupted paid POST resumes through status queries rather than minting another payment authorization. Ambiguous MCP calls are not repeated. Preserve all journals. The [client documentation](../scripts/README.md) describes the recovery states and per-signer transaction protection.

The daemon retains its custom Graph Tally mode, but this new client implements the x402 EIP-3009 path. A Graph Tally client/adapter and real escrow service remain separate requirements if that mode is included in the demonstration.

## 4. Enable the sponsor integrations actually used

| Integration | Implemented | Live evidence still needed |
| --- | --- | --- |
| Dynamic | Existing passkey actions, wallet connection and expiring executor delegation | Configured Dynamic environment/origin, actual enrollment/sign-in and funded grant/revoke receipts |
| Monad Mera | Separate PRF-backed passkey account and scoped delegation flow; enabled with `NEXT_PUBLIC_MERA_ENABLED=true` | PRF-capable authenticator, stable secure origin, funded derived EOA and a successful delegation ceremony |
| Envio | Deployment-scoped entities, sync progress, GraphQL reads, independent roots and commitment comparisons | Hosted/local-running indexer with the actual deployment and task events |
| Chainlink CRE | ERC-165 `onReport` receiver with forwarder/workflow authorization, request/output/domain/time binding and replay protection | Supported target network and official forwarder, real workflow deployment and a delivery transaction |
| Reputation | Automatic completion record and explicitly reviewed feedback through the task client | Real completion/feedback receipts and directory result |

Mera derives a secp256k1 EOA through passkey PRF; Dynamic and Mera are separate authentication paths. Neither integration means this application accepts arbitrary raw P-256 signatures in the daemon. See the [frontend README](../frontend/README.md) for the actual SDK behavior and [CRE.md](../contracts/CRE.md) for the exact report ABI, workflow metadata and trust configuration.

No production CRE forwarder on Monad is assumed. Keep the adapter disabled until the network/provider configuration is established. Sponsor eligibility and prize amounts are organizer decisions; adding a library or receiver alone does not establish bounty qualification.

## 5. Run the indexer and dashboard against the same deployment

Envio's fresh code generation, generated-type checking and both Merkle tests passed on the [Linux CI runner](https://github.com/willy264/monad-astheris/actions/runs/37158285726) at source `916ee37`. Native Windows still lacks its native addon. Use a Linux/macOS/working WSL host or Envio Cloud for runtime indexing.

Set `ENVIO_AGENT_REGISTRY_ADDRESS`, `ENVIO_ROUTER_ADDRESS` and `ENVIO_START_BLOCK`, then follow the indexer README. The default local GraphQL endpoint is port 8081; the daemon uses 8080.

In `frontend/.env.local`, set the three public contract addresses and `DEPLOYMENT_BLOCK`. Set server-only `ENVIO_GRAPHQL_URL` and, if needed, `ENVIO_GRAPHQL_ADMIN_SECRET` or `ENVIO_GRAPHQL_TOKEN`. An absent endpoint selects labeled RPC fallback; a configured but failing endpoint produces a visible error. GraphQL requests are constrained to the configured chain, router and identity registry.

The dashboard shows indexed progress, actual activity/shards and matching indexed batch commitments. Enable the daemon batch worker and authorize its first relayer as router committer to produce real roots. An indexed `verified` flag is a consistency check, not evidence that arbitrary computation is correct. The proof collector separately rebuilds the full block's root from RPC logs.

From `frontend`, run `pnpm typecheck`, `pnpm test`, `pnpm build`, then `pnpm start`. Public variables, including Mera/Dynamic settings, require rebuilding when changed.

## 6. Collect the submission evidence

Set scripts `TASK_PROOF_PATH` to the client's `client-proof.json` and configure its Envio endpoint. To publish a sample task signature, first wait until the task authorization is expired on both the local clock and chain, then run:

```powershell
pnpm submit-task --run-dir .state/tasks/first-run --resume --export-proof
pnpm submission-proof
```

Proof export rechecks receipts and performs no additional reputation/feedback transactions. It never exports payment credentials or active task signatures. The proof collector writes the generated report `submission/LIVE_CHECKS.md`, with actual explorer links, typed task data, and the GraphQL output when present. Root `SUBMISSION_PROOF.md` remains a curated record of the independently verified deployment, registration and MCP evidence. Review the generated report before adding new results to that record; a missing service remains an explicit blocker. It checks the registration/task identity, canonical receipts, token transfer/authorization nonce, complete task-block Merkle tree and on-chain batch. Missing evidence stays marked blocked/unverified. It does not create a fake live manifest.

The GitHub repository is public, so the review email can read it without an invitation. If organizers require collaborator access, obtain their actual GitHub username and required role; an email alone cannot identify the account. No invitation has been sent. The feature branches are being integrated under the current request to synchronize the repository. Cite the final checked commit in the submission; do not treat an earlier branch preview as proof of the integrated release.

Primary integration references: [Monad Testnet](https://docs.monad.xyz/developer-essentials/testnet), [Pinata public upload API](https://github.com/PinataCloud/pinata/blob/main/ai-instructions), [Chainlink CRE consumer contracts](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts). SDK-specific primary links are recorded in the component READMEs.
