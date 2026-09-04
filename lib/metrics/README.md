# /lib/metrics — derived metric formulas

Every derived figure shown in the app is computed here, from stored values only.
The rule: **any null input → null output**. There are no partial calculations,
no defaulting to zero, no forward-filling of missing months.

## Return metrics (`returns.ts`)

Inputs are the fields stored on a `FinancialSnapshot`, exactly as imported.

| Metric | Formula | Notes |
|---|---|---|
| `dpi` | `distributions / contributions` | null if either is null or contributions = 0 |
| `rvpi` | `nav / contributions` | same |
| `tvpi` | `(distributions + nav) / contributions` | same. Labelled "TVPI (computed)" in the UI to distinguish from the workbook's reported MOIC. |
| `moicComputed` | `(distributions + nav) / cost` | only used when the workbook has no MOIC column; UI labels it "computed". |
| `uncalled` | `commitments − contributions` | both from the fund-level snapshot: accounting's "Total Commitments" and "Called Capital" (Fund Total column). |
| `pctCalled` | `contributions / commitments` | |
| `unrealizedGain` | `nav − cost` | |

Reported MOIC and IRR are never recomputed; they are displayed as imported. At fund level
the workbook reports three bases (Fund Gross, Fund Net, Total Fund); all three are stored
and shown, with Net (what LPs receive) leading on the fund pages.

Investment-level `contributions` and `distributions` are sums of accounting's own cash-flow
rows on the IRR Detail tab (negative flows and positive flows respectively, excluding the
terminal "Current Value" row). They are the exact inputs to accounting's MOIC formula, and
the import reconciliation re-derives each reported MOIC from them as a check.

## Roll-ups (`returns.ts`)

`sumStrict(values)` returns the sum only if **every** value is non-null; otherwise
null and the count of missing inputs. Fund roll-ups of investment-level figures
use `sumStrict`, so a fund total is blank if any of its investments is missing the
figure in that month's import. The fund-level figure from the workbook is always
shown alongside, and the reconciliation variance between the two is recorded on
the import batch.

### Home-page totals

The home page's Total row uses `sumAvailable` (sum over funds that report the figure) and
always shows "n of m funds" with the missing funds named on hover, because a strict total is
blank whenever a wind-down fund lacks a line. Ratios (DPI, TVPI) and AUM are computed only
over funds that report all four inputs, so numerator and denominator always cover the same
funds.

## Pipeline funnel (`funnel.ts`)

Source of truth: `DealStageEvent` rows (append-only, one per stage entry).

**Reached stage S** — a deal has reached funnel stage S when it has any stage
event whose stage is S *or later* in the linear order
`Sourced → Screening → IC → Closed`. The timestamp of "reaching S" is the earliest
such event. `Passed` is terminal and is not part of the linear order; it is
counted separately. This is a definition over stored events, not a reconstruction:
a deal moved straight from Sourced to IC has reached Screening at the IC timestamp.

**Funnel for a period** — for each stage S, the deals whose reach-timestamp for S
falls inside `[periodStart, periodEnd]`, counted and with `estSize` summed.
`estSize` is a pipeline estimate (not an accounting figure); deals with null
`estSize` are counted but excluded from the size sum, and the number excluded is
reported next to the sum.

**Conversion rate S → S+1** — `count(reached S+1 in period) / count(reached S in period)`.
Null when the denominator is 0.

**Same period through date D** — for year Y, the window is
`[Y-01-01, Y-MM-DD 23:59:59.999]` where MM-DD is D's month/day (Feb 29 clamps to
Feb 28 in non-leap years). Year-over-year comparisons use this window for every
year so YTD is compared fairly.

**Median days in stage** — for each stage event, days until the deal's next stage
event. Events that are still the deal's current stage are open and excluded.
Grouped by the year the stage was entered. Median of an empty set is null.

**Sourced by source type** — count of deals by `sourceType` grouped by the year of
`dateSourced`.
