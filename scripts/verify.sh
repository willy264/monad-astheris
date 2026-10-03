#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
(cd contracts && forge test && forge fmt --check)
node scripts/check-interfaces.mjs
(cd daemon && cargo check --locked --jobs 2 && cargo test --locked --jobs 2)
(cd indexer && pnpm install --frozen-lockfile && pnpm codegen && pnpm typecheck && pnpm test)
(cd scripts && pnpm install --frozen-lockfile && pnpm typecheck && pnpm test)
(cd frontend && pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm build)
