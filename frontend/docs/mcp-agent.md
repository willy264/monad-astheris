# Monad Network Observer

Aetheris includes a small, working service for agents to inspect Monad Testnet. Its `get_monad_block` tool reads the current block from the configured RPC and returns the chain ID, block number, block hash, timestamp and transaction count. It provides factual input for research and automation; it does not run a language model or send transactions.

## Connect to the service

| Setting | Value |
| --- | --- |
| Production endpoint | `https://monad-astheris.vercel.app/api/mcp` |
| Transport | MCP Streamable HTTP, stateless JSON responses |
| Protocol advertised by the Agent Card | `2025-11-25` |
| Tool | `get_monad_block` |
| Arguments | `{}` |
| Network | Monad Testnet, chain ID `10143` |
| Authentication and payment | Public read-only access; the MCP service does not charge x402 payments |

Use an MCP client to initialize the connection, list tools, and invoke the tool. Opening the endpoint in a browser returns HTTP 405 because this service does not offer a GET event stream. A tool result is a current RPC observation, not a finality guarantee; blocks may reorganize.

The endpoint runs as a Node.js API route in the existing Vercel frontend project. It uses the server-only `MONAD_RPC_URL` setting, with the public Monad Testnet RPC as its default. No private signing key or Pinata token belongs in this service. Each request creates its own MCP transport, so it does not depend on a persistent process or session store.

The service uses the official MCP TypeScript SDK. It bounds request sizes, rejects unexpected tool arguments and browser origins, checks the RPC chain ID, and returns a tool error if an upstream read fails. It does not replace failed reads with invented blocks. Public access still consumes hosting and RPC capacity; hosting-level rate limits can be added by the operator.

## Register the service as an agent

The AgentRegistry stores an ERC-721 identity whose URI points to a public IPFS card. The card describes this tool and publishes its MCP endpoint. Signing in through Dynamic is a separate step from minting that identity.

The repository's operation tools prepare the card, upload it through Pinata, verify the retrieved bytes, and submit the registration transaction. The registration owner must have testnet MON. Configuration and signed transaction journals stay in ignored local files. After successful registration, `contracts/deployments/10143.agent.json` records the actual identity and transaction; do not guess an agent ID before its receipt is verified.

The dashboard reads the registry and IPFS card. A registered identity can therefore appear in the directory before it has executed an Aetheris task or received feedback. Registration does not produce a reputation score, a task receipt, a shard, or payment settlement.

## Use it in the Aetheris task client

Set these public service values in the task client's local environment:

```dotenv
MCP_ENDPOINT=https://monad-astheris.vercel.app/api/mcp
MCP_SERVER_URL=https://monad-astheris.vercel.app/api/mcp
MCP_TOOL_NAME=get_monad_block
MCP_ARGUMENTS_FILE=.state/mcp/observer-arguments.json
```

The arguments file contains the JSON object `{}`. The task client invokes MCP, hashes the actual input/output bytes, and can then submit those commitments to the daemon. Paid task submission additionally requires the registered agent ID, authorized signers, a funded payment token balance and valid daemon/payment settings. This MCP service and its registration alone do not establish that paid workflow.

## Local development

Run `pnpm install --frozen-lockfile` and `pnpm dev` from `frontend`. Connect an MCP client to `http://localhost:3000/api/mcp`. Run `pnpm typecheck` and `pnpm test:mcp` before deployment; the tests exercise the real SDK protocol against controlled RPC responses. Live verification separately compares the returned block with the Monad RPC.

References: [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x), [ERC-8004 identity registration](https://eips.ethereum.org/EIPS/eip-8004).
