# Aetheris submission proof

Evidence generated: 2026-10-07T20:59:26.310Z. Target: Monad Testnet, chain 10143.

This file records observed evidence. Missing credentials, receipts or indexing results remain explicit blockers; local compilation alone does not establish a live submission.

- identityRegistry: [0x754d7f2fd55a9841dbff248f9cb91d497116f231](https://testnet.monadscan.com/address/0x754d7f2fd55a9841dbff248f9cb91d497116f231) — [deployment transaction](https://testnet.monadscan.com/tx/0x9a30b9b3d8ce9efc2854c6015faf322adcbfb6befdb3a40a9633248c20c55924).
- reputationRegistry: [0x8f1fe9beef6df891189355129bf48f073d9ab322](https://testnet.monadscan.com/address/0x8f1fe9beef6df891189355129bf48f073d9ab322) — [deployment transaction](https://testnet.monadscan.com/tx/0xd33a1d00bbcff1a71520478a03843aa718e80f90fccf9855527e5ed4441992d3).
- validationRegistry: [0xcd0cf354acd2c79145caeac7d4f0639f8957308d](https://testnet.monadscan.com/address/0xcd0cf354acd2c79145caeac7d4f0639f8957308d) — [deployment transaction](https://testnet.monadscan.com/tx/0x4e57487e9c8e249f83dc9ea294fa29c4d13de0b98177654d125900706c8b02d0).
- router: [0xac4a33521b32122c9f014eac8800144dd9aa5ebe](https://testnet.monadscan.com/address/0xac4a33521b32122c9f014eac8800144dd9aa5ebe) — [deployment transaction](https://testnet.monadscan.com/tx/0xabc10b999bf0114783274620a1f3bdb03cdc8d828d56c078ac9403780863a69a).

Agent **1**: ipfs://bafkreibo5gtw45fi27ykfsbubt7uo6vze3s4x44ytqf735ojnnhhylpuea; [registration](https://testnet.monadscan.com/tx/0xc9bbd6e8a390f4fb1788f3d305f241293ec919b49d35238c7aeda5c829f3a716).

## Task evidence

Request ID: 0x07f7edd33120c5d94d8c47035cda16f4e5c7150feb0e45179849e8bcf5119753.

[TaskExecuted receipt](https://testnet.monadscan.com/tx/0xc2e82710f180b4e2e37ca13d53a80f1767fbbb6ec9f4402d8b5c83ee3e6c310a) · [isolated shard](https://testnet.monadscan.com/address/0x465C5B7a951A3FBBF5a2A618FF4593C2a1FFeFE8) · [payment transfer](https://testnet.monadscan.com/tx/0xb3623f7b05b489fe647372c586a612463a60b6e9c9be87122ba57e1b5ad37db0)

```json
{
  "domain": {
    "name": "AetherisTask",
    "version": "1",
    "chainId": 10143,
    "verifyingContract": "0xac4a33521b32122c9f014eac8800144dd9aa5ebe"
  },
  "types": {
    "TaskAuthorization": [
      {
        "name": "agentId",
        "type": "uint256"
      },
      {
        "name": "taskId",
        "type": "bytes32"
      },
      {
        "name": "sequenceNonce",
        "type": "uint256"
      },
      {
        "name": "inputHash",
        "type": "bytes32"
      },
      {
        "name": "outputHash",
        "type": "bytes32"
      },
      {
        "name": "proofHash",
        "type": "bytes32"
      },
      {
        "name": "executor",
        "type": "address"
      },
      {
        "name": "deadline",
        "type": "uint64"
      }
    ]
  },
  "primaryType": "TaskAuthorization",
  "message": {
    "agentId": "1",
    "taskId": "0x1a55a675cb34c941a4de0b1e4269526a7335cb51ea177a235dba724aac244c28",
    "sequenceNonce": "0",
    "inputHash": "0xcdf3188adf0519f15395b5812c9d57fda0615bdaed1997a39ea2c86e2978f03b",
    "outputHash": "0x123713719f129fd9b5de451cd4ab2d3187e75a27f2f2e7146d41cfe8e6ff5339",
    "proofHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "executor": "0x5D8853E81F580A12e3Affaa9a7c76E0A65E02F57",
    "deadline": "1791405885"
  },
  "signature": "0xc807503b5064040e9070c3d7cc2c60c0f07c5ad9028faef04b7f66c0f41f752a68370c8a0f7274075536cc50a42b5ef1cdaff61967f0cb39c1a2244e40d4845d1c"
}
```

Payment credentials and active task signatures are excluded. The client can export a sample task signature after its deadline has expired. Preserve private input/output bytes separately to reproduce their hashes.

## Indexed execution and batch

The query below was executed against the configured Envio endpoint; its returned task and commitment matched live chain data.

```graphql
query Evidence($chain: Int!, $router: String!, $tx: String!, $block: numeric!) {
  TaskExecution(where: {chainId: {_eq: $chain}, router: {_eq: $router}, transactionHash: {_eq: $tx}}, limit: 2) {
    agentId taskId inputHash outputHash proofHash leaf blockNumber blockHash transactionHash logIndex
    shard { address } agent { registry agentId } batch { batchId root leafCount status blockHash }
  }
  BatchCommitment(where: {chainId: {_eq: $chain}, router: {_eq: $router}, fromBlock: {_eq: $block}, toBlock: {_eq: $block}, verified: {_eq: true}}, limit: 5) {
    batchId root leafCount fromBlock toBlock verified transactionHash
  }
}
```

```json
{
  "TaskExecution": [
    {
      "agentId": "1",
      "taskId": "0x1a55a675cb34c941a4de0b1e4269526a7335cb51ea177a235dba724aac244c28",
      "inputHash": "0xcdf3188adf0519f15395b5812c9d57fda0615bdaed1997a39ea2c86e2978f03b",
      "outputHash": "0x123713719f129fd9b5de451cd4ab2d3187e75a27f2f2e7146d41cfe8e6ff5339",
      "proofHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
      "leaf": "0xb3559a6b33f5a1674ec469dfbfc95556afd5e37b08a76e0745853e7f14a3bc65",
      "blockNumber": "69066769",
      "blockHash": "0x980aab91858614bd2c27234604a7b2ed8e5ed25e40e626ab37ee13b7d96026d3",
      "transactionHash": "0xc2e82710f180b4e2e37ca13d53a80f1767fbbb6ec9f4402d8b5c83ee3e6c310a",
      "logIndex": 1,
      "shard": {
        "address": "0x465c5b7a951a3fbbf5a2a618ff4593c2a1ffefe8"
      },
      "agent": {
        "registry": "0x754d7f2fd55a9841dbff248f9cb91d497116f231",
        "agentId": "1"
      },
      "batch": {
        "batchId": "0x3a5e3ec71f061a59e57fbbf1b3d52ab6c57d66dc4254049c7c999418ece777c3",
        "root": "0xb3559a6b33f5a1674ec469dfbfc95556afd5e37b08a76e0745853e7f14a3bc65",
        "leafCount": "1",
        "status": "committed",
        "blockHash": "0x980aab91858614bd2c27234604a7b2ed8e5ed25e40e626ab37ee13b7d96026d3"
      }
    }
  ],
  "BatchCommitment": [
    {
      "batchId": "0x3a5e3ec71f061a59e57fbbf1b3d52ab6c57d66dc4254049c7c999418ece777c3",
      "root": "0xb3559a6b33f5a1674ec469dfbfc95556afd5e37b08a76e0745853e7f14a3bc65",
      "leafCount": "1",
      "fromBlock": "69066769",
      "toBlock": "69066769",
      "verified": true,
      "transactionHash": "0x2fec55ca5081d8dbf23fe46e53f51e7570399b632a57088d6e3d4a7db75659bc"
    }
  ]
}
```

## Evidence status

| Item | Status | Detail |
| --- | --- | --- |
| Live contracts | VERIFIED | Four deployment receipts, runtime code hashes and canonical blocks rechecked; compiler/linkage evidence is in contracts/deployments/10143.json. |
| Agent registration | VERIFIED | Owner, URI and successful registration receipt checked against the configured registry. |
| Task execution | VERIFIED | Successful canonical TaskExecuted event and all task commitments match the client proof. |
| Sample EIP-712 signature | VERIFIED | Expired signature recovers the recorded signer and matches the request ID. |
| Payment | VERIFIED | Canonical successful token receipt contains the expected payer, receiver, asset and transferred amount. |
| Reputation and feedback | CLIENT EVIDENCE | Inspect the client-proof reputation and reviewer receipt records; a successful task alone is not a quality rating. |
| Envio and Merkle batch | VERIFIED | Indexed identity/shard/task and a verified batch root match the canonical execution and router commitment. |
| Dynamic / Mera / CRE | LIVE CHECK REQUIRED | Local modules/tests do not establish a successful user passkey ceremony or a production CRE workflow delivery. |
| Reviewer access | PUBLIC REPOSITORY | https://github.com/willy264/monad-astheris is public (checked 2026-10-03). No invitation sent; an email alone is not a GitHub collaborator identity. |

Live core path: **evidence collected; review payment/provider and sponsor-specific checks above**.

Local test/build results are recorded in [VERIFICATION.md](../VERIFICATION.md). Sponsor eligibility, prize amounts, organizer deadlines and required submission format have not been independently established by this evidence generator.

Curated registration, MCP and submission evidence: [SUBMISSION_PROOF.md](../SUBMISSION_PROOF.md). This generated report does not replace that record.
