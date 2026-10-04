# Register the Aetheris Monad Observer

This package prepares an ERC-8004 Agent Card, pins it to public IPFS through Pinata, and registers its URI on the deployed Monad Testnet identity registry. The observer exposes the read-only MCP tool `get_monad_block` at `https://monad-astheris.vercel.app/api/mcp`; it reports the latest block number, hash, timestamp and transaction count.

Registration creates an identity for those declared capabilities. It does not execute paid tasks, delegate an executor, submit feedback, generate hardware attestations or prove an external AI model ran. `x402Support` stays `false` for this free read-only service.

## Install and configure

Use **Node.js 22 or newer** and **pnpm 10.32.1**. From the repository root:

```sh
cd scripts
pnpm install --frozen-lockfile
cp -n .env.example .env
pnpm typecheck
```

On PowerShell, use `if (-not (Test-Path .env)) { Copy-Item .env.example .env }` for the copy step. Preserve an existing environment file. Keep `.env` local. The package pins Viem 2.57.2, MCP SDK 1.32.0, Zod 4.3.6, TSX 4.21.0 and TypeScript 5.9.3; the official MCP client dependency also supports reproducing the endpoint verification.

| Variable | Purpose |
| --- | --- |
| `MONAD_RPC_URL` | Monad Testnet RPC; chain ID must be `10143`. Defaults to the public testnet endpoint. |
| `AGENT_OWNER_PRIVATE_KEY` | Funded registration signer: `0x` followed by 64 hex characters. Required for registration; never publish it. |
| `AGENT_OWNER_ADDRESS` | Optional public address for preparing a card without loading its private key. It must match the eventual signer. |
| `AGENT_NAME` / `AGENT_DESCRIPTION` | Public profile text describing the actual observer service. |
| `AGENT_CAPABILITIES` | Comma-separated declared capabilities. The supplied endpoint supports `get_monad_block`. |
| `MCP_ENDPOINT` | Public HTTPS Streamable HTTP endpoint placed in the Agent Card; no user information, query string or fragment. |
| `AGENT_IMAGE_URL` | Optional public HTTPS image URL placed in the card's `image` field; no user information, query string or fragment. Empty omits the field. The default is the separate Aetheris PNG logo. |
| `AGENT_SERVICE_X402_SUPPORT` | Keep `false` for the free observer endpoint. |
| `PINATA_JWT` | Pinata credential permitted to upload public files. Used locally for pinning. |
| `IPFS_GATEWAY` | HTTPS gateway used to retrieve and compare the pinned JSON bytes; defaults to `https://gateway.pinata.cloud/ipfs/`. Explicit configuration takes precedence. |

Use the intended agent owner, with enough testnet MON for registration gas. The command reads the signing key from the local environment; it does not generate or fund a wallet. Keep this account separate from daemon relayers if you later use it to sign paid tasks.

The MCP and image URLs are published verbatim in the public IPFS card. Use endpoints that require no credentials, including access keys embedded in URL paths. Preparation rejects URL user information, query strings and fragments; it cannot identify a secret hidden inside an otherwise valid path. Inspect all card fields before pinning.

The `register` step requires `contracts/deployments/10143.json` with status `live-verified`, chain ID `10143`, all four contract addresses and matching deployment records, transaction hashes and runtime hashes. A placeholder address list is insufficient. Publish or supply the verified deployment manifest before running registration; `prepare` and `pin` can run before it is available.

## Prepare, inspect, pin and register

```sh
pnpm agent-card prepare
```

Inspect `scripts/.state/agent/card.json` before publishing. It contains the ERC-8004 registration type, service endpoint, capabilities, optional image and the public owner wallet. Ensure these describe the deployed service. Preparation does not call MCP or validate its advertised behavior; verify the live endpoint independently before publishing the card. A plain browser GET is not an MCP tool invocation.

```sh
pnpm agent-card pin
```

This uploads the JSON through Pinata's public-files endpoint, saves the CID, retrieves it through the configured gateway and compares the bytes by Keccak hash. Pinata credentials are sent only to Pinata. The public card contains no private key or token.

```sh
pnpm agent-card register
```

This checks chain ID, simulates `register(string)`, prepares and signs one transaction, journals the exact signed bytes before broadcasting, and waits for 12 confirmations. It verifies the expected `Registered` event, current identity owner, wallet, token URI and canonical block hash before exporting `contracts/deployments/10143.agent.json`.

`pnpm agent-card all` combines the three operations for a fresh identity and performs publication plus an on-chain transaction. Use the separate commands when you need to inspect the public card first. Do not run `all` after pinning or after registration has started; continue with `pin` or `register` as appropriate.

## Preserve state and resume safely

| File | Meaning |
| --- | --- |
| `scripts/.state/agent/card.json` | Exact prepared Agent Card bytes. |
| `scripts/.state/agent/pin.json` | CID, content hash and gateway verification state. |
| `scripts/.state/agent/registration.json` | Durable registration intent, signed raw transaction, transaction hash and confirmation state. Treat it as sensitive local operational state. |
| `scripts/.state/agent/operation.lock/` | Exclusive local operation lock. An interrupted process can leave it behind. |
| `contracts/deployments/10143.agent.json` | Public verified registration evidence; excludes private keys and signed raw transactions. |

`.env`, `.state/` and `.artifacts/` are ignored. Do not commit the local journal, copy it into submission evidence or clear it merely to force a new registration.

If gateway retrieval fails after a CID was saved, rerun `pin`; the saved content hash prevents silently replacing the card. If registration times out, preserve the journal and rerun `register`. The command verifies the saved transaction's chain, recipient, calldata, value, signer and hash. It checks whether the transaction is known and whether the signer's pending nonce advanced before an identical signed transaction may be rebroadcast. It does not create a fresh registration automatically after an ambiguous broadcast.

If a process was interrupted and left `operation.lock`, inspect its saved state and confirm no other operation is running before removing that exact lock directory. A changed owner, card, deployment, consumed nonce or reverted transaction requires operator reconciliation. Pinata upload ambiguity before a CID is returned can still require checking the provider; an absent pin journal is not proof that no upload occurred.

After a successful run, use the exported agent ID, URI and real transaction hash as evidence. Check the public card and directory against that evidence. A registered identity alone is not a completed paid-task demonstration.

## Task and deployment tools

See [the operation runbook](README.md) for the integrated deployment, paid task submission, proof collection and verification commands.

## Verify the deployed MCP service

```sh
pnpm verify-mcp https://monad-astheris.vercel.app/api/mcp
```

This read-only check uses the official SDK to initialize, list and call `get_monad_block`, then compares the returned chain and exact block against Monad RPC lookups by both number and hash. It loads no environment files or signing credentials and saves its report under `scripts/.artifacts/mcp/`. Reports describe the observation time; latest blocks can reorganize. A successful check does not submit a paid Aetheris task.
