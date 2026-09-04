# Freestone Portfolio (internal, v1)

Internal portfolio-management app for a three-person team running four PE-style
funds. Optimised for speed of logging; all financial figures come from accounting's
monthly Excel workbook and are never typed in by hand.

**Stack:** Next.js 16 (App Router) · TypeScript · Prisma 6 on SQLite (Postgres-ready)
· Tailwind v4 · Recharts · dnd-kit · ExcelJS · Vitest.

> All seeded data is fake ("Demo Fund I…IV", invented company names).

---

## Setup

```bash
cp .env.example .env          # set APP_PASSWORD, TEAM_MEMBERS, SESSION_SECRET
npm install
npx prisma generate
npx prisma db push            # creates prisma/dev.db
npm run db:seed               # demo data (see below)
npm run dev                   # http://localhost:3000
```

Sign in with the shared password from `.env` and pick your name (names come from
`TEAM_MEMBERS`; the choice drives "my open items" and owner defaults).

Other commands:

| Command | What it does |
|---|---|
| `npm run db:wipe` | **Wipes everything**: all tables + `storage/documents` + `storage/imports`. The single command to remove demo data. |
| `npm run db:reset` | wipe, then seed |
| `npm test` | unit tests (metrics, parser, reconciliation/diff, stage events) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build && npm start` | production build |

### What the seed creates

4 funds (vintages 2021/2023/2025/2026), 37 investments, ~40 pipeline deals over
2024–2026 with exact stage histories, 15 action items, and **two months of
financial snapshots**. The snapshots are not inserted directly: the seed writes two
demo accounting workbooks to `storage/imports/demo/` and pushes them through the
real parser → match → commit path, so the import pipeline is exercised on every
seed and you have two files to re-import by hand. The July file deliberately
contains one new investment, two >10% mark moves, a blank IRR and a blank MOIC,
and a $2,500 reconciliation variance on Demo Fund II, so the preview has
something to flag.

---

## Things that need your input (blocked in this environment)

1. **Sample workbook.** `/samples` was empty, and the network policy blocked all
   outbound fetches, so the parser was written against a *provisional* layout
   documented in `lib/import/schema.ts` (and shown on the Import page). Drop
   accounting's real file in `/samples/` and the schema module is the one place
   to adjust: sheet names, headers, required set, sign conventions, IRR scale.
   The parser's behaviour (fail loudly, store as received, null for blanks) does
   not change.
2. **Sign conventions.** The app stores numbers exactly as received and labels
   contributions/distributions as positive amounts. If accounting reports LP cash
   flows as negatives, only display labels change, not data. Confirm before the
   first real import.
3. **Brand tokens.** `freestonecapital.com` could not be fetched and
   `/samples/brand/` did not exist, so the app ships a neutral placeholder
   palette and system fonts, documented in `brand/tokens.md`. Provide a brand
   guide/logo or the site's hex values and typefaces; everything is defined in
   the `@theme` block of `app/globals.css`. Put `logo.svg` in `public/brand/` and
   the header switches from the text wordmark automatically.

---

## How the pieces fit

```
app/                     routes (RSC pages + a few client components per route)
  page.tsx               dashboard
  investments/           table + detail (chart, documents, action items, inline edit)
  pipeline/              kanban board, deal detail, funnel (+ CSV export route)
  action-items/          list w/ filters, quick entry, meeting mode
  funds/                 fund list + detail (roll-ups, history, terms)
  import/                upload, preview/resolve/commit, import log, name mappings
lib/
  metrics/               ALL derived-metric formulas (README.md documents them)
  import/                schema.ts (layout), parser.ts, reconcile.ts, diff.ts,
                         match.ts (ID → mapping table → suggestion), commit.ts
  pipeline/stageEvents.ts   rules for appending DealStageEvent rows
  actions/               server actions (all mutations)
  queries/               read helpers (latest snapshots, funnel data…)
