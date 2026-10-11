# Reference-led dashboard redesign

Reference: [Dashboard UI Design for a Decentralized AI Startup, Inga Café-Ruoff](https://dribbble.com/shots/24622592-Dashboard-UI-Design-for-a-Decentralized-AI-Startup). The actual 4372 × 3279 image was retrieved and visually inspected before implementation. Its original is retained locally under ignored `.tools/design-reference/` for comparison, not distributed as an application asset.

## Direct observations

The desktop image uses a charcoal application frame with two full-width header rows: brand/account controls above tabs and search. A compact title and yellow action precede a divider. A bordered agent group holds four raised gray cards; a second group holds a bar chart, a wider filled line chart and a narrow table. Content shares a strong left edge, generous section separation and tighter card spacing.

Surfaces are flat charcoal and gray, with thin gray borders, moderate corners and minimal shadows. Yellow-to-amber highlights actions and charts; green marks status. Type is a plain sans serif, with moderate titles, smaller card headings and quiet labels. Cards have divided action footers; the selected navigation tab uses a gray fill. The image shows no sidebar or oversized hero.

The static image establishes no live hover/dropdown behavior, chart transitions or mobile layout. Those interactions and responsive rules are implementation decisions, not observed reference features. Its outer grid is presentation framing, not evidence of an in-product chart.

## Mapping to Aetheris

| Reference role | Aetheris implementation |
| --- | --- |
| Brand/account row | Existing Aetheris mark, Monad connection and real wallet/access controls |
| Tab/search row | Overview, Agent directory and Visualizer; actual directory search |
| Title/action | Compact page heading and entry to existing agent setup |
| Agent cards | Real registered identities and profile links; no invented agents or verified-quality badges |
| Bar chart | Actual indexed task completions per displayed agent |
| Line/area chart | Actual sampled Monad block transaction counts; no fabricated revenue history |
| Compact table | Registry, network and browser-session payment readings with provenance |
| Detailed workflows | Existing onboarding and paid-run component; directory profiles; visualizer and public receipts |

Josefin Sans remains the user-selected typeface; JetBrains Mono remains for hashes and numeric records. The purple Aetheris logo retains brand recognition while yellow/amber becomes the interface accent. Tablet and phone layouts reflow the desktop hierarchy without hiding wallet access or forcing page-wide horizontal scrolling.

The live registry currently supplies two agents, so the desktop grid contains two real cards in its four-column layout. Charts represent Aetheris task counts and sampled network activity. The account row uses the existing wallet and network controls; the reference's unrelated notification/avatar controls have no working Aetheris counterpart. These content and typography differences are intentional adaptations. The implementation is visually compared with the reference, without claiming pixel-level accuracy.

The existing Next.js application, React Query, Dynamic, Viem, contract/API integrations, receipt verification and recovery remain the functional base. The installed package is Next.js 15.5.27 despite the brief's historical Next.js 14 description. No framework migration is part of this redesign.

## Verification

Run the existing typecheck, test and build scripts; there is no configured lint script. Inspect rendered pages at desktop, tablet and mobile widths, exercise actual navigation/search, preview controls, access dialogs and visualizer interactions, and compare screenshots with the reference. Record actual results in [design verification](design-redesign-verification.md). Device ceremonies and paid transactions are separate from a UI regression check. The previously recorded domain-classification and hosting limitations remain in the [readiness report](../../docs/submission-readiness.md).
