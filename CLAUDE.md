# Freestone portfolio app — project context for Claude

Read this first in any new session. It carries the context that used to live only in chat.

## What this is
Internal portfolio-management web app for Freestone Capital's three-person private-equity team
(Sean, AJ, Teddy). Next.js App Router + TypeScript, Prisma on SQLite (Postgres-swappable), Tailwind v4,
Recharts, dnd-kit, ExcelJS. Single shared password. Hosted on Render via `render.yaml` (auto-deploys
from the repo's main branch); also runs locally with `npm run dev`. `README.md` has the user-facing
setup and hosting guide and a "Next layers" list; `lib/metrics/README.md` documents every derived number.

The user is a finance professional, not a developer: explain things in plain English, give copy-paste
commands, and never assume they know git, npm, or what a "schema" is.

## Non-negotiable data rules (already implemented, keep them)
- Financial numbers come only from the accounting workbooks (the monthly `*_TB_Analysis*.xlsx/.xlsm`
  files). Never compute, infer, forward-fill, or estimate a financial figure.
- A missing figure is stored as null and shown as "—" with a tooltip naming the import it was expected in.
- The parser fails loudly (`ParseError` listing every problem) rather than guessing. Layout constants live
  in `lib/import/schema.ts`; two layouts are supported: "dashboard" (FAP IV/V/VI: Dashboard*, MTM,
  IRR Detail, Exposure by Asset Class, LP Capital Roll GP row) and "winddown" (FAP III: TB Recalc, MTM,
  IRR, Valuation).
- Everything is stored as received (`sourcesJson` records the sheet/cell). Derived metrics live in
  `lib/metrics` only, are documented there, and are null-in → null-out.
- Every import is previewed with reconciliation checks (`lib/import/reconcile.ts`) that reproduce the
  workbook's own arithmetic; a flag means the file is internally inconsistent. Example: FAP V's Dashboard
  shows negative GP Carry distributions that net accrued carry to zero — the app flags it and shows the
  LP Capital Roll GP row alongside, but does not "fix" the number. Fixes belong in the accounting file.
- One committed batch per fund per as-of date; the app always shows each fund's latest committed import.
- Holdings are matched by name via `NameMapping` (files carry no IDs). Bucket and asset class are
  attributes, not financials: `npm run refresh-attributes -- <folder>` refreshes them without re-import.

## Sensitive files — never commit
- `samples/*.xlsx|*.xlsm` (real fund / LP data) and `samples/brand/*.pptx|*.pdf` are gitignored.
- `.env` holds `APP_PASSWORD`, `TEAM_MEMBERS`, `SESSION_SECRET`; `prisma/dev.db` holds the team's real
  tasks and imports. Both are gitignored and survive `git pull`. `npm run team -- "Sean,AJ,Teddy"` edits
  the team list.
- Do not put model names or AI identifiers in code, commits, or docs.

## Layout of the code
- `app/` pages: `/` home (fund table, totals, GP carry, asset-class pies), `/today` My day (per-person
  printable card), `/investments` (grouped by fund), `/pipeline` kanban + `/pipeline/funnel`,
  `/action-items` (+ `/meeting` mode), `/import` (upload → preview/reconcile → commit), `/funds/[id]`,
  `/investments/[id]`, `/pipeline/[id]`. `/funds` redirects home (the Funds tab was removed on request).
- `lib/import/` parser, match, diff, reconcile, commit, build (test fixtures). `lib/queries/` read models.
  `lib/actions/` server actions. `components/` UI; `app/globals.css` holds the brand tokens and table CSS.
- `scripts/` setup, import (`npm run import -- <file|folder> --create-missing`), refresh-attributes,
  team, rename-owner, lan. `prisma/real.ts` seeds the real weekly action-item list; `prisma/seed.ts` is demo.
- Tests: `npm test` (vitest). Real-file tests skip when `samples/` workbooks are absent. `npm run typecheck`.

## Brand
Colors and fonts from the firm's deck: navy #080E3E, navy-2 #000067, rust #9A2D00, terracotta #D9814E,
steel #7394B2, gold #DDCA69, sand #E6DBCC, paper #F9F7F4/#F2EDE7, line #DDD5C9; Georgia headings,
Arial body; logo `public/brand/logo.png`. Full notes in `brand/tokens.md`.

## Conventions the user has asked for
- Tables: one line per row, fixed height, long text clipped with "…" and full text on hover (`.clip`).
- Investments ordered by size (NAV) everywhere, grouped by fund with expand/collapse.
- Tasks: click any title to edit in place (title, owner, due, link, notes, must-do, done, delete).
- Quick-add button in the header for tasks and pipeline deals.
- Funnel: no source type or days-in-stage; visual YTD vs last-year funnel at the bottom.
- Home fund table: ▸ on each fund expands its activity (partner cash flows by class from the "LP
  Performance" tab, NAV by class per import). Same panel on the fund page.

- My day: each person can paste their published Outlook calendar (.ics) link; the day's meetings
  (time, title, video/room, invitees, cleaned agenda) appear on the card and printout, with ‹ › day
  navigation. `lib/calendar/` (node-ical). `TEAM_TIMEZONE` env, default America/Los_Angeles.

## Ideas the user has raised but not yet built
- Pipeline inbox: drop teasers/emails in, Claude summarises into the Screening column.
- Replace the demo pipeline data with the team's real pipeline file (user will provide).
- My day: top emails-to-reply and an AI-written brief (would need Microsoft Graph or a scheduled
  Claude routine posting into the app); calendar is done via the published link.
- Historical pipeline backfill; Postgres when hosting for the whole team (README "Next layers").