prisma/schema.prisma     data model; seed.ts; wipe.ts
tests/                   vitest suites
brand/tokens.md          design-token proposal + what is still placeholder
```

### Data-integrity rules, as implemented

- A financial field is only ever written by `lib/import/commit.ts`, verbatim from
  a parsed workbook. Blank cell → `null`. UI renders `—` with a tooltip naming the
  import it was blank in. Nothing is forward-filled: an investment absent from
  the latest import shows `—` everywhere with "not in the … import" and a
  "last seen" note on its page.
- The parser aborts on: missing sheet, missing required column, duplicate
  header, non-numeric cell in a numeric column (including formula errors and
  text like `1,234`), blank/invalid name or as-of date, inconsistent as-of dates,
  blank rows inside the data block, duplicate IDs/names. It reports every
  problem it found, and the failed upload stays in the import log.
- Matching: by external accounting ID when the row has one; otherwise by the
  `NameMapping` table. Unmatched rows block the commit until you map them to an
  existing record (which writes a persistent mapping) or explicitly create a new
  investment. Exact-name matches are only *suggested*, never auto-applied. One
  committed batch per as-of date.
- Derived metrics (DPI, TVPI, uncalled, roll-ups, funnel maths) live in
  `lib/metrics` with formulas in `lib/metrics/README.md`. Any null input → null
  output; fund roll-ups of investment rows are blank if any investment is missing
  the field. Reported MOIC/IRR are shown as imported and never recomputed.
- Reconciliation (Σ investment rows vs fund row, per fund, for cost /
  contributions / distributions / NAV) is shown in the preview, and the variance
  is stored on the batch (`ImportBatch.varianceJson`) at commit. Commit is allowed
  with a variance after a confirm.
- Stage changes always append a `DealStageEvent` (drag on the board, the stage
  select on a deal, or creation). Moving to Passed requires a reason. Creating a
  deal records exactly one event at the chosen stage — earlier stages are never
  backfilled. The funnel treats "reached S" as having an event at S or a later
  stage (documented in `lib/metrics/README.md`).

### Responsive & installable

- Phone (< 768px): the dashboard, action items (incl. meeting mode), pipeline
  board, investments and funds tables collapse into cards (`tbl-cards` +
  `data-label`); inputs and buttons are 42px tall with 16px text (no iOS zoom);
  a bottom tab bar replaces the top nav; modals open as bottom sheets; the kanban
  scrolls horizontally one column per screen and cards drag after a long press.
- iPad and up: the desktop layout. Data-heavy tables (funnel, import preview,
  fund reconciliation) scroll inside their own container and never widen the page.
- PWA: `app/manifest.ts` serves the web manifest; icons live in `public/icons/`
  (placeholders, see `brand/tokens.md`); `public/sw.js` is a network-only service
  worker registered by `components/PwaRegister.tsx`. It deliberately caches
  nothing so financial figures can never be served stale. On iOS use Share → Add
  to Home Screen; on Android/Chrome use the install prompt or menu → Install app.

### Moving to Postgres later

Change `provider = "sqlite"` to `"postgresql"` in `prisma/schema.prisma`, point
`DATABASE_URL` at Postgres, run `npx prisma migrate dev`. No SQLite-specific
features are used; enumerations are validated strings and JSON payloads are
`String` columns, both of which can be tightened to native enums / `Json` once on
Postgres.

---

## Next layers

Roughly in the order they are likely to be wanted:

1. **Backfill of historical pipeline data.** A one-off importer for the team's
   existing deal log (spreadsheet) that creates deals *and* their stage events
   with real historical timestamps, so prior-year funnels are genuine rather than
   starting from the go-live date. Should refuse rows without a date, and be run
   once behind a flag.
2. **Parser hardening against the real workbook** once `/samples` has a file:
   confirm layout, sign conventions, IRR scale, whether fund rows include fees /
   expenses (which would make Σ investments ≠ fund by design — then reconcile
   against a documented expected difference instead of zero).
3. **Historical snapshot backfill** by importing accounting's prior monthly
   workbooks in order (the import page already supports any as-of date, one batch
   per month).
4. **Real brand tokens** from the brand guide (see `brand/tokens.md`).
5. **Per-user auth** (Google Workspace / Microsoft SSO) replacing the shared
   password; `owner` strings are already per-person so no data migration is
   needed, just an identity source.
6. **Document storage off local disk** (S3 or SharePoint) — `lib/storage.ts` is
   the only place that touches the filesystem for documents.
7. **Reminders / digests**: overdue action items and "import due" nudges by email
   or Slack.
8. **Postgres + hosted deployment** with automated backups once more than one
   machine needs access.
9. **Audit trail** on non-financial edits (who changed notes/contacts/deal fields
   and when), building on the append-only pattern already used for stage events.
