# Verify the deployed contract sources on Monadscan

**Status: exact source inputs prepared; accepted explorer verification remains NOT VERIFIED.** Read-only checks on October 11, 2026, from 13:28:50 to 13:30:59 UTC found all four deployed runtime hashes and creation transactions consistent with the deployment manifest. Each Monadscan code page still offered source verification and had no accepted-source marker. Source preparation and a fresh compilation from 13:46:11 to 13:48:10 UTC reproduced each artifact's creation bytecode and runtime template. Those checks do not establish explorer acceptance.

The [public source package](../submission/2026-10-11/contract-source-inputs/) contains the exact prepared inputs, ABI-encoded constructor arguments, [preparation manifest](../submission/2026-10-11/contract-source-inputs/manifest.json), and [SHA-256 checksums](../submission/2026-10-11/contract-source-inputs/checksums.sha256). Its nine prepared files were copied without byte changes. All 133 embedded source occurrences were checked against the public hashes in [the deployment manifest](../contracts/deployments/10143.json). The package contains Solidity sources and public deployment metadata; no environment files, private keys, wallet signatures, or daemon journal were included.

## Exact settings

| Field | Required value |
| --- | --- |
| Network | Monad Testnet, chain ID `10143` |
| Verification method | `Solidity (Standard-Json-Input)` |
| Compiler | `v0.8.24+commit.e11b9ed9` |
| Optimizer | Enabled, `200` runs |
| Via IR | `true` |
| EVM version | `cancun` |
| Libraries | Empty (`{}`); no linked library addresses |
| Proxy | None; each address is a direct contract deployment |
| License of the four application contracts | MIT; preserve included dependency SPDX declarations |

The JSON already contains the deployed settings, source paths, remappings, and metadata settings. Upload it unchanged. Monadscan's [official verification guidance](https://info.monadscan.com/how-to-verify-contracts/) directs advanced compiler settings such as `viaIR` through standard JSON input. A flattened-source submission would lose those exact inputs.

## Contract inputs

Open the code-page link for the contract being verified. Each row points to a separate deployment; never reuse another row's input or constructor arguments.

