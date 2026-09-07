import { fmtDate, fmtMoneyM } from "@/lib/format";
import { FLOW_CLASSES, activityTotals, flowsByYear } from "@/lib/metrics/activity";
import type { StrictSum } from "@/lib/metrics/returns";
import type { FundActivityData } from "@/lib/queries/activity";

const day = (s: string | null) => (s ? fmtDate(new Date(`${s}T12:00:00Z`)) : "—");

function Sum({ s, note }: { s: StrictSum; note: string }) {
  if (s.sum === null) return <span className="missing" title={note}>—</span>;
  return (
    <>
      {fmtMoneyM(s.sum)}
      {s.missing > 0 && <span className="faint" title={`${s.missing} of ${s.count} rows blank in the workbook; sum of the rest`}>*</span>}
    </>
  );
}

/** Distribution history by partner class, and NAV by class over time. Everything comes from the accounting file's
 *  "LP Performance" tab (cash flows, Remaining Value) and the Dashboard class table (NAV per import). */
export function FundActivity({ data, compact = false }: { data: FundActivityData; compact?: boolean }) {
  const a = data.activity;
  const years = a ? flowsByYear(a) : [];
  const totals = a ? activityTotals(a) : null;
  const navRows = [...data.navHistory].reverse();
  return (
    <div className={`grid gap-4 ${compact ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"}`}>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h3>Cash flows to partners</h3>
          <span className="faint">{a ? `${a.sheet} tab · ${data.fileName} · ${a.gpCarryHeader}` : ""}</span>
        </div>
        {!a || a.flows.length === 0 ? (
          <div className="muted py-3">Not in this fund&apos;s accounting file (no &ldquo;LP Performance&rdquo; tab{data.fileName ? ` in ${data.fileName}` : ""}).</div>
        ) : (
          <>
            {totals && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                {FLOW_CLASSES.map((c) => (
                  <div key={c.key} className="rounded border border-line bg-paper-2 px-2.5 py-1.5">
                    <div className="faint text-[10.5px] uppercase tracking-wide">{c.label} · distributed</div>
                    <div className="tnum text-[14px] text-navy-2"><Sum s={totals.distributions[c.key]} note="no rows" /></div>
                    <div className="faint text-[10.5px]">called <Sum s={totals.calls[c.key]} note="no capital calls" /></div>
                  </div>
                ))}
              </div>
            )}
            <div className="tbl-wrap">
              <table className="tbl compact tbl-nested">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    {FLOW_CLASSES.map((c) => <th key={c.key} className="num">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {years.map((y) => (
                    <YearRows key={y.year} y={y} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="faint mt-1">Amounts as the accounting file lists them: capital calls negative, distributions (income, return of capital, redemptions, taxes withheld) positive. Year rows sum the rows shown.</p>
          </>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h3>NAV by class</h3>
          <span className="faint">each committed import</span>
        </div>
        <div className="tbl-wrap">
          <table className="tbl compact tbl-nested">
            <thead>
              <tr><th>As of</th><th className="num">LPs</th><th className="num">Affiliates</th><th className="num">GP carry</th><th className="num">Total</th></tr>
            </thead>
            <tbody>
              {a?.remaining && (
                <tr>
                  <td title={`${a.sheet} "Remaining Value" row ${a.remaining.row}`}>{day(a.remaining.date)} <span className="faint">LP Performance</span></td>
                  <td className="num">{a.remaining.nonAffiliateNet === null ? <span className="missing" title="blank">—</span> : fmtMoneyM(a.remaining.nonAffiliateNet)}</td>
                  <td className="num">{a.remaining.affiliates === null ? <span className="missing" title="blank">—</span> : fmtMoneyM(a.remaining.affiliates)}</td>
                  <td className="num">{a.remaining.gpCarry === null ? <span className="missing" title="blank">—</span> : fmtMoneyM(a.remaining.gpCarry)}</td>
                  <td className="num font-medium">{a.remaining.total === null ? <span className="missing" title="blank">—</span> : fmtMoneyM(a.remaining.total)}</td>
                </tr>
              )}
              {navRows.map((r) => (
                <tr key={r.asOf}>
                  <td title={r.fileName}>{day(r.asOf)} <span className="faint">Dashboard</span></td>
                  <td className="num">{r.nonAffiliate === null ? <span className="missing" title={`blank in ${r.fileName}`}>—</span> : fmtMoneyM(r.nonAffiliate)}</td>
                  <td className="num">{r.affiliate === null ? <span className="missing" title={`blank in ${r.fileName}`}>—</span> : fmtMoneyM(r.affiliate)}</td>
                  <td className="num">{r.gpCarry === null ? <span className="missing" title={`blank in ${r.fileName}`}>—</span> : fmtMoneyM(r.gpCarry)}</td>
                  <td className="num font-medium">{r.total === null ? <span className="missing" title={`blank in ${r.fileName}`}>—</span> : fmtMoneyM(r.total)}</td>
                </tr>
              ))}
              {navRows.length === 0 && !a?.remaining && <tr><td colSpan={5} className="muted text-center py-3">No fund-level import yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="faint mt-1">One row per monthly import, so this history builds up as files are imported. The LP Performance row is that tab&apos;s own &ldquo;Remaining Value&rdquo; line and can differ from the Dashboard.</p>
      </div>
    </div>
  );
}

function YearRows({ y }: { y: ReturnType<typeof flowsByYear>[number] }) {
  return (
    <>
      <tr className="group-row">
        <td className="font-medium text-navy-2">{y.year}</td>
        <td className="faint">{y.flows.length} row{y.flows.length === 1 ? "" : "s"} · distributed</td>
        {FLOW_CLASSES.map((c) => (
          <td key={c.key} className="num font-medium"><Sum s={y.distributions[c.key]} note="no distributions this year" /></td>
        ))}
      </tr>
      {y.flows.map((f) => (
        <tr key={f.row}>
          <td className="whitespace-nowrap pl-5">{day(f.date)}</td>
          <td className="muted">{f.type}</td>
          {FLOW_CLASSES.map((c) => (
            <td key={c.key} className={`num ${f[c.key] !== null && f[c.key]! < 0 ? "muted" : ""}`}>{f[c.key] === null ? <span className="missing" title="blank in the workbook">—</span> : fmtMoneyM(f[c.key]!)}</td>
          ))}
        </tr>
      ))}
    </>
  );
}
