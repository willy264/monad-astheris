# Aetheris visual identity

For typography, interface colors, tables and component styling, see the [interface design system](design-system.md). The logo assets below remain shared across the dashboard and favicon.

The Aetheris mark refines the dashboard's original Λ into an open **A**. Two separated diagonal strokes suggest independent task lanes; the floating crossbar suggests a recorded result. The gaps remain visible when the mark is reduced to a browser tab icon.

This is an original code-native vector design. The editable SVG uses three geometric paths, without a font, stock illustration or external image-generation service. PNG and ICO exports were rendered deterministically from the same coordinates with Pillow and 4× supersampling. No frontend runtime dependency was added to generate or display the assets.

## Downloadable assets

| Asset | Size / format | Use |
| --- | --- | --- |
| [aetheris-logo.svg](../public/brand/aetheris-logo.svg) | Editable SVG, `64 × 64` viewBox | Primary mark; used by the dashboard navigation. |
| [aetheris-logo.png](../public/brand/aetheris-logo.png) | `1024 × 1024`, transparent RGBA | Separate high-resolution logo for slides, submission material and compositing. |
| [aetheris-icon-512.png](../public/brand/aetheris-icon-512.png) | `512 × 512`, RGBA | Mark on a rounded dark tile for app/profile artwork. Corners remain transparent. |
| [favicon.ico](../app/favicon.ico) | ICO with `16`, `32`, `48` and `64` px frames | Browser tab/favicon, installed through Next.js App Router metadata conventions. |
| [apple-icon.png](../app/apple-icon.png) | `180 × 180`, opaque RGB | Apple touch icon. The operating system applies its own corner treatment. |

When the frontend is running, the separate PNG is available at **`/brand/aetheris-logo.png`** and the editable source at **`/brand/aetheris-logo.svg`**. The 512px icon is a downloadable export; its presence does not configure an installable PWA or web manifest.

## Colors and spacing

| Role | Color |
| --- | --- |
| Primary lane | `#836EF9` |
| Secondary lane | `#A18EFF` |
| Floating crossbar | `#D8D1FF` |
| Icon background | `#121020` |
| Quiet tile border | `#342D51` |

Keep the square proportions and the separation between all three shapes. The SVG includes built-in clear space; do not crop tightly around the strokes or close the gaps. The transparent mark is intended primarily for dark backgrounds. Use the dark tile when the surrounding surface is unknown, including browser tabs. Do not add a glow or shadow to the small favicon frames.

The word **AETHERIS** appears next to the mark in the expanded sidebar. Compact and mobile rails retain the mark and accessible home-link name. The image is decorative within the navigation link, whose accessible name remains **Aetheris home**. [Sidebar.tsx](../components/Sidebar.tsx) loads the shared SVG through Next.js Image, and [Sidebar.module.css](../components/Sidebar.module.css) controls its desktop and mobile sizes. [Shell.tsx](../components/Shell.tsx) includes this global navigation on every page.

## Favicon integration and verification

The app uses one native `app/favicon.ico` and one `app/apple-icon.png`. Next.js emits their metadata links. There are no additional manual favicon declarations in `app/layout.tsx` and no duplicate `app/icon.png` route.

Exports were checked for dimensions, PNG alpha behavior and all four ICO frame sizes, and the rendered mark was visually inspected at large and small sizes. The transparent 1024px PNG contains both fully transparent background pixels and fully opaque mark pixels. The production build and desktop/mobile browser checks confirmed the logo, single favicon/Apple metadata links and exact served image files. Browser favicon caches may require a refresh after replacing an older icon.

Use [the frontend guide](../README.md) to run/build the app, and [the dashboard guide](README.md) for the meaning of its illustrations and live data labels.
