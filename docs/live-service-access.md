# Connect the live verification services

These settings unlock the remaining paid-task and indexing checks. They do not by themselves establish successful payment, task execution or settlement. Instructions checked against provider documentation on 2026-10-07.

## Render account management access

Open the Render dashboard, go to **Account Settings**, find **API Keys**, and create a key. Save its value under `RENDER_API_KEY` in your local `daemon/.env`. The daemon ignores this additional setting; local operator tooling uses it to coordinate the hosted service. It is not required as an environment variable on the deployed Render service, and must not be placed in frontend configuration or committed to Git.

Render shows the full key only when it is created. See [Render API setup](https://render.com/docs/api). The relevant service is `https://monad-astheris-daemon.onrender.com`.

Management access is needed because Agent #1's owner is also the daemon relayer. Owner grant/revoke and validation-request transactions need exclusive signer use. Coordinate service state and preserve its payment journal before using that key from another process. This does not require changing the service plan automatically; persistent storage and recovery remain separate unresolved hosting requirements.

## Envio GraphQL endpoint

`ENVIO_GRAPHQL_URL` is the query URL of a deployed indexer. It is distinct from the Monad RPC URL, the Render task URL and an Envio account/API token.

1. Open the [Envio dashboard](https://envio.dev/app) and sign in with GitHub.
2. Install/connect the Envio Deployments GitHub App for `willy264/monad-astheris`.
3. Add an indexer named `aetheris` using root directory `indexer`, config file `config.yaml`, and deployment branch `main`. Choose the development tier for this testnet setup.
4. In the indexer's environment settings, set the four public values below. They are the exact values used by this repository's `indexer/config.yaml`.
5. Deploy and wait for indexing to become healthy. Copy the deployment's GraphQL query endpoint into local `scripts/.env` as `ENVIO_GRAPHQL_URL`. The dashboard server also uses that value in `frontend/.env.local` and the Vercel project's server-side environment settings.

```dotenv
ENVIO_MONAD_RPC_URL=https://testnet-rpc.monad.xyz
ENVIO_AGENT_REGISTRY_ADDRESS=0x754d7f2fd55a9841dbff248f9cb91d497116f231
ENVIO_ROUTER_ADDRESS=0xac4a33521b32122c9f014eac8800144dd9aa5ebe
ENVIO_START_BLOCK=67972561
```

If the indexer has not been deployed, its live query endpoint is not ready to supply. The local indexer has already passed code generation, full typechecking and its Merkle tests; these do not create a hosted deployment. See the [Envio deployment guide](https://docs.envio.dev/docs/HyperIndex/hosted-service-deployment).

To let local tooling manage the deployment after account setup, the official [Envio Cloud CLI](https://docs.envio.dev/docs/HyperIndex/envio-cloud-cli) supports browser login:

```sh
npx --yes envio-cloud@1.0.0 login
```

Complete that login in your browser; the CLI stores its session locally. Once authenticated, an operator can inspect the actual indexer and retrieve its endpoint with `deployment endpoint`. Do not substitute a guessed URL. Only supply a GraphQL credential if the actual deployment requires one; keep it server-side.

## Task wallet funding and authority

The prepared task signer/payer is `0x44Cd39dCe9b074E27eFf4D914Ff9a3e182963605`. Its key is already in ignored local `scripts/.env`. The on-chain executor remains Render's existing relayer `0x5D8853E81F580A12e3Affaa9a7c76E0A65E02F57`.

The task wallet requires testnet MON for the later reputation-recording transaction and testnet USDC for the payment. In the [Circle faucet](https://faucet.circle.com), select **USDC**, **Monad Testnet**, and enter the task wallet address. The daemon charges 1,000 base units (0.001 USDC) for this single task. The [official Monad x402 guide](https://docs.monad.xyz/guides/x402) documents this faucet and USDC token. Funding does not grant Agent #1 authority; the owner must separately grant an expiring delegation.

After the grant is verified, resume the existing task attempt from `scripts`:

```sh
pnpm submit-task --run-dir .state/tasks/final-live-2026-10-07 --resume
```

Preserve its journal. The separate physical Dynamic passkey ceremony remains pending at the user's request. A CLI owner transaction, if performed later, must be recorded as such and cannot be presented as biometric authentication.
