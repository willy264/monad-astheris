# Aetheris submission proof

Evidence generated: 2026-10-07T19:21:43.052Z. Target: Monad Testnet, chain 10143.

This file records observed evidence. Missing credentials, receipts or indexing results remain explicit blockers; local compilation alone does not establish a live submission.

- identityRegistry: [0x754d7f2fd55a9841dbff248f9cb91d497116f231](https://testnet.monadscan.com/address/0x754d7f2fd55a9841dbff248f9cb91d497116f231) — [deployment transaction](https://testnet.monadscan.com/tx/0x9a30b9b3d8ce9efc2854c6015faf322adcbfb6befdb3a40a9633248c20c55924).
- reputationRegistry: [0x8f1fe9beef6df891189355129bf48f073d9ab322](https://testnet.monadscan.com/address/0x8f1fe9beef6df891189355129bf48f073d9ab322) — [deployment transaction](https://testnet.monadscan.com/tx/0xd33a1d00bbcff1a71520478a03843aa718e80f90fccf9855527e5ed4441992d3).
- validationRegistry: [0xcd0cf354acd2c79145caeac7d4f0639f8957308d](https://testnet.monadscan.com/address/0xcd0cf354acd2c79145caeac7d4f0639f8957308d) — [deployment transaction](https://testnet.monadscan.com/tx/0x4e57487e9c8e249f83dc9ea294fa29c4d13de0b98177654d125900706c8b02d0).
- router: [0xac4a33521b32122c9f014eac8800144dd9aa5ebe](https://testnet.monadscan.com/address/0xac4a33521b32122c9f014eac8800144dd9aa5ebe) — [deployment transaction](https://testnet.monadscan.com/tx/0xabc10b999bf0114783274620a1f3bdb03cdc8d828d56c078ac9403780863a69a).

Agent **1**: ipfs://bafkreibo5gtw45fi27ykfsbubt7uo6vze3s4x44ytqf735ojnnhhylpuea; [registration](https://testnet.monadscan.com/tx/0xc9bbd6e8a390f4fb1788f3d305f241293ec919b49d35238c7aeda5c829f3a716).

## Evidence status

| Item | Status | Detail |
| --- | --- | --- |
| Live contracts | VERIFIED | Four deployment receipts, runtime code hashes and canonical blocks rechecked; compiler/linkage evidence is in contracts/deployments/10143.json. |
| Agent registration | VERIFIED | Owner, URI and successful registration receipt checked against the configured registry. |
| Task execution | BLOCKED | Configure an authorized funded client/payment provider, run submit-task and set TASK_PROOF_PATH to its client-proof.json. |
| Envio and Merkle batch | BLOCKED | Needs a hosted GraphQL URL, verified task and finalized committed block. |
| Dynamic / Mera / CRE | LIVE CHECK REQUIRED | Local modules/tests do not establish a successful user passkey ceremony or a production CRE workflow delivery. |
| Reviewer access | PUBLIC REPOSITORY | https://github.com/willy264/monad-astheris is public (checked 2026-10-03). No invitation sent; an email alone is not a GitHub collaborator identity. |

Live core path: **incomplete — resolve the blockers above before claiming submission readiness**.

Local test/build results are recorded in [VERIFICATION.md](../VERIFICATION.md). Sponsor eligibility, prize amounts, organizer deadlines and required submission format have not been independently established by this evidence generator.

Curated registration, MCP and submission evidence: [SUBMISSION_PROOF.md](../SUBMISSION_PROOF.md). This generated report does not replace that record.
