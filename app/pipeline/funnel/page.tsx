import Link from "next/link";
import { prisma } from "@/lib/db";
import { BUCKETS, FUNNEL_STAGES, SOURCE_TYPES, STAGES, teamMembers } from "@/lib/constants";
import { fmtDate, fmtDays, fmtMoneyM, fmtRatioPct } from "@/lib/format";
import { computeFunnel, type FunnelFilters } from "@/lib/queries/funnel";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/FilterBar";

export const dynamic = "force-dynamic";

export default async function FunnelPage({ searchParams }: { searchParams: Promise<FunnelFilters> }) {
  const sp = await searchParams;
  const funds = await prisma.fund.findMany({ orderBy: { vintage: "asc" } });
  const data = await computeFunnel(sp);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => !!v) as [string, string][]).toString();
  const thisYear = data.through.getUTCFullYear();
  const label = (y: number) => (data.view === "same" || y === thisYear ? `${y} thru ${fmtDate(new Date(Date.UTC(y, data.through.getUTCMonth(), data.through.getUTCDate())))}` : `${y}`);

  return (
    <div className="space-y-5">
      <PageHeader title="Pipeline funnel" subtitle={`${data.dealCount} deals in scope · counts are deals that reached each stage in the period (stage events)`}>
        <a href={`/pipeline/funnel/export?${qs}`} className="btn btn-secondary">Export CSV</a>
      </PageHeader>

      <div className="flex items-end gap-4 flex-wrap">
        <FilterBar
          current={sp as Record<string, string | undefined>}
          filters={[
            { key: "fund", label: "Fund", options: funds.map((f) => ({ value: f.id, label: f.name })) },
            { key: "bucket", label: "Bucket", options: BUCKETS.map((b) => ({ value: b, label: b })) },
            { key: "sourceType", label: "Source type", options: SOURCE_TYPES.map((s) => ({ value: s, label: s })) },
            { key: "owner", label: "Owner", options: teamMembers().map((m) => ({ value: m, label: m })) },
            { key: "view", label: "Prior years", emptyLabel: "Full calendar year", options: [{ value: "same", label: `Same period thru ${fmtDate(data.through)}` }] },
          ]}
        />
      </div>

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

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card">
          <div className="card-h"><h2>Sourced deals by source type</h2><span className="muted">by date sourced</span></div>
          <div className="tbl-wrap border-0 rounded-none">
            <table className="tbl compact">
              <thead><tr><th>Source type</th>{data.years.map((y) => <th key={y} className="num">{label(y)}</th>)}</tr></thead>
              <tbody>
                {data.sourceTypeKeys.map((k) => (
                  <tr key={k}><td className="capitalize">{k}</td>{data.years.map((y) => <td key={y} className="num">{data.sourceTypes[y][k] ?? 0}</td>)}</tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total</td>{data.years.map((y) => <td key={y} className="num">{Object.values(data.sourceTypes[y]).reduce((a, b) => a + b, 0)}</td>)}</tr></tfoot>
            </table>
          </div>
        </section>
        <section className="card">
          <div className="card-h"><h2>Median days in stage</h2><span className="muted">by year the stage was entered; open stages excluded</span></div>
          <div className="tbl-wrap border-0 rounded-none">
            <table className="tbl compact">
              <thead><tr><th>Stage</th>{data.years.map((y) => <th key={y} className="num">{y}</th>)}</tr></thead>
              <tbody>
                {STAGES.filter((s) => s !== "Passed" && s !== "Closed").map((s) => (
                  <tr key={s}><td>{s}</td>{data.years.map((y) => <td key={y} className="num">{fmtDays(data.medianDays[y][s])}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <p className="faint"><Link href="/pipeline" className="link">Back to board</Link></p>
    </div>
  );
}
