# Chainlink CRE validation receiver

`ValidationRegistry` implements the Chainlink CRE `onReport(bytes,bytes)` receiver ABI and ERC-165 discovery. It is an application adapter: there is no deployed CRE workflow, configured forwarder, or verified Monad CRE delivery in this repository. The default forwarder is zero, which rejects every delivery. Deploying the Aetheris contracts alone does not enable CRE.

The receiver ABI matches the official [IReceiver source](https://github.com/smartcontractkit/chainlink-evm/blob/b6427ea1f4847d640abdf24dbd6c6f01d7799d59/contracts/cre/src/v1/interfaces/IReceiver.sol). The delivery design follows Chainlink's [consumer guide](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts) and pinned [KeystoneForwarder source](https://github.com/smartcontractkit/chainlink-evm/blob/b6427ea1f4847d640abdf24dbd6c6f01d7799d59/contracts/cre/src/v1/KeystoneForwarder.sol), reviewed on **2026-10-03**. Chainlink's forwarder authenticates DON signatures and supplies workflow metadata; this receiver enforces Aetheris request policy.

## Deployment prerequisites and trust

Before enabling this adapter, obtain provider confirmation of the target chain, deployed workflow access, and official forwarder address from the current [supported networks](https://docs.chain.link/cre/supported-networks) and [forwarder directory](https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory). Monad support and an official Monad forwarder were **not verified** during this build. No address is guessed or copied from another chain. If delivery is unavailable on the target chain, keep CRE disabled and describe the adapter as tested locally.

The validation-registry administrator controls `setCREForwarder` and `setCREWorkflow`. These settings are trust decisions: a malicious forwarder can invent workflow metadata, and an authorized workflow can report incorrect results. The contract checks delivery authority and report consistency; it cannot independently establish the truth of external computation or native hardware quotes. Nonzero forwarder addresses must have deployed code. Setting the address to zero pauses delivery; it never disables the caller check. Workflow authorization requires an exact nonzero `(workflowId, workflowName, workflowOwner)` tuple. Revoking the tuple blocks subsequent reports, including those already in transit.

`AetherisRouter(identityRegistry, validationRegistry, admin)` permanently links the validation registry. Its constructor checks that `validationRegistry.getIdentityRegistry()` equals its own identity registry. The immutable link identifies the deployment; `executeTask` and `commitMerkleBatch` do not automatically request validation or require a CRE result. Reputation updates remain separate calls too.

## Request and delivery lifecycle

1. The agent owner or ERC-721 operator calls `requestOutputValidation(workflowOwner, agentId, requestURI, requestHash, expectedOutputHash)`. Use a unique nonzero request hash and a nonzero expected output hash. The request records its creation time and designated validator permanently.
2. The configured workflow reads the request and obtains the evidence needed for its policy. Its owner address must exactly match the designated validator. Being on another allowed workflow tuple does not grant authority over that request.
3. The workflow encodes the report below and uses the official CRE EVM reporting path. The signed report is delivered through the configured forwarder.
4. The receiver checks workflow identity, chain and contract domain, agent, expected output, evidence hash, timestamps, and replay status. A successful report emits `ValidationResponse` with tag `cre-validation` and `CREReportAccepted` with the workflow identity and report hash.
5. A successful CRE delivery consumes that request exactly once, even if the payload or two-byte report ID changes. Reverted deliveries leave no consumption state and can be corrected and retried before expiry. A new result requires a new request hash.

The standard `validationResponse` method retains ERC-8004's ability for the designated validator to update a response. CRE consumption prevents additional **CRE** responses; it does not make the entire standard validation record immutable. Consumers requiring CRE evidence should inspect `CREReportAccepted` and the recorded report hash, rather than assuming every later status value came from CRE. The independent TEE adapter retains its own signature and replay rules.

## Metadata

Production metadata is exactly 64 bytes. The first fields identify the workflow and the final two bytes contain its report ID, as described in the [consumer guide](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts).

| Offset | Width | Field |
| --- | --- | --- |
| 0 | 32 | `bytes32 workflowId` |
| 32 | 10 | `bytes10 workflowName` |
| 42 | 20 | `address workflowOwner` |
| 62 | 2 | `bytes2 reportId` |

The workflow name is the first ten lowercase hexadecimal **characters** of SHA-256 of the plaintext name, encoded as ten ASCII bytes. It is not the first ten binary hash bytes. For example, Node can compute the value with `stringToHex(createHash('sha256').update(name, 'utf8').digest('hex').slice(0, 10))`, using `createHash` from `node:crypto` and `stringToHex` from `viem`. Obtain the exact deployed workflow ID from the CRE registration output.

The CLI simulation forwarder does not provide production workflow metadata. Do not relax these checks to accommodate that path; use the local Foundry harness for receiver tests and obtain real CRE delivery evidence separately. The test harness is confined to [test/CREValidation.t.sol](test/CREValidation.t.sol).

## Report ABI

The payload is a static ABI tuple of exactly nine words (288 bytes), equivalent to `abi.encode(ValidationRegistry.CREReport(...))`:

```text
uint256 chainId,
address receiver,
bytes32 requestHash,
uint256 agentId,
bytes32 outputHash,
bytes32 responseHash,
uint64 observedAt,
uint64 expiresAt,
uint8 response
```

| Field | Receiver requirement |
| --- | --- |
| `chainId` | Current EVM chain ID, not a Chainlink chain selector |
| `receiver` | This deployed `ValidationRegistry` address |
| `requestHash` | Existing unique validation request |
| `agentId` | The agent ID stored in that request |
| `outputHash` | Nonzero and identical to the request's expected output |
| `responseHash` | Nonzero hash of the workflow's response/evidence artifact |
| `observedAt` | Unix seconds; at or after request creation, no later than block time, at most one hour old |
| `expiresAt` | Unix seconds; at or after current block time and observation, at most one hour after observation |
| `response` | Integer 0 through 100; zero is a valid negative result |

For off-chain encoding with Viem:

```typescript
import { encodeAbiParameters, parseAbiParameters } from 'viem';

const report = encodeAbiParameters(
  parseAbiParameters(
    'uint256 chainId, address receiver, bytes32 requestHash, uint256 agentId, bytes32 outputHash, bytes32 responseHash, uint64 observedAt, uint64 expiresAt, uint8 response',
  ),
  [chainId, validationRegistry, requestHash, agentId, outputHash, responseHash, observedAt, expiresAt, response],
);
```

Here `chainId`, `agentId`, `observedAt` and `expiresAt` are `bigint`; `response` is a JavaScript number. The hashes and address are typed hexadecimal values. The same bytes must enter the CRE signed report. A directly submitted EOA transaction to `onReport` is rejected even when that EOA owns the workflow.

## Configuration and evidence

After validating the deployment and provider configuration, the registry owner calls:

```solidity
validation.setCREWorkflow(workflowId, encodedWorkflowName, workflowOwner, true);
validation.setCREForwarder(officialForwarderOnThisChain);
```

Ownership uses the existing two-step transfer: if deployment specified another administrator, that administrator first calls `acceptOwnership`. Keep the workflow ID, encoded name, owner, forwarder chain/address, deployment transaction, request transaction, delivery transaction, and evidence artifact in the submission record. Local test success is not evidence of a deployed DON workflow or live delivery.

The [Foundry suite](test/CREValidation.t.sol) exercises authorization, metadata, domain and output binding, request existence, report freshness, replay protection and registry isolation. It deliberately does not simulate DON signature verification; that remains the official forwarder's responsibility.
