# Aetheris submission proof

Evidence generated: 2026-10-03T22:28:08.148Z. Target: Monad Testnet, chain 10143.

This file records observed evidence. Missing credentials, receipts or indexing results remain explicit blockers; local compilation alone does not establish a live submission.


## Evidence status

| Item | Status | Detail |
| --- | --- | --- |
| Live contracts | BLOCKED | No receipt-verified deployment manifest. Configure a funded contracts/.env deployment account and run pnpm run deploy --broadcast from scripts. |
| Agent registration | BLOCKED | Needs actual MCP endpoint/card, public IPFS pin, funded owner and registration receipt. |
| Task execution | BLOCKED | Configure an authorized funded client/payment provider, run submit-task and set TASK_PROOF_PATH to its client-proof.json. |
| Envio and Merkle batch | BLOCKED | Needs a hosted GraphQL URL, verified task and finalized committed block. |
| Dynamic / Mera / CRE | LIVE CHECK REQUIRED | Local modules/tests do not establish a successful user passkey ceremony or a production CRE workflow delivery. |
| Reviewer access | PUBLIC REPOSITORY | https://github.com/willy264/monad-astheris is public (checked 2026-10-03). No invitation sent; an email alone is not a GitHub collaborator identity. |

Live core path: **incomplete — resolve the blockers above before claiming submission readiness**.

Local test/build results are recorded in [VERIFICATION.md](VERIFICATION.md). Sponsor eligibility, prize amounts, organizer deadlines and required submission format have not been independently established by this evidence generator.
