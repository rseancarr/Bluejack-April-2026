# Brand tokens — Freestone (applied)

Source of truth: `samples/brand/FAP_VII_Investor_Presentation.pptx` (the firm's own deck) —
its PowerPoint theme (`ppt/theme/theme1.xml`), slide-master styles, colour usage counted
across all slides — and the logo file embedded in that deck (`samples/brand/freestone-logo.png`).
The second deck (`2026.08.13_MMM_Presentation_FAP_VII.pptx`) uses the default Office theme but
paints the same palette explicitly (F2EDE7, 7394B2, F9F7F4, 212121, 080E3E, DDD5C9, BA480F),
which confirms the choices below.

## Palette

| Role in app | Token | Hex | Where it comes from |
|---|---|---|---|
| Body text | `--color-ink` | `#212121` | theme `dk1` |
| Primary (buttons, KPI figures, active nav) | `--color-navy` | `#080E3E` | theme `accent1`, the most-used colour in the deck |
| Headings | `--color-navy-2` | `#000067` | slide-master title style |
| Logo / brand mark, negative figures & flags | `--color-rust` | `#9A2D00` | sampled from the logo PNG (theme `dk2` is `#99350A`) |
| Secondary accent (charts: distributions) | `--color-terracotta` | `#D9814E` | theme `accent2` |
| Chart: contributions, drop targets | `--color-steel` | `#7394B2` | theme `accent5` |
| Tertiary accents (available, unused so far) | `--color-blue`, `--color-gold`, `--color-sand` | `#0D72CC`, `#DDCA69`, `#E6DBCC` | theme `accent3`, `accent4`, `accent6` |
| Page background / striping | `--color-paper-2` | `#F9F7F4` | slide-master background |
| Panels, table headers | `--color-paper-3` | `#F2EDE7` | theme `lt2` |
| Borders, gridlines | `--color-line` | `#DDD5C9` | chart gridline colour in the deck |
| Muted text | `--color-ink-4` | `#9A938A` | muted grey used in the deck's charts |

Functional colours: positive `#2E6B3F` (not a brand colour, kept for gain/loss legibility);
negative uses the brand rust.

## Type

| Use | Face | Source |
|---|---|---|
| Body, tables, controls | Arial (fallback Helvetica, system sans) | theme major + minor font |
| Page and section headings, wordmark fallback | Georgia | slide-master `titleStyle` |

The deck also uses "Plus Jakarta Sans ExtraLight" on a few layouts. It is a Google font and
could be self-hosted later; it is not used in v1 because Arial/Georgia are the theme fonts and
the app is a dense internal tool.

## Logo

`public/brand/logo.png` (1054×295, rust wordmark on transparent) is shown in the header. A
vector version (SVG) would be sharper on high-DPI screens — drop it in as
`public/brand/logo.svg` and it takes precedence automatically.

## PWA icons

`public/icons/*.png` are the wordmark on the `#F9F7F4` background with padding (maskable
variant has extra safe-zone). Replace with an official app icon if one exists.

## Tone

Restrained: white/off-white surfaces, one border weight, navy for emphasis, rust only for the
mark and for negatives. Dense tables with tabular numerals stay the priority.
