# Dashboard redesign verification

Evidence files identified as local files below are retained only in the verification workspace and are not published in this repository. Existing linked transaction evidence remains available in the repository.

Verified on October 11, 2026 against a local production build at `http://127.0.0.1:3100`. This verifies the redesigned frontend; it does not describe a new production deployment or a new paid task run.

## Reference and rendered comparison

The actual 4372 × 3279 [Dribbble reference](https://dribbble.com/shots/24622592-Dashboard-UI-Design-for-a-Decentralized-AI-Startup) was inspected before implementation. A side-by-side comparison was then generated and visually inspected using the fully loaded production render:

- Reference beside the implemented Overview (local file: `.tools/redesign-verification/2026-10-11T02-56-42-455Z/reference-comparison-1440.png`)
- Desktop Overview (local file: `.tools/redesign-verification/2026-10-11T02-56-42-455Z/overview-1440.png`)
- 390px Overview (local file: `.tools/redesign-verification/2026-10-11T02-56-42-455Z/overview-390.png`)
- 320px Overview and keyboard focus (local file: `.tools/redesign-verification/2026-10-11T02-56-42-455Z/overview-320.png`)
- Desktop agent directory (local file: `.tools/redesign-verification/2026-10-11T02-56-42-455Z/agents-1440.png`)
- 390px Visualizer (local file: `.tools/redesign-verification/2026-10-11T02-56-42-455Z/visualizer-390.png`)

The result reproduces the reference's two horizontal header rows, compact heading/action band, divided agent panel, four-column card capacity, asymmetric statistics row, charcoal/gray surfaces, thin borders, moderate corners, and yellow/amber actions and charts. Aetheris retains its mark and the requested Josefin Sans. Browser font checks confirmed that Josefin Sans was loaded, rather than merely declared in CSS.

The adaptations are deliberate: only the two actual registered agents appear; the charts show indexed task completions and sampled network transactions instead of invented revenue; the reference's unrelated avatars and notification controls were not added. Agent details and execution history remain on their existing routes. The reference provides one desktop image, so tablet/mobile behavior is an implementation adaptation. This is not a claim of pixel-level identity.

## Checks completed

| Area | Result |
| --- | --- |
| Frontend type checking | `pnpm typecheck` passed |
| Existing frontend tests | `pnpm test`: 173 passed |
| Production compilation | `pnpm build` passed, including after the mobile CSS fixes |
| Lint command | No standalone lint script is configured in this package |
| Route/viewport matrix | `/`, `/agents`, `/visualizer` inspected at 1440, 1024, 768, 390 and 320px |
| Layout | No page-wide horizontal overflow; header control bounds checked independently of clipping; receipt tables remain inside focusable scrolling regions |
| Navigation | Active route state, accessible mobile navigation, visible keyboard focus, working `/agents?q=` search submission and empty-search result |
| Overview | Real registered identities, sample-backed network chart with expandable block table, actual task counts, and unavailable session payments distinguished from zero |
| Directory | Actual identity/reputation data, owner links and metadata expansion; native delegation dialog opened for the selected agent and fitted all five widths |
| Visualizer | Created/executed/all filters, actual shard details, transaction links, both comparison modes and pause control |
| Preview | Five explicitly simulated lanes complete without wallet interaction or transaction receipts |
| Live setup | Real local unavailable state inspected; captured successful production configuration replayed only to inspect unauthenticated onboarding at 1440, 390 and 320px |
| Authentication | Actual Dynamic popup opened, displaying email, passkey and wallet choices; no provider was selected |
| Controlled API states | Deliberately delayed, empty and HTTP 503 directory responses display loading, empty and error states without invented agent cards |

Actual public APIs reported two agents, 22 completed task lanes and 22 verified batch roots during this verification. These are time-specific observations, not fixed dashboard values. The bar chart used the observed Agent #1 and #2 completion counts of 2 and 20. No transactions were submitted by this verification.

Two visual issues were found and corrected: the Visualizer navigation link extended approximately 4px beyond its header at 320px, and the comparison status sentence became an excessively narrow column at 390px. Final 320/390/1440 checks and screenshots confirm both corrections. The tablet checks passed before these changes, which only affect the narrower breakpoints.

## Evidence and test boundaries

The ignored local harness is `.tools/verify-redesign-ui.mjs`. Its reports and screenshots remain available in this workspace:

- Original matrix report (local file: `.tools/redesign-verification/2026-10-11T02-43-01-985Z/report.json`): desktop/tablet/390px checks passed; the 320px bounds check found the clipping issue subsequently fixed.
- Final route and interaction report (local file: `.tools/redesign-verification/2026-10-11T02-56-42-455Z/report.json`): 90 checks passed across final 320/390/1440 routes, preview, production-config onboarding and search. The subsequent authentication assertion failed because the harness initially looked for a generic dialog role instead of Dynamic's shadow-DOM login view. Its screenshot shows the real popup.
- Corrected authentication and controlled-state report (local file: `.tools/redesign-verification/2026-10-11T03-05-16-498Z/report.json`): all 11 scoped checks passed after correcting the selector and public SDK-settings request allowlist.
- Actual Dynamic popup (local file: `.tools/redesign-verification/2026-10-11T03-05-16-498Z/authentication-prompt-1440.png`)
- Unauthenticated onboarding using the captured production configuration (local file: `.tools/redesign-verification/2026-10-11T02-56-42-455Z/production-config-onboarding-390.png`)
- Controlled loading (local file: `.tools/redesign-verification/2026-10-11T03-05-16-498Z/synthetic-loading-1440.png`), empty (local file: `.tools/redesign-verification/2026-10-11T03-05-16-498Z/synthetic-empty-1440.png`), and error (local file: `.tools/redesign-verification/2026-10-11T03-05-16-498Z/synthetic-error-1440.png`) states

The layout and public-data checks used actual API responses. Only the explicitly labeled state tests replaced directory responses. The onboarding layout test replayed an actual successful public `https://monad-astheris.vercel.app/api/demo/config` response; it did not establish that the local payment service was enabled. The local endpoint returned HTTP 503. The production endpoint returned both HTTP 503 and HTTP 200 during separate observations, with HTTP 200 in the final route run.

The harness prevented account creation, wallet signing, task/payment submission and transaction writes. Dynamic's public `sdkSettings` endpoint uses POST for a configuration read. Early harness attempts incorrectly blocked that request, producing initialization failures; the exact endpoint was subsequently allowed. The corrected run opened the real popup and had zero uncaught JavaScript runtime exceptions, but still logged four SDK project-settings fetch/cached-fallback console messages. Their remaining cause was not established. This is not a claim of zero console errors or a verified provider outage.

Wallet connection, physical passkey registration/sign-in, registration/delegation transactions, new x402 payments and saved paid-run recovery were not re-executed. Their underlying integrations and existing tests remain in place; this UI check cannot replace device and transaction evidence. The prior domain-classification, hosting and submission requirements remain documented in the [readiness report](../../docs/submission-readiness.md). Use the [manual test guide](manual-test-guide.md) for those steps.

The Next build also printed the existing Node local-storage-path warning while completing successfully. No new deployment, contract or indexer change was part of this redesign verification.
