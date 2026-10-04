# Verification record

Updated on 2026-10-03 in the supplied Windows workspace, with Envio code generation on a supported Linux CI runner. The original 2026-10-02 results are distinguished where they were not rerun.

| Check | Result |
| --- | --- |
| Foundry 1.8.4, Solidity 0.8.24: `forge test --threads 1` | 38 passed; 0 failed; 0 skipped. Includes 15 CRE receiver tests and router validation-registry linkage coverage. Two fuzz tests ran 256 cases each. |
| `forge fmt --check` | Passed. |
| `node scripts/check-interfaces.mjs` | 61 frontend, Rust, indexer and operation-script declarations match compiled Solidity ABIs, including the browser demo's CREATE2 address prediction. |
| Rust: `cargo check --locked --offline --jobs 1` | Passed with no compiler warnings/errors. |
| Rust: `cargo fmt -- --check` | Passed. |
| Rust: `cargo test --locked --offline --jobs 1` | Previously passed 13 tests on 2026-10-02; daemon source unchanged. `cargo check` was rerun successfully on 2026-10-03. |
| Scripts: `pnpm typecheck` and `pnpm test` | Passed; 17 tests. Covers MCP invocation, EIP-712 binding, bounded x402 authorization, exact payment nonce/transfer evidence, durable signer recovery, reviewed feedback, exclusive deployment reservation and complete Merkle reconstruction. |
| Deployment: `pnpm run deploy` | Stopped before any transaction: PRIVATE_KEY is not configured. No simulation or broadcast was represented as a live deployment. |
| Indexer: `pnpm test` | 2 passed; 0 failed. Includes incremental trees through 257 leaves and shared cryptographic vectors. |
| Indexer TypeScript syntax diagnostics | 0 errors. This is not a full generated-type check. |
| Indexer `config.yaml` validation against Envio 3.12.1's published JSON schema | Passed. |
| Envio code generation/full generated-type check | Passed on Linux: [CI run 37099687709](https://github.com/willy264/monad-astheris/actions/runs/37099687709), source b3b917411c73005d1aaabe4e6f6c2caf1ec90e45. Native Windows still lacks the addon. Generated declarations were downloaded from that successful run; local `pnpm typecheck` then passed too. |
| Frontend dependency installation | Completed; pinned dependencies and pnpm lockfile present. |
| Frontend: `pnpm typecheck` | Passed. |
| Frontend: `pnpm test` | 18 passed. Includes the previous GraphQL, Mera and delegation checks, 8 signed-demo/payment/recovery tests, and 3 metric-provenance checks. |
| Frontend: `pnpm build` | Passed with no build warnings. Three dashboard pages prerendered; five API route patterns built, including the optional live demo. |
| Production browser/API smoke | Passed: all three pages at 1440px and 390px, navigation works, no horizontal overflow, zero JavaScript exceptions. Enabled Mera controls, source labels and Merkle panels rendered. Unconfigured agent API returns 503; invalid pagination returns 400. Overview returned real Monad Testnet block/throughput data through labeled RPC fallback. No passkey ceremony was attempted. |
| `pnpm submission-proof` | Generated root SUBMISSION_PROOF.md with explicit live-data blockers. No deployed addresses, task hashes or GraphQL results were fabricated. |

No contracts were deployed and no paid task was submitted. No component `.env` files or relevant process credentials were present; deployment stopped at its missing-key preflight. Live passkey enrollment, wallet signing, payment settlement, hosted GraphQL indexing and CRE delivery need their actual configuration and evidence. The task client implements x402 exact/EIP3009; the daemon's Graph Tally mode still requires its documented external receipt/escrow adapter. No native TEE verifier or official Monad CRE forwarder is assumed. The contracts' write-set tests verify storage isolation, not parallel scheduler behavior.

Browser screenshots and the machine-readable smoke report are retained locally under `frontend/.smoke/` (ignored by Git). Desktop and mobile overview screenshots were also visually inspected. The production preview used read-only public RPC requests; it did not write to the chain.

The read-only RPC latency probe completed three requests against Monad Testnet, with approximately 5.26 seconds median and 8.89 seconds p95 from this host. These are local network/provider timings, not chain execution or block-time measurements.

## Judge-facing frontend verification, 2026-10-03

The final judge-experience source passed typechecking, 18 frontend tests, the production build and the 61-declaration ABI check. Contract and daemon source did not change in this enhancement; their results above belong to the preceding integration verification.

The production browser smoke passed **40 checks** on the overview, directory and visualizer at 1440px and 390px. It exercised comparison switching by click and keyboard, animation pause, reduced motion, tooltip focus/Escape/touch and viewport positioning, guided sign-in preview and all five simulated progress bars. There was no horizontal overflow and no JavaScript exception. Desktop and mobile screenshots were visually inspected.

Deliberate outage and zero-value responses were injected only into the isolated test browser. Samples retained visible labels; real zero values did not turn into examples. Live event tables never acquired fabricated activity or transaction links. The actual overview also read public Monad Testnet data. API checks confirmed unavailable live-demo configuration, invalid request IDs/pagination and rejection of an unsigned cross-origin submission.

Evidence is retained locally in ignored `frontend/.smoke/report-judge.json`, `browser-judge.mjs` and `judge-*.png`; fixture screenshots have explicit `fixture-outage` or `fixture-zero` suffixes. The preview completed without a wallet, payment or blockchain write. No Dynamic ceremony, funded five-task dispatch, payment settlement or deployed contract data was exercised. These still need the documented service configuration and live receipts.

The requested 1,200ms delay, 100% efficiency and 300ms settlement figures are explicitly illustrative. Browser checksum tasks demonstrate task routing and payment when live services are configured; actual MCP invocation remains in the separate task client.
