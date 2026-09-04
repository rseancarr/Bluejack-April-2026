# Freestone Portfolio (internal, v1)

Internal portfolio-management app for a three-person team running four PE-style
funds. Optimised for speed of logging; all financial figures come from accounting's
monthly Excel workbook and are never typed in by hand.

**Stack:** Next.js 16 (App Router) · TypeScript · Prisma 6 on SQLite (Postgres-ready)
· Tailwind v4 · Recharts · dnd-kit · ExcelJS · Vitest.

> All seeded data is fake ("Demo Fund I…IV", invented company names).

---

## Try it

### On your computer (10 minutes, one time)

1. Install **Node.js** (LTS) from https://nodejs.org and **Git** from https://git-scm.com. Accept the defaults.
2. Open a terminal (Windows: "Git Bash"; Mac: "Terminal") and run:

```bash
git clone https://github.com/rseancarr/Bluejack-April-2026.git
cd Bluejack-April-2026
git checkout claude/freestone-portfolio-app-v1-1bipcj
npm install
npm run setup        # creates .env, builds the database, loads the team's action items
                     # (add --demo to load fake demo funds/holdings/pipeline instead)
npm run dev
```

3. Open http://localhost:3000. Password is `freestone` (change `APP_PASSWORD` in `.env`);
   pick your name from the list (`TEAM_MEMBERS` in `.env`).

After the first time, it is just `cd Bluejack-April-2026` then `npm run dev`.

### On your phone (same Wi-Fi as the computer)

Run `npm run dev:lan` instead of `npm run dev`. It prints an address like
`http://192.168.1.23:3000`; open that in Safari or Chrome on the phone. To install it like
an app: iPhone → Share → **Add to Home Screen**; Android → menu → **Install app**.
The phone only works while the computer is running the app.

### Hosted (so the whole team can use it from anywhere)

The included `Dockerfile` runs on Railway, Render or Fly.io. It needs a persistent disk
mounted at `/data` (database + uploaded files) and the environment variables listed at the
top of the Dockerfile. Put it behind HTTPS (all three do this by default) so the
home-screen install works everywhere.

## Setup (manual, if you prefer)

Other commands:

| Command | What it does |
|---|---|
| `npm run db:wipe` | **Wipes everything**: all tables + `storage/documents` + `storage/imports`. |
| `npm run db:real` | Loads the team's weekly action items from `prisma/real/action-items.json` (edit that file to change them). Funds and holdings come in through the Import page. |
| `npm run db:demo` | Loads the fake demo data (funds, holdings, pipeline, imports). |
| `npm run db:reset` / `db:reset:demo` | wipe, then real / demo |
| `npm test` | unit tests (metrics, parser, reconciliation/diff, stage events) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build && npm start` | production build |

### Real vs demo data

`npm run setup` (or `npm run db:real`) starts the app with no funds or holdings and the
team's current action items, owners Sean / AJ / Teddy. Funds and holdings are created the
first time each accounting workbook is imported. The demo data described below is only
loaded with `--demo` / `npm run db:demo`.

### What the demo seed creates

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

- **Workbooks.** The parser is built against accounting's real monthly files (June and
  July 2026 for FAP III / IV / V / VI, `.xlsx` and `.xlsm`; one fund per workbook). Active
  funds use the **Dashboard** tab (fund returns on three bases, capital by investor class,
  the holdings table, exposure by asset class, the as-of date) plus **MTM** (cost) and
  **IRR Detail** (cash flows → contributions and distributions). Wind-down funds without a
  dashboard (FAP III) are read from **TB Recalc**, **MTM** and **IRR**. Cells are found by
  their labels, so rows may move but labels must not be renamed. Both layouts and the
  sign / scale conventions are documented in `lib/import/schema.ts`. The samples and the
  brand decks contain real fund and LP data and are git-ignored: keep them in `samples/`
  locally. The test suite runs extra checks against them when present.
- **Batch import from the command line.** `npm run import -- <file-or-folder> --create-missing`
  parses, resolves and commits every workbook in a folder (funds and holdings are created
  when `--create-missing` is given, exactly as the preview's "Create" buttons would). Use
  it for a month's worth of files at once; the preview page remains the place to look when
  something needs a human decision.
- **Brand.** Colours, type and the logo were taken from the firm's own investor presentation
  (theme file, slide master, usage counts). See `brand/tokens.md`. Drop `logo.svg` into
  `public/brand/` if a vector logo becomes available; it takes precedence over the PNG.

---

## Home page figures

- The fund table shows each fund's latest import: commitments, called, uncalled,
  distributions, NAV, DPI, net IRR / MOIC, and **GP carry generated** (the GP Carry
  investor class's Total Value = its distributions + redemptions + remaining NAV,
  exactly as the dashboard reports it).
- The **Total** row sums across funds strictly (blank if any fund lacks a figure).
  AUM = Σ NAV + Σ uncalled. The aggregate multiple is TVPI computed from the sums;
  there is no aggregate IRR because the files do not report one.
- **Exposure by asset class** pies use the dashboards' "Exposure by Asset Class"
  table (fund-NAV column), one aggregate donut plus one per fund. Funds whose file
  has no such table (wind-down funds, pre-July files) are named as excluded.
- The former Funds tab is gone; `/funds` redirects home and fund detail pages stay
  at `/funds/<id>`.

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
  classes vs Fund Total for every measure, Total Value vs its components, the
  exposure table vs fund NAV, and each holding's reported MOIC vs the one implied
  by its cash flows. Fund NAV vs Σ holdings is shown as information (the gap is
  cash, accruals and carry), never flagged. Results are shown in the preview and
  stored on the batch at commit; committing with a flag requires a confirm.
- Two things in accounting's files are accepted as blank rather than aborting,
  and always listed in the preview's notes: the literal text `n/a`, and Excel
  error values (`#REF!`, `#NUM!` …). Any other text in a numeric cell still
  aborts the upload.
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

1. **Pipeline inbox.** Point the app at a mailbox folder of new opportunities; a
   Claude skill reads the teaser / CIM, drafts a one-paragraph summary and creates
   the deal in the Screening column with the summary attached, ready to click into.
   Needs: mailbox access (Microsoft Graph for Outlook), a document store for the
   attachments, and the Claude API. The data model already has the deal fields and
   documents; the summary would land in `fitNotes`.
2. **Backfill of historical pipeline data** (a pipeline file is coming). A one-off importer for the team's
   existing deal log (spreadsheet) that creates deals *and* their stage events
   with real historical timestamps, so prior-year funnels are genuine rather than
   starting from the go-live date. Should refuse rows without a date, and be run
   once behind a flag.
3. **Parser hardening as accounting's file evolves**: a second fund's workbook
   and a couple more months will show which labels drift. If accounting can add
   an ID column to the holdings table, matching becomes ID-first automatically.
4. **Historical snapshot backfill** by importing accounting's prior monthly
   workbooks in order (the import page already supports any as-of date, one batch
   per month).
5. **Vector logo and an official app icon** (see `brand/tokens.md`).
6. **Per-user auth** (Google Workspace / Microsoft SSO) replacing the shared
   password; `owner` strings are already per-person so no data migration is
   needed, just an identity source.
7. **Document storage off local disk** (S3 or SharePoint) — `lib/storage.ts` is
   the only place that touches the filesystem for documents.
8. **Reminders / digests**: overdue action items and "import due" nudges by email
   or Slack.
9. **Postgres + hosted deployment** with automated backups once more than one
   machine needs access.
10. **Audit trail** on non-financial edits (who changed notes/contacts/deal fields
   and when), building on the append-only pattern already used for stage events.
