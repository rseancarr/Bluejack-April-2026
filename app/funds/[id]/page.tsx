import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmtDate, fmtMoneyM, fmtMultiple, fmtPct, fmtRatioPct } from "@/lib/format";
import { dpi, pctCalled, sumStrict, tvpi, uncalled } from "@/lib/metrics/returns";
import { fundHistory, latestBatches, latestFundSnapshots, latestInvestmentSnapshots, missingReason } from "@/lib/queries/snapshots";
import { toHistoryPoints } from "@/lib/queries/history";
import { actionItemInclude, sortByUrgency } from "@/lib/queries/actionItems";
import { IRR_SCALE } from "@/lib/import/schema";
import { HistoryChart } from "@/components/charts/HistoryChart";
import { Fig } from "@/components/ui/Fig";
import { Kpi } from "@/components/ui/Kpi";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/Badge";
import { ItemsTable } from "@/components/actionItems/ItemsTable";
import { FundEditForm } from "./FundEditForm";
import type { FundReconciliation } from "@/lib/import/reconcile";
import { ReconciliationPanel } from "@/components/import/ReconciliationPanel";

export const dynamic = "force-dynamic";

export default async function FundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fund = await prisma.fund.findUnique({ where: { id }, include: { investments: { orderBy: { name: "asc" } } } });
  if (!fund) notFound();
  const latest = await latestBatches();
  const batch = latest.byFund.get(id) ?? null;
  const [fundSnaps, invSnaps, history, items] = await Promise.all([
    latestFundSnapshots(latest),
    latestInvestmentSnapshots(latest),
    fundHistory(id),
    prisma.actionItem.findMany({ where: { fundId: id, status: "open" }, include: actionItemInclude }),
  ]);
  const s = fundSnaps.get(id);
  const irrFmt = IRR_SCALE === "fraction" ? fmtRatioPct : fmtPct;

  // Roll-up of investment-level figures (strict: null if any investment is missing the field).
  const active = fund.investments;
  const invRows = active.map((i) => invSnaps.get(i.id));
  const roll = {
    cost: sumStrict(invRows.map((r) => r?.cost)),
    nav: sumStrict(invRows.map((r) => r?.nav)),
    distributions: sumStrict(invRows.map((r) => r?.distributions)),
    contributions: sumStrict(invRows.map((r) => r?.contributions)),
  };
  const sBatch = s ? await prisma.importBatch.findUnique({ where: { id: s.batchId } }) : null;
  const variances = sBatch?.varianceJson ? (JSON.parse(sBatch.varianceJson) as FundReconciliation[]) : [];
  const committed = s?.commitments ?? null; // accounting's Total Commitments; fund.committedCapital is the manual LPA figure
  const classes = s?.classJson ? (JSON.parse(s.classJson) as Record<"nonAffiliate" | "affiliate" | "gpCarry" | "total", Record<"commitments" | "called" | "distributions" | "redemptions" | "nav" | "totalValue", number | null>>) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={<span className="flex items-center gap-3">{fund.name} <StatusBadge status={fund.status} /></span>}
        subtitle={<>Vintage {fund.vintage} · {fund.investments.length} investments · {s ? `financials as of ${fmtDate(s.asOfDate)} (${s.batch.fileName})` : "no financials imported"}</>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3">
        <Kpi label="Commitments" value={<Fig value={committed} fmt={fmtMoneyM} missing={missingReason(s, "Total Commitments", batch)} />} sub="accounting" />
        <Kpi label="Called" value={<Fig value={s?.contributions} fmt={fmtMoneyM} missing={missingReason(s, "Called Capital", batch)} />} sub={<Fig value={pctCalled(committed, s?.contributions)} fmt={fmtRatioPct} missing="needs commitments + called" />} />
        <Kpi label="Uncalled" value={<Fig value={uncalled(committed, s?.contributions)} fmt={fmtMoneyM} missing="Needs commitments and called capital from the latest import." />} sub="commitments − called" />
        <Kpi label="Remaining NAV" value={<Fig value={s?.nav} fmt={fmtMoneyM} missing={missingReason(s, "Remaining NAV", batch)} />} sub={<>total value <Fig value={s?.totalValue} fmt={fmtMoneyM} missing={missingReason(s, "Total Value", batch)} /></>} />
        <Kpi label="DPI" value={<Fig value={dpi(s?.distributions, s?.contributions)} fmt={fmtMultiple} missing="distributions ÷ called; an input is missing" />} sub={<>distributions <Fig value={s?.distributions} fmt={fmtMoneyM} missing={missingReason(s, "Distributions", batch)} /></>} />
        <Kpi label="Net IRR / MOIC" value={<><Fig value={s?.irrNet} fmt={irrFmt} missing={missingReason(s, "Fund Net IRR", batch)} /> · <Fig value={s?.moicNet} fmt={fmtMultiple} missing={missingReason(s, "Fund Net MOIC", batch)} /></>} sub={<>gross <Fig value={s?.irrGross} fmt={irrFmt} missing={missingReason(s, "Fund Gross IRR", batch)} /> · <Fig value={s?.moicGross} fmt={fmtMultiple} missing={missingReason(s, "Fund Gross MOIC", batch)} /> · total fund <Fig value={s?.irr} fmt={irrFmt} missing={missingReason(s, "Total Fund IRR", batch)} /> · <Fig value={s?.moic} fmt={fmtMultiple} missing={missingReason(s, "Total Fund MOIC", batch)} /></>} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="card lg:col-span-2">
          <div className="card-h"><h2>History</h2><span className="muted">fund-level, every committed import</span></div>
          <div className="card-b"><HistoryChart data={toHistoryPoints(history)} series={["nav", "contributions", "distributions"]} /></div>
        </section>
        <section className="card">
          <div className="card-h"><h2>By investor class</h2><span className="muted">as reported</span></div>
          <div className="card-b">
            {classes ? (
              <table className="w-full text-[12.5px]">
                <thead><tr className="muted"><th className="text-left font-medium">Measure</th><th className="num font-medium">Non-Affil.</th><th className="num font-medium">Affiliate</th><th className="num font-medium">GP Carry</th><th className="num font-medium">Total</th></tr></thead>
                <tbody>
                  {(["commitments", "called", "distributions", "redemptions", "nav", "totalValue"] as const).map((k) => (
                    <tr key={k}>
                      <td className="py-1">{{ commitments: "Commitments", called: "Called", distributions: "Distributions", redemptions: "Redemptions", nav: "Remaining NAV", totalValue: "Total value" }[k]}</td>
                      {(["nonAffiliate", "affiliate", "gpCarry", "total"] as const).map((c) => (
                        <td key={c} className={`num ${c === "total" ? "font-medium" : ""}`}><Fig value={classes[c][k]} fmt={fmtMoneyM} missing="blank in workbook" /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="muted">No fund-level import yet.</div>
            )}
            <table className="w-full text-[12.5px] mt-3">
              <thead><tr className="muted"><th className="text-left font-medium">Σ holdings (latest import)</th><th className="num font-medium">Value</th></tr></thead>
              <tbody>
                {(["cost", "nav", "distributions", "contributions"] as const).map((k) => (
                  <tr key={k}><td className="py-0.5 capitalize">{k === "nav" ? "NAV" : k}</td><td className="num"><Fig value={roll[k].sum} fmt={fmtMoneyM} missing={roll[k].missing ? `${roll[k].missing} holding(s) blank — no partial sum` : "no holdings in the latest import"} /></td></tr>
                ))}
              </tbody>
            </table>
            <p className="faint mt-2">Fund NAV differs from Σ holdings by cash, accruals and GP carry; the import's reconciliation checks are below.</p>
          </div>
        </section>
      </div>

      {variances.length > 0 && <ReconciliationPanel variances={variances} />}

      <section className="card">
        <div className="card-h"><h2>Investments</h2><Link href={`/investments?fund=${fund.id}`} className="link muted">open in table</Link></div>
        <div className="tbl-wrap border-0 rounded-none">
          <table className="tbl compact">
            <thead><tr><th>Name</th><th>Bucket</th><th>Type</th><th>Status</th><th>Valuation</th><th className="num">Cost</th><th className="num">NAV</th><th className="num">Distributions</th><th className="num">IRR</th><th className="num">MOIC</th></tr></thead>
            <tbody>
              {fund.investments.map((i) => {
                const r = invSnaps.get(i.id);
                return (
                  <tr key={i.id}>
                    <td><Link href={`/investments/${i.id}`} className="link">{i.name}</Link></td>
                    <td>{i.bucket}</td>
                    <td className="muted">{i.sector ?? "—"}</td>
                    <td><StatusBadge status={i.status} /></td>
                    <td className="whitespace-nowrap muted">{r?.holdingStatus ?? (r?.valuationDate ? fmtDate(r.valuationDate) : "—")}</td>
                    <td className="num"><Fig value={r?.cost} fmt={fmtMoneyM} missing={missingReason(r, "Cost", batch)} /></td>
                    <td className="num"><Fig value={r?.nav} fmt={fmtMoneyM} missing={missingReason(r, "NAV", batch)} /></td>
                    <td className="num"><Fig value={r?.distributions} fmt={fmtMoneyM} missing={missingReason(r, "Distributions", batch)} /></td>
                    <td className="num"><Fig value={r?.irr} fmt={irrFmt} missing={missingReason(r, "IRR", batch)} /></td>
                    <td className="num"><Fig value={r?.moic} fmt={fmtMultiple} missing={missingReason(r, "MOIC", batch)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="space-y-2">
          <h2>Open action items</h2>
          <ItemsTable items={sortByUrgency(items)} showLink={false} emptyText="No open items linked to this fund." />
        </section>
        <section className="card">
          <div className="card-h"><h2>Fund terms</h2><span className="muted">editable · LPA terms, not accounting data</span></div>
          <div className="card-b"><FundEditForm fund={fund} /></div>
        </section>
      </div>
    </div>
  );
}
