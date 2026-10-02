# Verification record

Generated and checked on 2026-10-02 in the supplied Windows workspace.

| Check | Result |
| --- | --- |
| Foundry 1.8.4, Solidity 0.8.24: `forge test --threads 1` | 22 passed; 0 failed; 0 skipped. Two fuzz tests ran 256 cases each. |
| `forge fmt --check` | Passed. |
| `node scripts/check-interfaces.mjs` | 27 frontend, Rust and indexer declarations match compiled Solidity ABIs. |
| Rust: `cargo check --locked --offline --jobs 1` | Passed with no compiler warnings/errors. |
| Rust: `cargo fmt -- --check` | Passed. |
| Rust: `cargo test --locked --offline --jobs 1` | 13 passed; 0 failed. Covers shared cryptographic vectors, authorization, payment receipts, persistent replay protection and broadcast recovery safeguards. |
| Indexer: `pnpm test` | 2 passed; 0 failed. Includes incremental trees through 257 leaves and shared cryptographic vectors. |
| Indexer TypeScript syntax diagnostics | 0 errors. This is not a full generated-type check. |
| Indexer `config.yaml` validation against Envio 3.12.1's published JSON schema | Passed. |
| Envio code generation/full generated-type check | Blocked in this environment: no native Windows addon; Ubuntu/WSL startup failed with `HCS_E_CONNECTION_TIMEOUT`. Run under Linux/macOS or working WSL2. |
| Frontend dependency installation | Completed; pinned dependencies and pnpm lockfile present. |
| Frontend: `pnpm typecheck` | Passed. |
| Frontend: `pnpm build` | Passed with no build warnings. Three dashboard pages prerendered; two API routes built. |
| Production browser/API smoke | Passed: all three pages at 1440px and 390px, navigation works, no horizontal overflow, zero JavaScript exceptions. Unconfigured agent API returns 503; invalid pagination returns 400. Overview API returned 200 with real Monad Testnet block/throughput data. |

No contracts were deployed and no paid task was submitted. Live passkey enrollment, wallet signing, payment settlement, hosted GraphQL indexing and Monad scheduler performance require configured external services or credentials and were not established by these local checks. The contracts' write-set tests verify storage isolation, not parallel scheduler behavior. TEE statements require trusted attestation verifiers; Graph Tally settlement requires the documented adapter to a real escrow/aggregation deployment.

Browser screenshots and the machine-readable smoke report are retained locally under `frontend/.smoke/` (ignored by Git). Desktop and mobile overview screenshots were also visually inspected. The production preview used read-only public RPC requests; it did not write to the chain.

The read-only RPC latency probe completed three requests against Monad Testnet, with approximately 5.26 seconds median and 8.89 seconds p95 from this host. These are local network/provider timings, not chain execution or block-time measurements.
