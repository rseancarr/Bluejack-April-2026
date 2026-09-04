import Link from "next/link";
import { prisma } from "@/lib/db";
import { BUCKETS, FUNNEL_STAGES, teamMembers } from "@/lib/constants";
import { fmtDate, fmtMoneyM, fmtRatioPct } from "@/lib/format";
import { computeFunnel, type FunnelFilters } from "@/lib/queries/funnel";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/FilterBar";
import { FunnelBars } from "@/components/charts/FunnelBars";

export const dynamic = "force-dynamic";

export default async function FunnelPage({ searchParams }: { searchParams: Promise<FunnelFilters> }) {
  const sp = await searchParams;
  const funds = await prisma.fund.findMany({ orderBy: { vintage: "asc" } });
  const data = await computeFunnel(sp);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => !!v) as [string, string][]).toString();
  const thisYear = data.through.getUTCFullYear();
  const label = (y: number) => (data.view === "same" || y === thisYear ? `${y} thru ${fmtDate(new Date(Date.UTC(y, data.through.getUTCMonth(), data.through.getUTCDate())))}` : `${y}`);
  const lastYear = thisYear - 1;
  const chartRows = data.years.includes(lastYear)
    ? [...FUNNEL_STAGES.map((s) => ({ stage: s, current: data.byYear[thisYear].stages.find((x) => x.stage === s)!.count, prior: data.byYear[lastYear].stages.find((x) => x.stage === s)!.count })), { stage: "Passed", current: data.byYear[thisYear].passed.count, prior: data.byYear[lastYear].passed.count }]
    : null;
  // The chart always compares like-for-like periods, whatever the table's view setting.
  const priorSame = chartRows && data.view !== "same" ? (await computeFunnel({ ...sp, view: "same" })).byYear[lastYear] : null;
  const chart = chartRows?.map((r) => (priorSame ? { ...r, prior: r.stage === "Passed" ? priorSame.passed.count : priorSame.stages.find((x) => x.stage === r.stage)!.count } : r)) ?? null;

  return (
    <div className="space-y-5">
      <PageHeader title="Pipeline funnel" subtitle={`${data.dealCount} deals in scope · counts are deals that reached each stage in the period (stage events)`}>
        <a href={`/pipeline/funnel/export?${qs}`} className="btn btn-secondary">Export CSV</a>
      </PageHeader>

      <FilterBar
        current={sp as Record<string, string | undefined>}
        filters={[
          { key: "fund", label: "Fund", options: funds.map((f) => ({ value: f.id, label: f.name })) },
          { key: "bucket", label: "Bucket", options: BUCKETS.map((b) => ({ value: b, label: b })) },
          { key: "owner", label: "Owner", options: teamMembers().map((m) => ({ value: m, label: m })) },
          { key: "view", label: "Prior years", emptyLabel: "Full calendar year", options: [{ value: "same", label: `Same period thru ${fmtDate(data.through)}` }] },
        ]}
      />

      <section className="card">
        <div className="card-h"><h2>Funnel by year</h2><span className="muted">{data.view === "same" ? `every year cut at ${fmtDate(data.through)} so YTD compares like-for-like` : `current year is YTD; prior years are full years`}</span></div>
        <div className="tbl-wrap border-0 rounded-none">
          <table className="tbl">
            <thead>
              <tr>
                <th rowSpan={2} className="align-bottom">Stage</th>
                {data.years.map((y) => <th key={y} colSpan={3} className="text-center border-l border-line">{label(y)}</th>)}
              </tr>
              <tr>
                {data.years.map((y) => (
                  <>
                    <th key={`${y}c`} className="num border-l border-line">Deals</th>
                    <th key={`${y}s`} className="num">Est. size</th>
                    <th key={`${y}r`} className="num">Conv.</th>
                  </>
                ))}
              </tr>
            </thead>
            <tbody>
              {FUNNEL_STAGES.map((s) => (
                <tr key={s}>
                  <td className="font-medium">{s}</td>
                  {data.years.map((y) => {
                    const r = data.byYear[y].stages.find((x) => x.stage === s)!;
                    return (
                      <>
                        <td key={`${y}c`} className="num border-l border-line-2">{r.count}</td>
                        <td key={`${y}s`} className="num">{r.size.sum === null ? <span className="faint">—</span> : fmtMoneyM(r.size.sum)}{r.size.missing > 0 && <span className="faint" title={`${r.size.missing} deal(s) without est. size excluded`}>*</span>}</td>
                        <td key={`${y}r`} className="num muted">{r.conversionFromPrev === null ? (s === "Sourced" ? "" : "—") : fmtRatioPct(r.conversionFromPrev)}</td>
                      </>
                    );
                  })}
                </tr>
              ))}
              <tr className="text-ink-3">
                <td>Passed</td>
                {data.years.map((y) => (
                  <>
                    <td key={`${y}c`} className="num border-l border-line-2">{data.byYear[y].passed.count}</td>
                    <td key={`${y}s`} className="num">{data.byYear[y].passed.size.sum === null ? "—" : fmtMoneyM(data.byYear[y].passed.size.sum)}</td>
                    <td key={`${y}r`} />
                  </>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 faint">Conv. = deals reaching this stage ÷ deals reaching the previous stage, within the same period. * = some deals lack an est. size. Formulas: <code className="mono">lib/metrics/README.md</code>.</div>
      </section>

      {chart && (
        <section className="card">
          <div className="card-h"><h2>YTD vs same period last year</h2><span className="muted">deals reaching each stage, {fmtDate(new Date(Date.UTC(thisYear, 0, 1)))} – {fmtDate(data.through)} vs the same window in {lastYear}</span></div>
          <div className="card-b"><FunnelBars rows={chart} currentLabel={`${thisYear} YTD`} priorLabel={`${lastYear} same period`} /></div>
        </section>
      )}
      <p className="faint"><Link href="/pipeline" className="link">Back to board</Link></p>
    </div>
  );
}
