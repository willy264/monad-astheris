# Dependency security maintenance

The integration updates Next.js to **15.5.27**, a supported maintenance release containing the [September 2026 security fixes](https://nextjs.org/blog/september-2026-security-release). Next.js 14 is outside the [supported release lines](https://nextjs.org/support-policy). React remains 18.3.1, which is accepted by the published Next.js 15.5.27 and Dynamic peer ranges. The dynamic task-status route awaits its route parameters for Next.js 15.

Dynamic's two direct packages remain at the previously tested 5.9.2 release; the security changes target their affected transitive dependencies. Keep these two SDK versions aligned when upgrading. The unused Wagmi package and its vulnerable legacy URI-decoding dependency are removed; wallet access continues through Dynamic's Ethereum connectors and Viem. Compatible security updates pin PostCSS 8.5.28, Axios 1.20.0, the affected WebSocket 8.x dependencies to 8.22.0, UUID 11.1.1 for older versions, and HTTP Cache Semantics 4.3.0. UUID 11 preserves CommonJS exports needed by existing consumers. TSX 4.23.15 uses the patched esbuild 0.28 line.

## Explicit dependency patches

Some transitive dependencies have no compatible published security fix. The committed `pnpm.patchedDependencies` entries apply the following narrow mitigations during installation. These are local patches, not upstream releases. The lockfile records their hashes; preserve the `patches/` directory and use `pnpm install --frozen-lockfile`.

| Package and advisory | Local change | Compatibility boundary |
| --- | --- | --- |
| `bigint-buffer@1.1.5` — [native buffer overflow](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg) | The Node entry uses the package's existing JavaScript conversion implementation and never loads the vulnerable native addon. | Exact endian conversion is preserved; native acceleration is unavailable. The native build script also remains outside the allowed build list. |
| `braces@3.0.3` — [recursive stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Parser and recursive AST walkers reject nesting beyond 256 levels. | Ordinary glob syntax is preserved. Extremely nested string patterns and caller-supplied ASTs raise a controlled `RangeError`. |
| `stream-json@1.9.1` — [filter nesting denial of service](https://github.com/advisories/GHSA-528h-pc64-c93x) | Filter path matching rejects nesting beyond 256 levels through the stream error callback before repeatedly rebuilding deep paths. | Ordinary filters and stream APIs remain intact; excessively nested paths being matched fail. Subtrees already selected for direct pass/skip keep their streaming behavior without repeatedly rebuilding paths. This avoids forcing the incompatible ESM version 3 API into Jayson 4. |

Run `pnpm test` to verify the application tests and the security regressions in `test/dependency-security.test.mjs`. The tests cover ordinary inputs, deep patterns and direct ASTs, exact large integer conversions without native bindings, and streamed filter errors.

`pnpm audit` evaluates upstream package versions and can continue reporting the three patched packages. No advisory is suppressed or ignored. A passing regression suite is evidence for these specific mitigations, not a claim that the dependency graph has no possible vulnerabilities. Review upstream releases regularly and remove each local patch when a compatible upstream fix is installed and tested.

The Dynamic connector graph may still emit peer-version warnings from its bundled providers. Do not force unrelated cryptographic provider majors merely to silence those warnings; confirm real passkey and wallet operations against the configured Dynamic environment after deployment.
