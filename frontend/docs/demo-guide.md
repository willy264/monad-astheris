# Demonstrate Aetheris

The homepage separates a **Guided preview** from **Live testnet**. Preview works immediately. The directory also offers one real MCP observation task for Agent #1. Both paid paths require deployed contracts, a registered agent, funded wallets and a running payment-enabled daemon. Neither substitutes invented receipts for a failed live request.

## Run the guided preview

1. [Start the frontend](../README.md#run-locally) and open the homepage.
2. In **From sign-in to settlement**, keep **Guided preview** selected.
3. Select **Preview passkey sign-in**, then **Preview 5 Autonomous Tasks**.
4. Watch the five progress bars finish. Their labels say **Simulated**; there are no transaction links or charges.
5. Switch between **Standard EVM Mode** and **Aetheris Parallel Mode** in the homepage comparison or on `/visualizer`. Explain shared storage versus isolated task lanes, and use **Pause animation** when describing the graph.

Preview sign-in does not authenticate a wallet. The comparison's collision/delay/efficiency/timing numbers are explicitly illustrative, including `12 re-executions`, `+1,200ms`, `100%` and `300ms`. They do not measure network finality, and shared router state may still contend. The live ledger below the comparison remains a separate view of real events.

## Prepare the live environment

Complete the repository's [live submission setup](../../docs/live-submission.md) first. The frontend does not create the deployment, obtain funds or configure external providers for you.

| Prerequisite | Required state |
| --- | --- |
| Contract deployment | Matching router, identity and reputation addresses from your verified Monad Testnet deployment, chain `10143`. |
| Agent identity | A real registered `DEMO_AGENT_ID`. The browser signer is its current owner or an active router delegate. |
| Daemon | Running with the same router and chain, configured relayer keys, durable journal storage and an x402 `exact` facilitator. `MAX_INFLIGHT` should permit at least five requests. |
| Executors | Every relayer advertised by `/v1/config` is authorized for this agent and has testnet MON for transaction gas. The browser signer must be a different account from the relayers. |
| Payment wallet | The browser signer holds enough of the configured EIP-3009-compatible testnet token for five homepage payments, or one directory task payment. |
| Dynamic | A real environment with EVM wallets, Monad Testnet, the deployment origin and suitable passkey authentication/recovery configured. |
| Browser/origin | Current browser with WebAuthn, Web Locks and browser storage, on HTTPS or localhost. Device/passkey support depends on the provider. |

In `frontend/.env.local`, set the deployed public addresses and `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID`, then configure:

```dotenv
DEMO_ENABLED=true
DAEMON_URL=http://127.0.0.1:8080
DEMO_AGENT_ID=
DEMO_TASK_RESOURCE=
DEMO_PAYMENT_ASSET=
DEMO_PAYMENT_RECEIVER=
DEMO_PAYMENT_MAX_AMOUNT=
DEMO_PAYMENT_ASSET_NAME=
DEMO_PAYMENT_ASSET_VERSION=
```

The empty values above are mandatory operator inputs, not working sample credentials. See the [exact configuration reference](data-and-api.md#configuration). `DAEMON_URL` must be an HTTPS origin outside localhost. `DEMO_TASK_RESOURCE` must exactly match the daemon's `PUBLIC_TASK_URL`. The token, recipient and EIP-712 domain are independently pinned by the operator. `DEMO_PAYMENT_MAX_AMOUNT` limits each task's amount in token base units: five tasks in the homepage demo, one in the directory. Set `DEMO_AGENT_ID=1` for the directory's registered observer.

Rebuild after changing any `NEXT_PUBLIC_*` setting. Keep the frontend's private RPC/GraphQL credentials server-side, and keep daemon signing keys in the daemon environment. The frontend proxy has no server wallet. Check `GET /api/demo/config`: a configured compatible service returns `200`; missing or unavailable setup returns `503` with an explanation. This availability response alone is not proof that a paid task has settled.

The browser client supports x402 v2 `exact` EIP-3009 on Monad Testnet, with one payment option and a supported 60–120-second authorization window. It does not support GraphTally, unknown payment mechanisms or extensions. Multiple relayers can submit independently; one relayer serializes its own transaction nonces even though the browser dispatches all five requests concurrently.

## Run five real testnet tasks

1. Select **Live testnet** on the homepage. Resolve any visible configuration blocker before continuing.
2. Select **1-Tap Sign In with Passkey** and complete the configured Dynamic/device flow. A first-time account may require onboarding or a separate EVM-wallet connection. Signing in does not itself authorize an agent.
3. Confirm that the displayed agent, payment token, recipient and five-payment amount are the ones you intend to use. Fund/authorize the accounts described above.
4. Select **Spawn 5 Autonomous Tasks**. Approve **five task authorizations and five EIP-3009 payment authorizations**. The “1-Tap” sign-in label is not a promise that the full paid run needs one interaction. If signing exceeds the payment window, the client stops before submitting anything.
5. Once every signature is ready and the public recovery journal is saved, the client submits five concurrent signed requests. Progress reflects service status and receipt verification, not a timed completion animation.
6. Wait for **Verified on Monad** on each lane, then open its execution transaction link. If a lane stays unresolved, use recovery below.

The browser computes a small deterministic document/checksum result for each task and commits its hashes. The task labels are presentation labels; no external model or MCP endpoint runs in this five-task flow. The directory workflow below invokes the actual observer MCP service. The [MCP submission client](../../scripts/README.md) is also available for command-line execution. Hardware attestation is not produced by either browser workflow.

## Run one observer MCP task

1. Open `/agents#agent-1` on the same origin published in Agent #1's MCP endpoint. Inspect its IPFS card, token ID, owner and reputation. The endpoint is read from the card; the UI does not substitute an invented Render URL.
2. Configure the prerequisites above for `DEMO_AGENT_ID=1`. The task action remains disabled with **Setup pending** while configuration is missing or incompatible. A preview on another hostname cannot dispatch the registered service's task.
3. Connect an authorized EVM wallet using the global sidebar. If needed, the agent owner uses **Delegate task authority** to grant this signer an expiry. The signer must differ from the daemon's relayer accounts and hold the configured payment token.
4. Select **Trigger paid x402 task**. The client calls the same-origin `/api/mcp` endpoint using the MCP SDK and `get_monad_block`, validates the response, and derives the input/output hashes. This observation is read-only; no payment has been submitted yet.
5. Approve one EIP-712 task authorization and one EIP-3009 payment authorization. After saving its public journal, the client submits once and follows task and payment receipts.
6. Wait for **Verified on Monad Testnet**, then open the execution transaction. Use **Recover saved status** after an interrupted or unresolved request.

The tool observes a mined Monad block. Its commitment records the returned observation; it does not establish network finality, AI inference or hardware verification. The single-task action uses the same receipt checks as the five-task demo, with a separate recovery journal. Availability and implementation checks do not constitute a completed paid run; record a real execution and settlement receipt before presenting it as live evidence.

## What a green lane proves

For a completed job, the browser checks the request ID against the task's EIP-712 message, then verifies the CREATE2 salt and predicted shard address. It reads the creation, execution and payment receipts with **two confirmations**, checks the original transaction and canonical block hashes, and requires matching `ShardCreated` and `TaskExecuted` event fields from the expected router/executor.

Payment verification requires both the exact token transfer to the configured recipient and `AuthorizationUsed` for that task's payer and payment nonce. The lane turns green only after these checks pass. Two confirmations are an observation threshold, not a guarantee against every later reorganization. Matching receipts do not establish the correctness of arbitrary AI computation.

The homepage micropayment card counts verified payments from its five-task browser demo. It is not a cumulative network total; preview activity and the directory's single-task workflow do not increment it.

## Recover an interrupted run

The homepage public journal uses browser storage key `aetheris:judge-demo:v1`; the directory uses `aetheris:agent-task:v1`. They record task metadata, request IDs, payment nonces and progress separately. Active task/payment signatures stay in memory and are not written to either journal. Storage must succeed before the first paid POST.

Each prepared task is POSTed once. A timeout or ambiguous response leads to **status GET requests only**; the UI does not automatically re-sign, resend a paid request or create a replacement payment. A Web Locks lease and a fresh journal read coordinate tabs so an unfinished run is not overwritten.

Return to **Live testnet**, or the featured directory task, and select **Recover saved status** in that workflow. Keep the same deployment and preserve the browser journal. Previously completed lanes are checked on-chain again after a reload before regaining verified status. Wallet sessions survive navigation, but leaving a task page stops its in-page polling; return and recover its saved request rather than starting another paid run.

| State | Next action |
| --- | --- |
| `accepted` | Continue polling; the daemon has recorded the request. |
| `settlement_pending` | Continue bounded polling. This can be a normal settlement step; persistent failure needs operator reconciliation. |
| `completed` | The browser verifies task and payment receipts before showing green progress. |
| `reconciliation_required`, unknown request, unavailable receipts or exhausted polling | Preserve the journal and use recovery later, or have the operator inspect the daemon's durable task/payment records. Do not clear storage to force another payment. |
| Another tab owns the run | Finish or close that tab before recovering here. |
| Unreadable or changed journal | Preserve the page/storage and reconcile with the operator before starting another paid run. |

Wallet rejection and ordinary preflight errors can be corrected and retried when nothing was submitted. Missing executor authority, insufficient token balance, excessive clock skew and expired signing windows all stop the normal preflight/signing path before dispatch. This browser tool does not automatically post reputation feedback or produce a hardware validation proof; the broader [task workflow](../../scripts/README.md) and [submission guide](../../docs/live-submission.md) cover those steps.

## Dynamic sign-in and expiring delegation

The global **Passkey sign-in** button uses one Dynamic session shared by the overview, directory and visualizer. After connecting, select the wallet button to open **Passkeys & task authority**. The homepage's **Try passkey delegation** and directory's **Delegate task authority** open the same dialog. Configure Dynamic's EVM wallets, allowed origin, embedded-wallet/passkey authentication and recovery, then set `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` if using a project other than the default Aetheris sandbox. SDK 5.9.2 provides authentication and explicit passkey sign-in/registration actions. Available choices depend on the environment and wallet provider.

Dynamic handles WebAuthn challenges, origins and credentials. This application does not extract a P-256 private key or claim to verify raw P-256 signatures on-chain; credential algorithms are selected by the provider. A Dynamic account session alone grants no router permission.

The identity owner can enter an agent ID, executor address and duration to call `setDelegate(agentId, executor, expiresAt)`. The UI checks ownership and deployment linkage, switches chain, simulates the call, requests wallet approval and checks the successful original receipt. **Revoke access** sets expiry to zero. On-chain delegation needs gas unless it is externally sponsored.

The permission applies to that router, agent and expiry. It is not a token allowance, wallet-funds permission or cumulative spending budget. The demo's per-task price cap also does not impose a lifetime budget. The contract remains authoritative after sign-in, transfer, expiry or revocation.

## Optional Mera owner accounts

Set `NEXT_PUBLIC_MERA_ENABLED=true` and rebuild to expose the separate Mera module below Dynamic in the access dialog. Mera is **not** the paid workflows' Dynamic wallet connection; creating a Mera account does not automatically connect it there or make it an existing agent's owner.

The pinned `@category-labs/mera` 0.2.0 flow uses a discoverable passkey with WebAuthn PRF. Keep a stable HTTPS hostname and a compatible authenticator. The default relying-party ID is the current hostname; `NEXT_PUBLIC_MERA_RP_ID` can select a valid parent domain. Changing that setting does not migrate an existing passkey to another relying party. Localhost is supported for development.

The account mapping is PRF entropy → BIP-39 seed → BIP-32 path `m/44'/60'/0'/0/0` → `createSecp256k1SigningSession` → `toViemAccount`. The result is an ordinary EVM account, not a raw P-256 on-chain signature. It must own the agent identity and hold testnet MON to delegate or revoke.

Each permission change checks chain, router/registry linkage and ownership, simulates the exact call, requests a fresh passkey ceremony and signs using the same derived account. The signing session ends after submission, on errors and on page exit/unmount. PRF/seed/key byte buffers are cleared; no mnemonic, key or signing session is intentionally persisted. Public account/credential identifiers remain in React memory. JavaScript strings and library allocations cannot be guaranteed to be zeroized, and hostile code on the origin remains outside this protection.

No account-recovery service or private-key export UI is included. Retain access to the provider and origin. Mera is a preview SDK; local derivation/signature/session tests do not establish a successful physical PRF ceremony or funded on-chain delegation.

## Verification and references

Use [VERIFICATION.md](../../VERIFICATION.md) for the checks actually run and [SUBMISSION_PROOF.md](../../SUBMISSION_PROOF.md) for live evidence. Do not describe an unconfigured passkey flow or a simulated progress lane as a completed testnet transaction.

- [Dynamic context provider](https://docs.dynamic.xyz/react-sdk/providers/dynamiccontextprovider)
- [Dynamic EVM wallet client](https://docs.dynamic.xyz/wallets/using-wallets/evm/evm-wallets)
- [Dynamic embedded wallet authentication](https://docs.dynamic.xyz/wallets/embedded-wallets/create-embedded-wallets)
- [Mera repository](https://github.com/category-labs/mera)
- [Mera account derivation](https://github.com/category-labs/mera/blob/main/docs/src/content/docs/getting-started.mdx)
- [Mera Viem transaction recipe](https://github.com/category-labs/mera/blob/main/docs/src/content/docs/recipes/send-a-transaction-with-viem.md)
