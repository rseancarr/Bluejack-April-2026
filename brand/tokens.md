# Brand tokens — proposal (PLACEHOLDER, needs confirmation)

**Status: not Freestone's brand yet.** This build environment could not reach
`https://www.freestonecapital.com` (egress blocked by network policy) and
`/samples/brand/` did not exist, so no colors, typefaces, or logo could be
extracted. Per the brief ("do not invent colors or fonts"), the app ships with a
neutral, restrained placeholder set: ink black on white, a warm-gray neutral
ramp, no brand accent, and a system font stack. It is designed to be swapped in
one place.

## What is needed from you

Any one of the following unblocks the real tokens:

1. Drop a brand guide and/or logo files into `/samples/brand/` (SVG preferred), or
2. Paste the site's primary/secondary hex values, neutral palette, heading and
   body typeface names (and whether the fonts can be self-hosted), or
3. Run the app from a machine with web access and share the site's stylesheet
   URLs; the extraction can then be finished.

## Where tokens live

- `app/globals.css` → the `@theme { ... }` block. Tailwind v4 reads these as
  utilities (`bg-paper`, `text-ink-3`, `border-line`, `font-serif`…).
- Header logo: put `logo.svg` in `public/brand/`; the header switches from the
  text wordmark to the image automatically (see `components/AppShell.tsx`).

## Current placeholder values

| Token | Value | Intended role once brand is confirmed |
|---|---|---|
| `--color-ink` | `#141414` | primary text, primary buttons |
| `--color-ink-2/3/4` | `#3d3d3d` / `#6b6b6b` / `#9a9a9a` | secondary text, labels, disabled |
| `--color-paper` | `#ffffff` | page background |
| `--color-paper-2/3` | `#f7f6f3` / `#f1efeb` | table headers, striping, panels (warm off-white) |
| `--color-line`, `--color-line-2` | `#e3e1dc` / `#eeece8` | borders, row dividers |
| `--color-accent` | `= ink` | **brand primary — TBD** |
| `--color-accent-soft` | `#ecebe7` | **brand primary tint — TBD** |
| `--color-pos` / `--color-neg` / `--color-warn` | `#2e6b3f` / `#a63a2a` / `#8a6d1d` | functional only (gain/loss/flag); not brand |
| `--font-sans` | system stack | **body typeface — TBD** |
| `--font-serif` | `ui-serif, Georgia` | **heading / wordmark typeface — TBD** |
| radii | 2–3px | minimal chrome |

## Applied tone (independent of the final palette)

- Generous white space around dense tables; minimal chrome; one weight of border.
- Tabular numerals, right-aligned figures; `$12.3M`, `1.25x`, `12.3%`.
- Subtle row striping and sticky table headers.
- Light mode only.
- Footer: "Freestone Capital — Internal. Confidential."
