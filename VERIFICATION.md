# Verification record

Updated on 2026-10-04 in the supplied Windows workspace. The four contracts now have verified live Monad Testnet deployments. Earlier frontend build, browser, script and Linux Envio checks remain dated below; they were not all rerun for the daemon startup fix.

| Check | Result |
| --- | --- |
| Foundry 1.8.4, Solidity 0.8.24: `forge test --threads 1` | 38 passed; 0 failed; 0 skipped. Includes 15 CRE receiver tests and router validation-registry linkage coverage. Two fuzz tests ran 256 cases each. |
| `forge fmt --check` | Passed. |
| `node scripts/check-interfaces.mjs` | 61 frontend, Rust, indexer and operation-script declarations match compiled Solidity ABIs, including the browser demo's CREATE2 address prediction. |
| Rust: `cargo check --locked --offline --jobs 1` | Passed with no compiler warnings/errors. |
| Rust: `cargo fmt -- --check` | Passed. |
| Rust: `cargo test --locked --offline --jobs 1` | Rerun on 2026-10-04: 17 passed; 0 failed. Includes four new configuration/port/redaction regression tests. `cargo check` also passed. |
| Scripts: `pnpm typecheck` and `pnpm test` | Passed; 17 tests. Covers MCP invocation, EIP-712 binding, bounded x402 authorization, exact payment nonce/transfer evidence, durable signer recovery, reviewed feedback, exclusive deployment reservation and complete Merkle reconstruction. |
| Deployment simulation and broadcast | Passed on 2026-10-04 using `scripts/deploy.ts`: four successful contract creations and the reputation-router linkage transaction. All five receipt blocks are finalized. [Live manifest](contracts/deployments/10143.json) verifies creation code, compiler settings, five links and owner/committer roles. |
| Indexer: `pnpm test` | 2 passed; 0 failed. Includes incremental trees through 257 leaves and shared cryptographic vectors. |
| Indexer TypeScript syntax diagnostics | 0 errors. This is not a full generated-type check. |
| Indexer `config.yaml` validation against Envio 3.12.1's published JSON schema | Passed. |
| Envio code generation/full generated-type check | Fresh generation, full typecheck and 2 tests passed on Ubuntu/Node 24: [CI run 37158285726](https://github.com/willy264/monad-astheris/actions/runs/37158285726), source 916ee37f29e43473e01ff18947cda69f1cee6311. The earlier run 37099687709 also passed. Native Windows still lacks the addon; the new WSL probe starts successfully but lacks native Node. |
| Frontend dependency installation | Completed; pinned dependencies and pnpm lockfile present. |
| Frontend: `pnpm typecheck` | Passed again on 2026-10-04. |
| Frontend: `pnpm test` | 18 passed. Includes the previous GraphQL, Mera and delegation checks, 8 signed-demo/payment/recovery tests, and 3 metric-provenance checks. |
| Frontend: `pnpm build` | Passed with no build warnings. Three dashboard pages prerendered; five API route patterns built, including the optional live demo. |
| Production browser/API smoke | Passed: all three pages at 1440px and 390px, navigation works, no horizontal overflow, zero JavaScript exceptions. Enabled Mera controls, source labels and Merkle panels rendered. Unconfigured agent API returns 503; invalid pagination returns 400. Overview returned real Monad Testnet block/throughput data through labeled RPC fallback. No passkey ceremony was attempted. |
| `pnpm submission-proof` | Generated root SUBMISSION_PROOF.md with explicit live-data blockers. No deployed addresses, task hashes or GraphQL results were fabricated. |

The four contracts were deployed on 2026-10-04; no paid task has been submitted. Live agent registration, passkey enrollment, wallet task signing, payment settlement, hosted GraphQL indexing and CRE delivery still need their actual configuration and evidence. The task client implements x402 exact/EIP3009; the daemon's Graph Tally mode requires its documented external receipt/escrow adapter. No native TEE verifier or official Monad CRE forwarder is assumed. The contracts' write-set tests verify storage isolation, not parallel scheduler behavior.

Browser screenshots and the machine-readable smoke report are retained locally under `frontend/.smoke/` (ignored by Git). Desktop and mobile overview screenshots were also visually inspected. The production preview used read-only public RPC requests; it did not write to the chain.

The read-only RPC latency probe completed three requests against Monad Testnet, with approximately 5.26 seconds median and 8.89 seconds p95 from this host. These are local network/provider timings, not chain execution or block-time measurements.

## Judge-facing frontend verification, 2026-10-03

The final judge-experience source passed typechecking, 18 frontend tests, the production build and the 61-declaration ABI check. Contract and daemon source did not change in this enhancement; their results above belong to the preceding integration verification.

The production browser smoke passed **40 checks** on the overview, directory and visualizer at 1440px and 390px. It exercised comparison switching by click and keyboard, animation pause, reduced motion, tooltip focus/Escape/touch and viewport positioning, guided sign-in preview and all five simulated progress bars. There was no horizontal overflow and no JavaScript exception. Desktop and mobile screenshots were visually inspected.

Deliberate outage and zero-value responses were injected only into the isolated test browser. Samples retained visible labels; real zero values did not turn into examples. Live event tables never acquired fabricated activity or transaction links. The actual overview also read public Monad Testnet data. API checks confirmed unavailable live-demo configuration, invalid request IDs/pagination and rejection of an unsigned cross-origin submission.

Evidence is retained locally in ignored `frontend/.smoke/report-judge.json`, `browser-judge.mjs` and `judge-*.png`; fixture screenshots have explicit `fixture-outage` or `fixture-zero` suffixes. The preview completed without a wallet, payment or blockchain write. No Dynamic ceremony, funded five-task dispatch, payment settlement or deployed contract data was exercised. These still need the documented service configuration and live receipts.

The requested 1,200ms delay, 100% efficiency and 300ms settlement figures are explicitly illustrative. Browser checksum tasks demonstrate task routing and payment when live services are configured; actual MCP invocation remains in the separate task client.

## Submission retry and branding verification, 2026-10-03

The resumed deployment command, `pnpm run deploy` from `scripts`, stopped at `PRIVATE_KEY is required` before simulation or broadcast. At that check no component environment files or relevant signing/provider credentials were configured. Ignored local `.env` templates were subsequently prepared from the examples, without generating keys or supplying invented service values. Live deployment, IPFS registration, paid execution, passkey ceremonies and GraphQL indexing remain unverified. `SUBMISSION_PROOF.md` was regenerated with those blockers.

The fresh verification pass completed 38 Foundry tests, Rust compilation and all 13 Rust tests, scripts typechecking and 17 tests, frontend typechecking and 18 tests, a clean production build, and the 61-declaration ABI check. [Ubuntu CI run 37158285726](https://github.com/willy264/monad-astheris/actions/runs/37158285726) independently restored pinned dependencies, generated Envio types, completed the full typecheck and passed both Merkle tests at source `916ee37`. Generation does not configure or run a live GraphQL deployment.

The original Aetheris logo now appears in navigation and the README, with a transparent 1024px PNG, editable SVG, 512px app artwork, a 16/32/48/64px ICO and a 180px Apple icon. The mark was drawn from original vector geometry and rasterized with Pillow; no external image-generation API was used. [Brand assets](frontend/docs/brand.md) lists the downloadable files.

A focused production browser run passed **32 checks** across all three pages at 1440px and 390px. It verified visible SVG loading and the accessible home link, one favicon and one Apple metadata declaration, served image bytes/dimensions, the explicitly illustrative 12-re-execution scenario, five parallel lanes and the retained live ledger. There was no horizontal overflow or JavaScript exception. The favicon contained all four expected sizes, and PNG transparency was checked. Desktop overview and mobile comparison screenshots were visually inspected.

This new run is separate from the earlier 40-check judge-flow run. Its local ignored evidence is `frontend/.smoke/brand-report.json`, `browser-brand.mjs` and `brand-*.png`. It made no paid task or blockchain write. The comparison's retry count and performance figures remain illustrations, not live scheduler measurements.

## Render startup and live deployment, 2026-10-04

The reported bare `odd number of digits` startup error originates from malformed router-address parsing. The daemon now names invalid router and relayer environment settings without logging supplied values. It honors Render's `PORT` on `0.0.0.0` unless `LISTEN_ADDR` is explicitly set. `cargo check`, `cargo fmt --check`, all 17 Rust tests, all 38 Foundry tests (including two 256-case fuzz runs), and frontend typechecking passed. No live Render deployment has been verified from this workspace.

After a successful simulation, the previously authorized testnet deployment used the configured signer `0x5D8853E81F580A12e3Affaa9a7c76E0A65E02F57`. Five successful transactions consumed **1.044846111010144137 testnet MON** in gas. The finalized balance observed after deployment was **13.955153888989855863 MON**. The earliest deployment block is **67972561**. The router is [`0xac4a33521b32122c9f014eac8800144dd9aa5ebe`](https://testnet.monadscan.com/address/0xac4a33521b32122c9f014eac8800144dd9aa5ebe).

The [manifest](contracts/deployments/10143.json) records the four successful canonical creation receipts, runtime code hashes, compiler/source metadata, ownership and committer roles, and verified registry linkages. Foundry's complete five-transaction receipts and broadcast intent remain in ignored local storage for recovery. Public contract settings were copied into the existing ignored daemon, task-client, frontend and indexer environment files. This does not configure Render/Vercel remotely or start the indexer. The local x402 facilitator and payment-token settings remain unconfigured, so the daemon's hosted startup and paid execution are still blocked on those real service values.
