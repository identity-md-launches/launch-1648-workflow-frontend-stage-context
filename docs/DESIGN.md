# VisualIdentity.md design system

## Overview

This is an editorial voting interface for identity.md seat holders and collectors. A neutral warm page gives the three proposals equal space. The heading identifies the product immediately; the adjacent voting panel is the primary task. The website deliberately has no hero illustration or oversized introduction separating the reader from voting.

Implementation is in `web/src/`. This document is in `docs/` because the assignment protects repository-root files, including the otherwise requested root `DESIGN.md`.

## Colors

The single light theme is defined in `web/src/styles.css:36`. There is no theme toggle or implied dark-mode support. Components use semantic role tokens, backed by a small set of used primitives.

| Semantic token | Value | Role |
| --- | --- | --- |
| `--color-bg` | `#f6f5f0` | Warm page background |
| `--color-surface` | `#ffffff` | Voting, transaction and modal surfaces |
| `--color-surface-muted` | `#ecece4` | Disabled controls and supporting surfaces |
| `--color-text` | `#252b28` | Primary copy and structure |
| `--color-muted` | `#535e57` | Secondary copy and data labels |
| `--color-border` | `#d6dcd5` | Section separators |
| `--color-input-border` | `#9baba0` | Neutral control edges |
| `--color-accent` / `--color-focus` | `#ad341c` | Primary action and visible focus |
| `--color-accent-soft` | `#ffdfd1` | Notices and selection highlight |
| `--color-error` | `#9e2424` | Error messages and irreversible actions |
| `--color-success` | `#28603a` | Small live-state indicator with accompanying text |

The three gallery backgrounds are intentionally separate art colors, not interface status colors: Keystone `#e7e8f3` with `#1f2a6b` text; Orbit `#e1ebe5` with `#0b3d3a`; Lattice `#efe9d9` with `#22223b`. The marks keep their original colors exactly. Hovering a primary action darkens its fill to `#8e2c18`; destructive hover uses `#7b1d1d`.

The pinned rendered contrast probe checks actual solid backgrounds, and the review record preserves its results. Do not use the pale separator token for text. Color never carries voting status alone: selected radios, result labels, transaction messages and visible disabled states provide separate cues.

## Typography

All fonts are local WOFF2 files in `web/public/fonts/`, with `font-display: swap` and included OFL licenses.

- Body, controls and data: **DM Sans**, 400 and 600, falling back to `system-ui, sans-serif`.
- Headlines and shared headings: **Space Grotesk**, 700, with the same fallback.
- Orbit guide subheadings: **Fraunces**, 700, with a serif fallback.
- Lattice guide subheadings: **Space Mono**, 700, with a monospace fallback. Long prose remains DM Sans.

The six token sizes are 14, 16, 20, 28, 40 and 56 px at the default root size, expressed as rem. Body line-height is 1.6. Headings use 1.2, with the short mobile hero at 1.05. Headlines have the heaviest weight. Body text is never below 400. The default type scale is not expanded by page-specific decorative labels.

Large headings use tight tracking (`-.055em` desktop; `-.05em` mobile hero), while smaller headings stay within `-.035em`. Body copy is untracked. Headings balance their wrapping, descriptions use pretty wrapping, and long-form guides are capped at 72ch. Addresses and other long identifiers wrap with `overflow-wrap: anywhere`. Numerical amounts, votes, counters and timers use tabular figures. All amount inputs are at least 16 px.

## Layout

`styles.css:194` defines shared horizontal edges for header, main and footer. Desktop content is at most 1,248 px wide, inset 48 px from the viewport. The horizontal inset becomes 32 px below 68rem and 20 px below 38rem.

Spacing follows a 4 px base with 8, 12, 16, 24, 32, 48 and 64 px groupings. The hero is a two-column grid with a 1.15:1 ratio and 80 px gap on large screens, reducing to 40 px below 68rem. It stacks below 52rem, placing the compact introduction before the vote panel. At 390 × 844 the product, three-choice selector and main wallet action are all visible without scrolling.

