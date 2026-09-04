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

4 funds ("Demo Advantage Partners I–IV LP", vintages 2021/2023/2025/2026), 37
holdings, ~40 pipeline deals over 2024–2026 with exact stage histories, 15 action
items, and **two months of financial snapshots**. The snapshots are not inserted
directly: the seed writes one demo workbook per fund per month, in accounting's
real layout, to `storage/imports/demo/` and pushes each through the real parser →
match → commit path. The June files deliberately contain one new holding, two
>10% mark moves, a blank IRR and MOIC, and a $2,500 class mismatch on Fund II, so
the preview has something to flag.

---

## Accounting workbook and brand (both confirmed)

- **Workbook.** The parser is built against accounting's real monthly file
  (`samples/20260630_FAPIV_TB_Analysis_JC.xlsx`, one fund per workbook). It reads three tabs:
  the **Dashboard Confessional** tab (fund returns on three bases, capital by investor class,
  the holdings table, the as-of date), **MTM** (cost per holding) and **IRR Detail** (cash
  flows per holding, summed into contributions and distributions). Cells are found by their
  labels, so rows may move but labels must not be renamed. The full layout and the sign /
  scale conventions are documented in `lib/import/schema.ts`. The sample and the brand decks
  contain real fund and LP data and are git-ignored: keep them in `samples/` locally. The
  test suite runs an extra check against the sample when it is present.
- **Brand.** Colours, type and the logo were taken from the firm's own investor presentation
  (theme file, slide master, usage counts). See `brand/tokens.md`. Drop `logo.svg` into
  `public/brand/` if a vector logo becomes available; it takes precedence over the PNG.

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
  a parsed workbook. Blank cell → `null` (a realized holding has no NAV, for example). UI renders `—` with a tooltip naming the
  import it was blank in. Nothing is forward-filled: an investment absent from
  the latest import shows `—` everywhere with "not in the … import" and a
  "last seen" note on its page.
- The parser aborts on: a missing or renamed tab, a renamed label or column
  header, text where a number is expected (including formula errors), a
  valuation date that is neither a date nor a status word, a blank fund name or
  as-of date, a holdings table without its Total row, duplicate holdings, a
  missing Current Value row on IRR Detail. It reports every problem it found and
  names the cell (e.g. `Dashboard Confessional!D32`); the failed upload stays in
  the import log with nothing written.
- Matching: the workbook carries no IDs, so funds and holdings match by the
  `NameMapping` table (an external-ID path exists for the day accounting adds
  them). Unmatched rows block the commit until you map them to an
  existing record (which writes a persistent mapping) or explicitly create a new
  investment (or fund). Exact-name matches are only *suggested*, never
  auto-applied. One committed batch per fund per as-of date.
- Derived metrics (DPI, TVPI, uncalled, roll-ups, funnel maths) live in
  `lib/metrics` with formulas in `lib/metrics/README.md`. Any null input → null
  output; fund roll-ups of investment rows are blank if any investment is missing
  the field. Reported MOIC/IRR are shown as imported and never recomputed.
- Reconciliation reproduces arithmetic the workbook itself performs: Σ holding
  NAV vs the dashboard's portfolio total, Σ cost vs the MTM total, investor
  classes vs Fund Total for every measure, Total Value vs its components, and
  each holding's reported MOIC vs the one implied by its cash flows. Fund NAV vs
  Σ holdings is shown as information (the gap is cash, accruals and carry), never
  flagged. Results are shown in the preview and stored on the batch at commit;
  committing with a flag requires a confirm.
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
2. **Parser hardening as accounting's file evolves**: a second fund's workbook
   and a couple more months will show which labels drift. If accounting can add
   an ID column to the holdings table, matching becomes ID-first automatically.
3. **Historical snapshot backfill** by importing accounting's prior monthly
   workbooks in order (the import page already supports any as-of date, one batch
   per month).
4. **Vector logo and an official app icon** (see `brand/tokens.md`).
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
