# CareNest visual direction

Updated 31 October 2026. The owner requested a Linear-inspired aesthetic in both light and dark modes. This supersedes the earlier cobalt/medical-photo direction in `docs/CARENEST_DESIGN_DIRECTION.html`.

## Reference and interpretation

Reference: https://linear.app/ (inspected in the browser on 31 October 2026; page text also retrieved with Firecrawl).

Observed in the rendered reference: near-black body `rgb(8, 9, 10)`, Inter Variable, restrained separators, muted navigation, a left-aligned 64px heading with approximately 510 weight and -1.4px tracking at the inspected desktop viewport, and a light neutral signup button. These are observations of one desktop state, not a complete extraction of Linear's private application or light theme. Firecrawl returned page content, not screenshot/branding fields; the actual browser screenshot supplied visual evidence.

CareNest adapts those qualities, retaining its own heart mark, family/pet vocabulary, consultation search, fee comparison and care coordination. No Linear artwork, logos, copy or mock workspace data are used. The light palette is a CareNest implementation choice, not an assertion about Linear's light theme.

Design read: **Energy 1 / Rhythm 2 / Motion 1**. Quiet visual hierarchy; distinct density for the introduction, working search, care coordination and provider comparisons; interaction feedback without entrance effects.

## Tokens

| Role | Light | Dark | Purpose |
| --- | --- | --- | --- |
| Canvas | `#fafafa` | `#0c0d0f` | Neutral backdrop across patient and clinic screens |
| Content surface | `#ffffff` | `#131416` | Forms, provider results and working panels |
| Secondary surface | `#f3f3f5` | `#191a1e` | Grouping without large shadows |
| Main text | `#202124` | `#eeeff1` | Readable hierarchy |
| Secondary text | `#62636e` | `#a0a1ac` | Supporting information, not disabled text |
| Separator | `#e0e0e5` | `#2d2e34` | Content boundaries; not the sole input boundary |
| Input boundary | `#8b8c96` | `#747681` | At least 3:1 against the control surface |
| Link/selection | `#5455b6` | `#b7b8ff` | Restrained violet identifies navigation and selections |
| Main action | `#282930` / white | `#e8e8ec` / `#17181c` | Neutral high-contrast actions |

Semantic success and warning colours remain distinct from the decorative palette. Required information is also expressed in words. Inter serves UI and headings; removing the second heading font reduces font requests. Heading weights are lighter and tracking tighter than the previous design. Keep body and field labels legible rather than copying dense desktop-app typography onto a healthcare phone screen.

## Composition and components

- The homepage opens with a clear family-care heading and links to actual account/provider workflows. The bordered care finder is a real search form, followed by clinic/video/home/pet destinations. It is not an interactive-looking product illustration.
- Care coordination uses service rows; provider comparisons use cards. This difference follows the decisions each section supports.
- Controls use modest corners, 44px minimum targets and visible keyboard focus. Panels use slightly larger corners. No ornamental glow or background grid.
- Existing care imagery on relevant service pages is retained with restrained saturation. Provider initials remain honest placeholders; remove coloured gradient art rather than implying sample identities have real portraits.
- The clinic rail, calendar, tables and patient forms inherit the same surface and text tokens. Layout and backend behaviour remain governed by the existing workflows.
- System, Light and Dark remain explicit choices. Respect the saved preference before first paint; do not force dark mode to resemble the reference.
- Mobile uses a shorter introduction, stacked search controls, two-column care destinations and the existing bottom navigation. Tablet and desktop layouts keep their own breakpoints.

## Verification

Core token contrast was measured with the bundled `antislop-human/contrast-check.py` formula: normal-text pairs 5.37:1 or higher, main actions 14.48:1 or higher, input boundaries 3.34:1 or higher. See `docs/LINEAR_THEME_QA.md` for rendered-browser checks and build results. This is not a claim that every legacy page has received a full accessibility audit.
