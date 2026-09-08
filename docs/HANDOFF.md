# Handoff: where this project stands

For a new person or a new Claude session picking this up. `CLAUDE.md` has the rules and the map of
the code; this file is the story so far and the open threads. Dates are as of September 2026.

## Who and what

Freestone Capital is a three-person private-equity team: **Sean** (the person driving this and the
one you will talk to), **AJ**, **Teddy**. Sean is a finance professional, not a developer: explain in
plain English, give copy-paste Terminal commands, and say explicitly when a change needs
`npm install` or `npx prisma db push`. When in doubt, tell him to run all four:
`git pull`, `npm install`, `npx prisma db push`, `npm run dev`.

The app replaces a scattered set of spreadsheets and a weekly to-do email with one internal site:
funds and holdings from the monthly accounting workbooks, a deal pipeline, the team's action items,
and a per-person printable daily card.

## What has been built, in order

1. **v1 scaffold**: Next.js app, Prisma/SQLite, shared password sign-in, seed and wipe scripts,
   pages for home, investments, pipeline kanban, funnel, action items with meeting mode, funds, import.
2. **Responsive and installable** (PWA manifest, network-only service worker, tables collapse to
   cards on phones, kanban scrolls sideways).
3. **Real accounting workbook parser.** Two layouts: the "Dashboard" layout (FAP IV, V, VI) and the
   wind-down "TB Recalc" layout (FAP III). Every figure stored as received with its sheet and cell.
   Reconciliation checks reproduce the workbook's own arithmetic and flag inconsistencies.
   Excel error cells, "n/a", spacer rows, .xlsm files with Excel tables are all handled.
4. **Brand** from the firm's deck (navy/rust/terracotta, Georgia headings, logo).
5. **Real data loaded**: the four July 2026 workbooks (and June FAP IV) imported; the team's real
   weekly action-item list replaced the demo tasks. Pipeline data is still demo data.
6. **Home page**: fund table with net returns and a "GP carry generated" column, totals row with
   "n of m funds" notes, asset-class exposure donuts (aggregate and per fund). Funds tab removed.
   Each fund row expands (▸) into its activity: dated cash flows to partners by class from the
   workbook's LP Performance tab, grouped by year, and NAV by class per import.
7. **Investments** grouped by fund with expand/collapse, ordered by NAV, asset class from the
   workbook's MTM tab (`npm run refresh-attributes` refreshes it without re-importing).
8. **Funnel**: source type and days-in-stage dropped; visual YTD vs prior-year funnel.
9. **Quick-add** button in the header for tasks and deals. **Click any task** to edit it in place.
10. **My day**: per-person card (must-do pins, overdue, due today, this week, later), printable as a
    4×6 note card or one page, copy-as-text. Optional Outlook calendar via a published .ics link.
11. **Tables**: one line per row, fixed height, clipped text with hover.
12. **Production hardening** for an Azure deployment (see `docs/AZURE.md`): expiring sessions,
    sign-in rate limit, security headers, upload/download checks, calendar host allow-list,
    health endpoint, non-root multi-stage Docker image, clean `npm audit`.

## Decisions worth knowing

- **Never compute a financial number.** If the workbook lacks it, show "—" with a tooltip naming the
  import. The only arithmetic is documented in `lib/metrics/README.md` (ratios and sums of rows).
- **Home totals** sum the funds that report each figure and say how many did. Uncalled uses funds
  reporting commitments and called; AUM adds NAV; DPI and TVPI need all four inputs.
- **GP carry generated** = the Dashboard's GP Carry class Total Value, as reported. When the
  Dashboard's figure is internally inconsistent (FAP V), the app flags it and shows the LP Capital
  Roll GP row and LP Performance figures beside it rather than substituting a number.
- **Holdings are matched by name** (`NameMapping`); files carry no IDs.
- **Local-only files**: `.env`, `prisma/dev.db`, `storage/`, `samples/*.xlsx|xlsm`. Never in git or
  the Docker image. The team's own tasks live in the database, so new versions never lose them.

## Issues found in the accounting files (to raise with the accountant, "JC")

- **FAP V Dashboard, GP Carry column**: distributions show −$11.2M against $11.2M accrued carry, so
  Total Value nets to zero. LP Performance says $10.3M paid out and $15.3M remaining; LP Capital Roll
  GP row says $10.3M out and $11.2M ending balance. The Dashboard formula needs fixing and the two
  "remaining" figures need reconciling.
- **FAP IV**: Dashboard GP Carry Total Value ($40.5M) vs LP Capital Roll carried interest ($32.4M);
  the GP row does not foot; called capital exceeds commitments by ~$0.7M (recycling?); LP Performance
  "Remaining Value" line dated June 30 in the July file.
- **FAP VI**: distributions blank for every class instead of zero (keeps it out of DPI/TVPI totals);
  Redemptions Fund Total blank.
- **FAP V**: Redemptions Fund Total blank while classes show zero; valuation dates are text
  ("Monthly PCAP") so dates come from the MTM tab.
- **FAP III** (wind-down): MTM Total NAV ($23.1M) does not match the holdings above it ($38.8M);
  fund NAV ($27.8M) is below the sum of holding NAVs; #REF!/#NUM! on the IRR tab (Stanford Claims,
  Tenor Class D); GCF I LP reported MOIC 1.17x vs 1.16x from its cash flows; no Dashboard tab, so
  commitments, returns, exposure and activity are blank for this fund.
All of these show on the Import page under each file's reconciliation.

## Open threads and what Sean wants next

1. **Entra ID single sign-on** replacing the shared password (IT will require it). Sign-in code is
   isolated in `lib/actions/auth.ts`, `lib/session.ts`, `proxy.ts`, `app/login`.
2. **Calendar and mail via Microsoft Graph.** The tenant has calendar publishing turned off, so the
   published-link route cannot be used at work. With Graph (after SSO): the day's meetings on My day,
   plus "top emails to reply to" and a short written daily brief. Sean has existing email-review code
   on his work account that could plug in here.
3. **Pipeline**: replace the demo deals with the team's real pipeline file (Sean will provide), then
   a "pipeline inbox" where teasers/emails are dropped in and summarised into the Screening column.
4. **Hosting on Azure** by the company's IT team: `docs/AZURE.md`. Postgres instead of SQLite once
   there.
5. Smaller: historical pipeline backfill; a one-page note of the accounting-file issues for JC.

## Working style that has gone well

- Verify in a real browser (Playwright) and with the real workbooks in `samples/` before pushing.
- Commit small, descriptive changes; tell Sean in plain English what changed and what to run.
- Keep every new number traceable to a sheet and cell.
