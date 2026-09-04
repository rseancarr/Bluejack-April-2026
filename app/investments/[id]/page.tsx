import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { teamMembers, DOCUMENT_TYPE_LABELS } from "@/lib/constants";
import { fmtDate, fmtMoneyM, fmtMultiple, fmtPct, fmtRatioPct } from "@/lib/format";
import { dpi, tvpi, unrealizedGain } from "@/lib/metrics/returns";
import { investmentHistory, lastSeen, latestBatches, latestInvestmentSnapshots, missingReason, FIELD_LABELS } from "@/lib/queries/snapshots";
import { toHistoryPoints } from "@/lib/queries/history";
import { actionItemInclude, linkOptions, sortByUrgency } from "@/lib/queries/actionItems";
import { IRR_SCALE } from "@/lib/import/schema";
import { HistoryChart } from "@/components/charts/HistoryChart";
import { Fig } from "@/components/ui/Fig";
import { Kpi } from "@/components/ui/Kpi";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/Badge";
import { ItemsTable } from "@/components/actionItems/ItemsTable";
import { QuickAdd } from "@/components/actionItems/QuickAdd";
import { InvestmentEditForm } from "./InvestmentEditForm";
import { DocumentsPanel } from "./DocumentsPanel";

export const dynamic = "force-dynamic";

export default async function InvestmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await prisma.investment.findUnique({ where: { id }, include: { fund: true, documents: { orderBy: { date: "desc" } } } });
  if (!inv) notFound();
  const latest = await latestBatches();
  const batch = latest.byFund.get(inv.fundId) ?? null;
  const [snaps, history, seen, items, options, me] = await Promise.all([
    latestInvestmentSnapshots(latest),
    investmentHistory(id),
    lastSeen(id),
    prisma.actionItem.findMany({ where: { investmentId: id, status: "open" }, include: actionItemInclude }),
    linkOptions(),
    currentUser(),
  ]);
  const s = snaps.get(id);
  const irrFmt = IRR_SCALE === "fraction" ? fmtRatioPct : fmtPct;
  const extra = s?.extraJson ? (JSON.parse(s.extraJson) as Record<string, string | number | null>) : null;
  const asOfLabel = s ? `as of ${fmtDate(s.asOfDate)}` : batch ? `not in the ${fmtDate(batch.asOfDate)} import` : "no import";

  return (
    <div className="space-y-6">
      <PageHeader
        title={<span className="flex items-center gap-3">{inv.name} <StatusBadge status={inv.status} /></span>}
        subtitle={<><Link href={`/funds/${inv.fund.id}`} className="link">{inv.fund.name}</Link>{inv.assetClass ? ` · ${inv.assetClass} (accounting)` : ""} · bucket {inv.bucket}{inv.sector ? ` · ${inv.sector}` : ""} · entered {fmtDate(inv.entryDate)}{inv.externalId ? <span className="mono ml-2">{inv.externalId}</span> : <span className="faint ml-2">no accounting ID</span>}</>}
      />

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 mb-2">
          <h3>Financials <span className="normal-case tracking-normal font-normal">· read-only · {asOfLabel}</span></h3>
          {s && <span className="faint">{s.batch.fileName} · {s.sourceSheet} row {s.sourceRow}{s.holdingStatus ? ` · ${s.holdingStatus}` : s.valuationDate ? ` · valued ${fmtDate(s.valuationDate)}` : ""}</span>}
          {!s && seen && <span className="faint">last seen {fmtDate(seen.asOfDate)} in {seen.batch.fileName} — not forward-filled</span>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 md:gap-3">
          <Kpi label="Cost" value={<Fig value={s?.cost} fmt={fmtMoneyM} missing={missingReason(s, "Cost", batch)} />} />
          <Kpi label="Contributions" value={<Fig value={s?.contributions} fmt={fmtMoneyM} missing={missingReason(s, "Contributions", batch)} />} />
          <Kpi label="Distributions" value={<Fig value={s?.distributions} fmt={fmtMoneyM} missing={missingReason(s, "Distributions", batch)} />} />
          <Kpi label="Mark (NAV)" value={<Fig value={s?.nav} fmt={fmtMoneyM} missing={missingReason(s, "NAV", batch)} />} sub={<>unrealized <Fig value={unrealizedGain(s?.nav, s?.cost)} fmt={fmtMoneyM} missing="NAV − cost; an input is missing" /></>} />
          <Kpi label="MOIC (reported)" value={<Fig value={s?.moic} fmt={fmtMultiple} missing={missingReason(s, "MOIC", batch)} />} />
          <Kpi label="IRR (reported)" value={<Fig value={s?.irr} fmt={irrFmt} missing={missingReason(s, "IRR", batch)} />} />
          <Kpi label="DPI" value={<Fig value={dpi(s?.distributions, s?.contributions)} fmt={fmtMultiple} missing="distributions ÷ contributions; an input is missing" />} sub="computed" />
          <Kpi label="TVPI" value={<Fig value={tvpi(s?.distributions, s?.nav, s?.contributions)} fmt={fmtMultiple} missing="(distributions + NAV) ÷ contributions; an input is missing" />} sub="computed" />
        </div>
        {extra && Object.keys(extra).length > 0 && (
          <p className="faint mt-2">Other workbook columns: {Object.entries(extra).map(([k, v]) => `${k} = ${v === null ? "—" : typeof v === "number" ? v.toLocaleString("en-US") : v}`).join(" · ")}</p>
        )}
      </section>

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="card lg:col-span-2">
          <div className="card-h"><h2>Mark & cash-flow history</h2><span className="muted">{history.length} snapshot(s); gaps are months the investment was missing</span></div>
          <div className="card-b">
            <HistoryChart data={toHistoryPoints(history)} />
            <div className="tbl-wrap mt-3">
              <table className="tbl compact">
                <thead><tr><th>As of</th><th>Import</th><th>Valuation</th><th className="num">Cost</th><th className="num">Contrib.</th><th className="num">Distrib.</th><th className="num">NAV</th><th className="num">IRR</th><th className="num">MOIC</th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="whitespace-nowrap">{fmtDate(h.asOfDate)}</td>
                      <td className="muted truncate max-w-[220px]"><Link href={`/import/${h.batchId}`} className="hover:underline">{h.batch.fileName}</Link></td>
                      <td className="whitespace-nowrap muted">{h.holdingStatus ?? fmtDate(h.valuationDate)}</td>
                      {(["cost", "contributions", "distributions", "nav"] as const).map((k) => (
                        <td key={k} className="num"><Fig value={h[k]} fmt={fmtMoneyM} missing={missingReason(h, FIELD_LABELS[k])} /></td>
                      ))}
                      <td className="num"><Fig value={h.irr} fmt={irrFmt} missing={missingReason(h, "IRR")} /></td>
                      <td className="num"><Fig value={h.moic} fmt={fmtMultiple} missing={missingReason(h, "MOIC")} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <section className="card">
          <div className="card-h"><h2>Details</h2><span className="muted">editable</span></div>
          <div className="card-b"><InvestmentEditForm investment={inv} /></div>
        </section>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="space-y-2">
          <h2>Open action items</h2>
          <QuickAdd options={options} members={teamMembers()} defaultOwner={me} defaultLink={`investment:${inv.id}`} />
          <ItemsTable items={sortByUrgency(items)} showLink={false} emptyText="No open items." />
        </section>
        <DocumentsPanel investmentId={inv.id} documents={inv.documents} typeLabels={DOCUMENT_TYPE_LABELS} />
      </div>
    </div>
  );
}
