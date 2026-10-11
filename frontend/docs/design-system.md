# Aetheris interface design system

The dashboard adapts the inspected Dribbble reference into Aetheris's existing application: a two-row horizontal header, compact page heading and primary action, grouped agent cards, and dense statistics panels. Actual identities, blockchain records and wallet controls supply the content. The reference analysis and mapping are documented in [dashboard redesign](dashboard-redesign.md); rendered comparisons and checks belong in [design verification](design-redesign-verification.md).

## Typography

| Role | Family | Use |
| --- | --- | --- |
| Display | Josefin Sans, weight 600 | Compact page titles, section headings, agent names and card titles. The Overview heading is 30px on desktop. |
| Interface | Josefin Sans, weights 400-700 | Navigation, body copy, tooltips and labels; stronger action labels use 700 where specified by their component. |
| Data | JetBrains Mono, weights 400-500 | Counts, addresses, token IDs, block numbers and transaction hashes. Use tabular figures for changing values. |

Josefin Sans loads from the Google Fonts import at the top of [`globals.css`](../app/globals.css), with normal and italic styles, weights 100-700 and `display=swap`. Page views request Google Fonts; system sans-serif text remains readable while the font loads or if it is unavailable. JetBrains Mono remains bundled in [`app/fonts`](../app/fonts) and loaded through `next/font/local` in [`layout.tsx`](../app/layout.tsx) for technical data. Bundled font files retain their SIL Open Font Licenses and provenance in [`sources.json`](../app/fonts/sources.json).

Use CSS variables `--font-display`, `--font-sans` and `--font-mono`, or the matching Tailwind `font-display`, `font-sans` and `font-mono` utilities. Use the supplied font's actual weights; headings generally use 600 and action text uses 600-700. Data uses `font-variant-numeric: tabular-nums`; a visual counter does not change its source or meaning. Avoid a large promotional hero in the workspace hierarchy.

## Palette and surfaces

| Role | Color | Meaning |
| --- | --- | --- |
| Canvas | `#171719` | Charcoal application background. |
| Group panel | `#212124` | Agent groups, statistics sections, forms and ledgers. |
| Raised card | `#303033` | Individual agent cards, chart panels, search and selected navigation. |
| Border | `#414146` | Thin neutral dividers and panel outlines. |
| Action and chart accent | `#F5CE38` | Yellow highlights for primary actions, chart marks and interactive emphasis. |
| Primary action fill | Yellow-to-amber, approximately `#FFE459` to `#EFBD2C` | Dark text (`#1B1B1E`) keeps the filled action readable. Component variants use the same color relationship. |
| Aetheris mark | `#F5CE38`, `#EFBD2C`, `#FFE459` | Gold and amber task lanes with a bright yellow crossbar; charcoal icon tiles match the canvas. |
| Parallel lanes | `#10B981` | Illustrative isolated execution and actual successful statuses, distinguished by their labels. |
| Conflicts | `#EF4444` | Illustrative shared-storage contention and error accents. |
| Main / secondary text | `#FFFFFF` / `#B2B2B8` | Clear headings and quieter supporting copy. |

Shared rules live in [`globals.css`](../app/globals.css); page and component CSS modules own their specific layouts. Cards and group panels use approximately 10-12px corners; the outer desktop application frame uses 16px corners and controls are generally 6-8px. Flat charcoal and raised gray surfaces, thin borders and divided card footers provide hierarchy. Yellow gradients are limited to the primary actions and chart fills used by the reference; there are no glowing surfaces or decorative glass layers. Status meaning is expressed in text as well as color.

## Navigation and page composition

- The first header row contains the Aetheris home link, actual Monad connection status and the existing wallet/passkey control. The second row contains **Overview**, **Agent directory** and **Visualizer**, with a neutral filled active tab and directory search. The same Dynamic wallet session serves all three routes. The reference's unrelated notification/avatar controls are not fabricated.
- Header search submits to `/agents?q=...` and filters the first directory page by name, token ID or capability. It is not a search of every registered identity across pagination. The directory's own search filters its current page. Pagination uses the actual registry total and page size; the displayed matching count changes with the filter while the registered total remains unchanged.
- Overview begins with **Agent workspace** and **Set up your agent**, followed by **Registered agents** and **Agent stats** groups. It shows up to four real agent records from the first directory page, with **View agent** links to their directory cards. Two returned agents produce two cards, not two real and two invented records.
- **Agent stats** follows the reference's three-part composition: **Task activity** presents actual indexed per-agent completion bars and the aggregate lane count; the wider **Network activity** panel charts actual Monad block transaction samples; **At a glance** contains registry, throughput and browser-session payment readings. The source and freshness disclosure follows the panels. Existing onboarding, preview and paid-run controls remain below.
- Agent Directory leads with compact registered identity cards and their expandable details. The separately owned Observer profile and paid MCP workflow remain available below. Visualizer retains both the illustrative comparison and the separate real topology, shard ledger and Merkle commitments.
- The access dialog retains passkey registration and expiring executor delegation. Signing in does not itself submit a delegation transaction or establish permission for an agent.

## Responsive behavior and accessibility

The inspected reference is a static desktop image. Mobile layouts, hover behavior and keyboard interactions are implementation choices rather than observed reference features.

- Desktop statistics use three columns; tablet uses two with the compact metrics below; small screens stack them. Agent cards reflow without adding placeholders for nonexistent records.
- The horizontal header wraps search below navigation at narrower widths. All route labels and wallet access remain discoverable. Navigation icons hide at widths of 380px and below to preserve the labels; the previous mobile sidebar no longer consumes content width.
- Within comparison containers at 560px and below, the stage headline occupies a full row so its controls can wrap without clipping. The comparison retains keyboard controls, tooltips and animation pause. Reduced-motion preferences suppress decorative animation and transitions.
- Execution and Merkle tables have named, focusable scroll regions, column headers and sticky headings. Long values scroll inside the ledger rather than widening the page. Chart samples have exact values in an accessible description and an expandable table; chart captions state their scope.
- Interactive controls retain visible focus indicators and labels. Layout checks cover desktop, tablet, 390px and 320px widths. Font checks follow loading so screenshots distinguish the requested Josefin Sans from a fallback. Physical passkey ceremonies and third-party authentication accessibility require separate verification; a visible wallet button is not proof of either.

## Evidence boundaries

The RPC badge reports a fresh Monad Testnet reading, not finality. Network activity plots network-wide transactions per sampled block, not Aetheris revenue or a synthetic performance history. Task bars use the actual indexed completion fields for the displayed agents; aggregate task lanes retain their distinct indexed-total or bounded-window provenance. Missing measurements remain unavailable rather than becoming zero, and stale readings retain their last-observed label. Micropayments settled counts verified live-task payments in this browser session; guided preview does not increment it.

The comparison's 300ms settlement, 100% efficiency, zero conflicts and 12 retries are labeled scenario values, not observed production performance. Agent #1's displayed MCP endpoint comes from its registered card and currently uses the Vercel `/api/mcp` service. An unavailable paid service remains unavailable; the visual redesign does not create task receipts, reputation, hosted indexing or device-passkey evidence.

See [the dashboard guide](README.md) for metric meanings, [brand assets](brand.md) for the logo/favicon, [the redesign mapping](dashboard-redesign.md), [design verification](design-redesign-verification.md), and [the verification record](../../VERIFICATION.md) for actual checks and their limits.