The gallery uses three equal columns on desktop and one below 38rem. At the intermediate breakpoint, artwork scales down before the grid stacks. Collection and trade pages use two columns above 38rem. Guide and about layouts stack below 52rem. On narrow guide pages, downloads come before the article and carry clear labels. Tables use fixed layout and wrapping rather than sideways scrolling.

Observed browser widths: 320, 390, 768 and 1440 CSS pixels, across the home, guides index, three guides, collect, trade and about routes. Text enlargement to 200% was also checked at 390; this is not a claim of native browser-zoom testing. There is no sticky header or floating action that can cover page content.

## Elevation & Depth

The site is deliberately flat: no box shadows, gradient text or nested card shadows. White transactional surfaces sit against the warm background. Thin separators organize the gallery, footer and detailed records. The native dialog is the sole overlay, using a dark translucent `#151a18b3` backdrop; background interaction is blocked by `showModal()`.

## Shapes

`--radius` is 8 px for controls and artwork surfaces. Desktop transaction surfaces and dialogs use 12 px; the mobile vote panel uses 10 px. State is carried by a two-pixel selected radio outline, a three-pixel focus ring with four-pixel offset, and native form controls. Keep the circles and geometric details inside finalist artwork separate from interface component shapes.

## Components

| Pattern / source | Use and behavior |
| --- | --- |
| `WalletButton`, `RequireWallet` in `components.tsx` | Connect, connected account dialog and one network-switch action. No wallet and rejection errors are explicit. Disconnected action areas provide an actionable connector. |
| `.button`, `.primary`, `.danger` | Neutral navigation/control, one emphasized task action, and explicitly reviewed irreversible action. Disabled controls retain readable labels. Press feedback is opt-in to motion preference. |
| `FinalistPicker` in `components.tsx` | Native radio group with a visible legend, full-label targets, original art and selection outline. Arrow keys use native radio behavior. |
| `Vote` in `Vote.tsx` | Discovery progress, used/unused seats, selected-seat vote, closed-window state and persistent action feedback. |
| `TxStatus` in `components.tsx` | Stable status or alert region, phase-specific messages, explorer link and check-confirmation recovery. |
| `ConfirmDialog` in `components.tsx` | Native modal for collector burns and NFT management. Focus is contained and restored by the browser; Escape closes before submission; pending actions keep the modal locked. |
| `Amount`, `AddressLink` in `components.tsx` | Token decimals and units, full-value title, checksummed explorer link and copy action. Address copy failure reveals the complete value. |
| `FinalistGallery` in `Guides.tsx` | Consistent artboard, mark, concept, votes, relative vote bar and contract-derived leader/winner label. |
| `Collect`, `Portfolio` in `Collect.tsx` | Separate approval/mint controls; on-chain NFT metadata; review before burning, transferring or approving an NFT. |
| `Trade` in `Trade.tsx` | Input amount, slippage, minimum output, input balance, quote expiry and exactly one applicable approval/swap step. |
| `Guides` in `Guides.tsx` | Markdown rendered without raw HTML execution, local assets, download list and palette swatches. |
| `.chain-status` | Last-read block, data age, verification state and manual retry. Transaction controls stop on stale or failed reads. |

Every route uses one main landmark and an h1. The first focusable item skips navigation. Hash-route changes move focus to main. Errors are close to their control and use live announcements. Dialogs receive unique accessible-title ids. No animation runs on page load. Reduced motion removes button press transforms and the short art hover movement. Forced-color rules preserve selection and buttons.

## Do's and Don'ts

- Start another page inside the existing main container with `.page-heading`; reuse `.section-heading` and the six type tokens.
- Use a native button for an action and an anchor for navigation or downloads. Preserve visible labels and 44 px targets where practical.
- Keep eligibility and simulation checks in front of wallet requests. Reuse `transact` instead of adding a second signing path.
- Read deployment addresses only from the loaded manifest or verified contract getters. Do not copy them into new components.
- Keep voting and collecting distinct. Never describe a paid collector mint as a vote.
- Keep the finalists visually equal until the contract reports a leader or winner. Do not infer a winner from local sorting.
- Do not turn brand swatches into interface statuses, add a second accent action, or introduce tracked uppercase eyebrows.
- Keep asset paths relative and navigation hash-based. New exported files must appear in the regenerated deployment manifest.
