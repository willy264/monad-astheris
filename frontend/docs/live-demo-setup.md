# Connect the live testnet demo

The homepage's **Live demo is not available yet** panel means `/api/demo/config` could not return a validated deployment and payment configuration. Passkey sign-in does not enable this service.

Once the operator connects the service, visitors use **Get ready for a live run** to register an identity owned by their personal wallet. They authorize the daemon to execute that identity's tasks and pay from their own testnet token balance. No per-visitor `DEMO_AGENT_ID` change or permission from Agent #1's owner is needed for this homepage checksum demo.

## October 10 recovery

Render was suspended from the coordinated owner-wallet verification session. It was resumed after checking that the owner's latest and pending nonces both equaled `11` and the batch worker was disabled. Public `/health` and `/v1/config` returned **200** with chain `10143` and the expected router/payment policy in that check. [Recorded service checks](../../submission/2026-10-10/demo-availability.json).

After the operator updated Vercel and redeployed, `/api/demo/config` returned **200 / enabled:true** at **11:36 UTC on October 10**, with the intended agent, contracts, relayer and payment policy. [Public endpoint response](../../submission/2026-10-10/demo-config-enabled.json). This supersedes the earlier 503 availability failure. Vercel's private environment settings were not inspected; the public response confirms the effective configuration.

The old task wallet `0x44Cd39dCe9b074E27eFf4D914Ff9a3e182963605` lost its Agent #1 authority when its grant expired October 7. That restriction still applies to the Observer directory action; a visitor's own new identity uses separate permissions. MetaMask's domain scan returned **BLOCK** on October 10. Resolve the [website classification](../../submission/2026-10-07/wallet-security-review.md) before signing and do not bypass the warning. No new task, payment or delegation was submitted during the recorded availability recovery. Implementation of self-service setup does not establish a completed live run or passkey ceremony.

## Vercel Production settings

In the `monad-astheris` Vercel project, open **Settings → Environment Variables** and select **Production**. These values were checked against the resumed daemon's public configuration. All `DEMO_*` values and `DAEMON_URL` are server settings: keep their names exactly as shown, without a `NEXT_PUBLIC_` prefix.

```dotenv
# Keep disabled while website security review and signer setup are pending.
DEMO_ENABLED=false
DAEMON_URL=https://monad-astheris-daemon.onrender.com
# Optional default for the legacy/Observer route; not required per visitor.
# DEMO_AGENT_ID=1
DEMO_TASK_RESOURCE=https://monad-astheris-daemon.onrender.com/v1/tasks
DEMO_PAYMENT_ASSET=0x534b2f3a21130d7a60830c2df862319e593943a3
DEMO_PAYMENT_RECEIVER=0x5d8853e81f580a12e3affaa9a7c76e0a65e02f57
DEMO_PAYMENT_MAX_AMOUNT=1000
DEMO_PAYMENT_ASSET_NAME=USDC
DEMO_PAYMENT_ASSET_VERSION=2
```

The existing public contract configuration must match this deployment:

```dotenv
NEXT_PUBLIC_ROUTER_ADDRESS=0xac4a33521b32122c9f014eac8800144dd9aa5ebe
NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS=0x754d7f2fd55a9841dbff248f9cb91d497116f231
NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS=0x8f1fe9beef6df891189355129bf48f073d9ab322
NEXT_PUBLIC_MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
DEPLOYMENT_BLOCK=67972561
```

Saving values in local `.env` files does not update Vercel. Redeploy Production after changing its environment variables. Never add the daemon relayer key or a task-wallet private key to frontend configuration.

`DEMO_ENABLED` remains a global service switch, and payment/daemon settings are configured once by the operator. `DEMO_AGENT_ID` is optional with default `1`; it does not restrict the service to one identity. `GET /api/demo/config?agentId=2` can return service settings for another valid positive ID before that identity is ready. Before forwarding a paid request, the server reads the actual chain, router/registry linkage, identity owner and current signer/executor permissions through `MONAD_RPC_URL`. Those authorization results are not cached, and the daemon checks authority again before payment.

## Enable and verify when the remaining blockers are resolved

1. Resolve the MetaMask website classification and verify the intended Dynamic project configuration.
2. Set `DEMO_ENABLED=true` in Vercel Production and redeploy when service and website review are ready. A successful `/api/demo/config` response contains `enabled:true`, chain `10143`, and the intended router, relayers and payment policy. Setting only the flag is insufficient if payment/service fields are absent or mismatched.
3. Select **Check connection again** or reload after deployment. For a 503, compare Vercel's effective policy with daemon `/v1/config`, inspect function logs and verify Render `/health`. A free instance may need time to wake up. Relayers need gas, and the daemon needs durable task/payment journal storage.
4. Follow the visitor setup below. Keep the project owner/relayer account out of the visitor flow; each visitor signs with their own wallet.

## Register and run your own agent