| Contract and Monad Testnet code page | Fully qualified name | Standard JSON file | Constructor-arguments file |
| --- | --- | --- | --- |
| [AgentRegistry](https://testnet.monadscan.com/address/0x754d7f2fd55a9841dbff248f9cb91d497116f231#code) | `src/AgentRegistry.sol:AgentRegistry` | [AgentRegistry.standard-input.json](../submission/2026-10-11/contract-source-inputs/AgentRegistry.standard-input.json) | [AgentRegistry.constructor-args.txt](../submission/2026-10-11/contract-source-inputs/AgentRegistry.constructor-args.txt) — empty |
| [ReputationRegistry](https://testnet.monadscan.com/address/0x8f1fe9beef6df891189355129bf48f073d9ab322#code) | `src/ReputationRegistry.sol:ReputationRegistry` | [ReputationRegistry.standard-input.json](../submission/2026-10-11/contract-source-inputs/ReputationRegistry.standard-input.json) | [ReputationRegistry.constructor-args.txt](../submission/2026-10-11/contract-source-inputs/ReputationRegistry.constructor-args.txt) |
| [ValidationRegistry](https://testnet.monadscan.com/address/0xcd0cf354acd2c79145caeac7d4f0639f8957308d#code) | `src/ValidationRegistry.sol:ValidationRegistry` | [ValidationRegistry.standard-input.json](../submission/2026-10-11/contract-source-inputs/ValidationRegistry.standard-input.json) | [ValidationRegistry.constructor-args.txt](../submission/2026-10-11/contract-source-inputs/ValidationRegistry.constructor-args.txt) |
| [AetherisRouter](https://testnet.monadscan.com/address/0xac4a33521b32122c9f014eac8800144dd9aa5ebe#code) | `src/AetherisRouter.sol:AetherisRouter` | [AetherisRouter.standard-input.json](../submission/2026-10-11/contract-source-inputs/AetherisRouter.standard-input.json) | [AetherisRouter.constructor-args.txt](../submission/2026-10-11/contract-source-inputs/AetherisRouter.constructor-args.txt) |

Decoded constructor values, in order:

| Contract | Constructor values |
| --- | --- |
| AgentRegistry | None. Leave the arguments field empty. |
| ReputationRegistry | Registry `0x754d7f2fd55a9841dbff248f9cb91d497116f231`; initial admin `0x5d8853e81f580a12e3affaa9a7c76e0a65e02f57` |
| ValidationRegistry | Registry `0x754d7f2fd55a9841dbff248f9cb91d497116f231`; initial admin `0x5d8853e81f580a12e3affaa9a7c76e0a65e02f57` |
| AetherisRouter | Registry `0x754d7f2fd55a9841dbff248f9cb91d497116f231`; validation registry `0xcd0cf354acd2c79145caeac7d4f0639f8957308d`; initial admin `0x5d8853e81f580a12e3affaa9a7c76e0a65e02f57` |

The encoded files omit the `0x` prefix and end with a newline. Copy their hex contents without the newline when a form requests ABI-encoded arguments. The initial admin is the deployer passed to the constructor, even if ownership changes later; a current owner address is not a substitute.

## Manual submission

1. Download the raw files or use the checked-out package. Check the selected JSON's SHA-256 against `manifest.json` or `checksums.sha256`. On PowerShell, use `Get-FileHash -Algorithm SHA256 <filename>`; on Linux, run `sha256sum -c checksums.sha256` inside the package directory.
2. Open the corresponding code-page link above. Confirm `testnet.monadscan.com` and the full address. Choose **Verify and Publish** if the contract is still unverified.
3. Choose **Solidity (Standard-Json-Input)** and compiler **v0.8.24+commit.e11b9ed9**. Choose MIT if a license field is shown. Upload that contract's `*.standard-input.json`. Keep optimizer, IR, EVM and all other settings exactly as encoded in the JSON.
4. If the interface asks for the target contract, use the row's fully qualified name (or the matching source file and contract name in separate selectors). If it requests constructor arguments, supply that row's `*.constructor-args.txt` contents. Confirm any automatically detected arguments match them. Leave library addresses empty and do not select proxy verification.
5. Complete any explorer CAPTCHA or account step directly in the explorer and submit the verification form. This publishes source metadata for an existing contract; it does not deploy a replacement or require a blockchain transaction. Do not change deployment addresses or application configuration to work around a verification error.
6. Wait for the explorer result, then reopen the code page. Repeat for all four contracts. Save errors verbatim if a submission fails so compiler settings, target selection or constructor data can be checked against the package.

This preparation did not submit any explorer form or change any explorer account. Interface labels can change; the exact compiler, target, input and constructor values above remain the comparison points.

## Acceptance evidence

For each of the four addresses, record the UTC check time and code-page link only after the explorer displays accepted verified source for that exact deployment. Confirm the source files, target contract, compiler version, optimizer runs, EVM version, constructor arguments and IR settings against the prepared input. Inspect the generated ABI/read-contract view as supporting evidence. A similar-contract match, pending submission, successful local compilation, bytecode match, or verification invitation alone does not meet the accepted-source gate.

Keep the current status as **NOT VERIFIED** until the accepted result has been inspected. Then update the submission evidence with the observed result and screenshot or saved public response for each address. The package's preparation manifest is a timestamped record and should remain unchanged; record later explorer acceptance separately.

## Reproduce preparation locally

The local-only script [prepare-source-verification.mjs](../scripts/prepare-source-verification.mjs) reads the existing Foundry artifacts, deployment manifest and sources. It fails when source hashes differ from deployed metadata or linked libraries appear. It reads no environment file and makes no network call.

From the repository root, with the scripts dependencies installed and the deployment's Foundry artifacts present:

```powershell
node scripts/prepare-source-verification.mjs
```

That command prepares source inputs without recompiling. To also reproduce the original preparation's bytecode checks, supply the local module path for the exact `solc` release:

```powershell
node scripts/prepare-source-verification.mjs --compile-with <absolute-path-to-solc-0.8.24-module>
```

The new timestamped output is under `scripts/.artifacts/source-verification/`. Compare the four input SHA-256 values with the public package before using a regenerated input. Explorer submission and acceptance checks remain separate manual steps.
