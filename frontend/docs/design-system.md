# Aetheris interface design system

The dashboard pairs a simple express-lane story with inspectable blockchain records. Large headings explain the product; compact tables, identity cards and receipt links provide the evidence. The same sidebar and wallet session serve the overview, agent directory and visualizer.

## Typography

| Role | Family | Use |
| --- | --- | --- |
| Display | Josefin Sans, weight 700 | Hero, section headings, agent names and card titles. |
| Interface | Josefin Sans, weights 400–700 | Navigation, buttons, body copy, tooltips and labels. |
| Data | JetBrains Mono, weights 400–500 | Counts, addresses, token IDs, block numbers and transaction hashes. Use tabular figures for changing values. |

Josefin Sans loads from the Google Fonts import at the top of [`globals.css`](../app/globals.css), with normal and italic styles, weights 100–700 and `display=swap`. Page views request Google Fonts; system sans-serif text remains readable while the font loads or if it is unavailable. JetBrains Mono remains bundled in [`app/fonts`](../app/fonts) and loaded through `next/font/local` in [`layout.tsx`](../app/layout.tsx) for technical data. Bundled font files retain their SIL Open Font Licenses and provenance in [`sources.json`](../app/fonts/sources.json).

Use CSS variables `--font-display`, `--font-sans` and `--font-mono`, or the matching Tailwind `font-display`, `font-sans` and `font-mono` utilities. Headings use the supplied font's real 700 weight. Data uses `font-variant-numeric: tabular-nums`; a visual counter does not change its source or meaning.

## Palette and surfaces

| Role | Color | Meaning |
| --- | --- | --- |
| Canvas | `#08090E` | Obsidian page background. |
| Card | `#11131F` | Slate cards, forms and ledgers. |
| Brand | `#836EF9`, `#A084DC` | Violet borders, accents and focus treatments. |
| Primary action fill | `#725BDF` | White button text has approximately 4.91:1 contrast. The brighter brand violet remains an accent. |
| Parallel lanes | `#10B981` | Illustrative isolated execution and actual successful statuses, distinguished by their labels. |
| Conflicts | `#EF4444` | Illustrative shared-storage contention and error accents. |
| Main / secondary text | `#FFFFFF` / `#A1A1AA` | High-contrast headings and quieter supporting copy. |

Shared rules live in [`globals.css`](../app/globals.css); page and component CSS modules own their specific layouts. Cards use 26px rounded corners, subtle borders and restrained hover highlights. An inset application frame surrounds a curved navigation rail and the dark content canvas. Status meaning is expressed in text as well as color.

## Interaction and layout

- The sidebar replaces the horizontal topbar. Its active item has a circular violet icon and concave cutout. On desktop, the keyboard-accessible toggle switches between a 228px labeled rail and an 88px icon rail. Mobile uses a 64px rail with named links and controls. RPC status and shared passkey access remain at the bottom of the rail.
- The overview uses an asymmetric card grid: a large introduction beside network readings, then network activity, delegation and receipt cards. Columns respond to the available content width and stack on mobile.
- The delegation card explains three steps: sign in, choose an executor, then set an expiry. Signing in does not itself submit a delegation transaction.
- The comparison retains keyboard controls, tooltips and animation pause. Reduced-motion preferences suppress decorative animation and transitions.
- Execution and Merkle tables have named, focusable scroll regions, column headers and sticky headings. Rows highlight on hover; long values scroll inside the ledger rather than widening the page.
- Directory pagination derives its page count from the actual registry total and page size. Search filters the current page; “Showing” changes with that filter while “registered” remains the source's total.
- Layouts adapt through desktop, 390px and 320px widths, including the reduced content area beside the mobile icon rail. Interactive controls retain visible focus indicators. Fonts are checked after loading, so screenshots do not silently validate a fallback font.

## Evidence boundaries

The RPC badge reports a fresh Monad Testnet reading, not finality. The comparison's 300ms settlement, 100% efficiency, zero conflicts and 12 retries are labeled scenario values, not observed production performance. Agent #1's displayed MCP endpoint comes from its registered card and currently uses the Vercel `/api/mcp` service. An unavailable paid service remains unavailable; the visual redesign does not create task receipts, reputation, hosted indexing or device-passkey evidence.

See [the dashboard guide](README.md) for metric meanings, [brand assets](brand.md) for the logo/favicon, and [the verification record](../../VERIFICATION.md) for actual test and browser results.