1. Select **Live testnet → Connect wallet to begin**. Connect a personal EVM wallet and use Monad Testnet, chain **10143**. **Change wallet** can select another account. The existing owner `0x5D8853E81F580A12e3Affaa9a7c76E0A65E02F57` is also a relayer and cannot serve as the browser payer.
2. Select **Copy address** and fund that address with testnet MON from the [Monad faucet](https://faucet.monad.xyz/). MON pays registration and delegation gas. Select **Check balances & status** after funding.
3. Select **Register my agent** and approve the transaction. The app checks the registration and ERC-721 mint receipts, then displays your assigned token ID. The URI is bounded inline base64 JSON using the ERC-8004 registration format; the card honestly describes the browser checksum capability and wallet endpoint. It does not claim an Observer MCP endpoint, external AI execution or hardware attestation. You need no IPFS pinning credential. Existing owners may use **Already own an agent? Use its token ID. → Check ownership**.
4. Select **Authorize for 1 hour** and approve each required executor grant. The app lists the exact daemon addresses. It checks that your wallet owns the identity and that each executor has enough authority remaining for a run. Grants expire automatically; an explicit **Revoke access** action in wallet access is available to the owner and costs gas.
5. Fund the same wallet with testnet USDC using the [Circle faucet](https://faucet.circle.com/): choose **USDC → Monad Testnet**. Check the token address against the displayed policy. At the recorded price, the homepage needs **5,000 base units = 0.005 testnet USDC** for five tasks, in addition to setup gas. Select **Check balances & status** until setup shows **Ready to run**.
6. Select **Spawn 5 Autonomous Tasks** and approve five task signatures and five payment signatures. The selected agent ID is bound into each task authorization. All five requests dispatch after signing and saving the public recovery journal. Green lanes require verified execution and payment receipts.

Wallet connection does not prove a physical passkey ceremony. To demonstrate that separately, enroll and sign in with an actual device passkey on the configured origin. The sign-in method does not replace on-chain ownership, executor permissions or payment signatures.

## Recovery and the existing Observer

Setup journals are separated by wallet and deployment and retain the selected agent and transaction hashes. Task journals are also scoped by payer and agent. If setup is interrupted, use **Check saved transaction**; if a returned hash was lost, supply the actual hash from the wallet. Receipt recovery never sends the transaction again. An uncertain intent must be reconciled before another setup write.

For paid tasks, return to the original wallet and agent. Saved runs are checked automatically once per session; **Recover saved status** remains available to retry a read. Recovery does not require a current executor grant or another payment balance, and does not broadcast, create a payment or repeat signatures. New paid runs still require fresh setup checks and confirmation of the previous requests. Preserve unresolved browser and daemon journals.

Creation, execution and payment transaction hashes are saved as untrusted hints. Every reload rechecks exact task fields, CREATE2 address, payment payer/recipient/token/amount/authorization nonce, canonical block hashes and two confirmations. If an older journal has no hash bundle and the daemon lost its job, the app can locate the matching task among the latest 200 indexed shards and search at most 200 blocks after execution for that exact payment nonce, in RPC chunks of at most 100 blocks. Missing or mismatched evidence stays unresolved; the app never invents a successful result or repays the task. This bounded fallback cannot recover every arbitrarily old or delayed settlement.

Agent #1 is still the **Aetheris Monad Observer**, whose directory task calls the registered MCP service. It requires that identity's owner or an unexpired delegate and costs **0.001 testnet USDC** at the recorded price. Registering a personal checksum agent does not grant access to the Observer. If the Observer's owner must grant a delegate, coordinate the transaction with Render because that owner account is also the daemon relayer. A new visitor's personal-agent setup avoids sharing that signer.

Configuration success only establishes availability. The user's later Agent #2 registration and five-task browser run now have [live receipt and Envio evidence](../../SUBMISSION_PROOF.md#self-service-browser-execution-october-10). That record separates independently checked receipts from the browser's per-task payment verification and does not claim a passkey ceremony.

## Understand task and permission messages

| Message or screen | Meaning and next step |
| --- | --- |
| Observer #1 access is unavailable for this wallet | An agent has its own permissions. Owning Agent #2 does not authorize Agent #1. Use **Continue with your own agent** to return to the homepage run. The Observer checks authority before calling MCP or requesting signatures. |
| You entered your connected wallet as executor | This notice appears only after the wallet is verified as the selected agent's owner. The owner already has task authority. In guided setup, approve the displayed daemon executor. For an agent owned by someone else, the dialog instead shows its owner and disables permission changes. |
| The wallet request was cancelled | The wallet reported rejection of the request. It does not undo an earlier confirmed registration, grant or task. Retry only the intended action when ready. |
| Monad Testnet is taking too long to respond | A network read or confirmation timed out. Check any saved transaction or task status before retrying a write; a timeout alone cannot prove a transaction failed. |
| Yellow **Check saved status** bars | The browser has saved requests whose receipts need checking. Reload recovery starts automatically; if it cannot finish, select **Recover saved status**. Existing job, indexed history and exact on-chain receipt reads never submit another task or payment. |
| Five green **Verified on Monad** bars | All five execution and exact payment receipt checks completed. Open their explorer links to inspect the transactions. |
| Zero recent executions but visible historical shards | Activity counters use the recent 200-block window. With Envio, the topology, ledger and Observer history also show up to 200 latest indexed task lanes from earlier runs; these records are labeled history. RPC fallback remains limited to recent events. |
| **Awaiting commit** in Merkle commitments | Envio has reconstructed a task batch, but its root has not been published to the router. Task completion and payment can already be verified. Batch publication needs the operator's authorized committer; visitors do not need to repeat their tasks. |

The daemon's current CORS origin still contains a placeholder. The browser demo uses same-origin Vercel API routes, whose server requests do not depend on browser-to-Render CORS. If direct browser access to Render is needed, separately configure Render's `CORS_ORIGIN=https://monad-astheris.vercel.app` and coordinate a restart while retaining the journal. The frontend configuration endpoint now succeeds through the existing proxy.
