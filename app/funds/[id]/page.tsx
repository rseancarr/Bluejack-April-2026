import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmtDate, fmtMoneyM, fmtMultiple, fmtPct, fmtRatioPct } from "@/lib/format";
import { dpi, pctCalled, sumStrict, tvpi, uncalled } from "@/lib/metrics/returns";
import { fundHistory, latestBatch, latestFundSnapshots, latestInvestmentSnapshots, missingReason } from "@/lib/queries/snapshots";
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

export const dynamic = "force-dynamic";

export default async function FundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fund = await prisma.fund.findUnique({ where: { id }, include: { investments: { orderBy: { name: "asc" } } } });
  if (!fund) notFound();
  const batch = await latestBatch();
  const [fundSnaps, invSnaps, history, items] = await Promise.all([
    latestFundSnapshots(batch),
    latestInvestmentSnapshots(batch),
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
  const variance = batch?.varianceJson ? (JSON.parse(batch.varianceJson) as FundReconciliation[]).find((v) => v.fundName === fund.name || (fund.externalId && v.fundKey === `id:${fund.externalId}`)) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title={<span className="flex items-center gap-3">{fund.name} <StatusBadge status={fund.status} /></span>}
        subtitle={<>Vintage {fund.vintage} · {fund.investments.length} investments · {s ? `financials as of ${fmtDate(s.asOfDate)} (${s.batch.fileName})` : "no financials imported"}</>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Kpi label="Committed" value={<Fig value={fund.committedCapital} fmt={fmtMoneyM} missing="Set committed capital below." />} />
        <Kpi label="Called" value={<Fig value={s?.contributions} fmt={fmtMoneyM} missing={missingReason(s, "Contributions", batch)} />} sub={<Fig value={pctCalled(fund.committedCapital, s?.contributions)} fmt={fmtRatioPct} missing="needs committed + called" />} />
        <Kpi label="Uncalled" value={<Fig value={uncalled(fund.committedCapital, s?.contributions)} fmt={fmtMoneyM} missing="Needs committed capital and imported contributions." />} />
        <Kpi label="NAV" value={<Fig value={s?.nav} fmt={fmtMoneyM} missing={missingReason(s, "NAV", batch)} />} />
        <Kpi label="DPI" value={<Fig value={dpi(s?.distributions, s?.contributions)} fmt={fmtMultiple} missing="distributions ÷ contributions; an input is missing" />} sub="computed" />
        <Kpi label="TVPI" value={<Fig value={tvpi(s?.distributions, s?.nav, s?.contributions)} fmt={fmtMultiple} missing="(distributions + NAV) ÷ contributions; an input is missing" />} sub={<>reported IRR <Fig value={s?.irr} fmt={irrFmt} missing={missingReason(s, "IRR", batch)} /> · MOIC <Fig value={s?.moic} fmt={fmtMultiple} missing={missingReason(s, "MOIC", batch)} /></>} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="card lg:col-span-2">
          <div className="card-h"><h2>History</h2><span className="muted">fund-level, every committed import</span></div>
          <div className="card-b"><HistoryChart data={toHistoryPoints(history)} series={["nav", "contributions", "distributions"]} /></div>
        </section>
        <section className="card">
          <div className="card-h"><h2>Fund-level vs. sum of investments</h2></div>
          <div className="card-b">
            <table className="w-full text-[12.5px]">
              <thead><tr className="muted"><th className="text-left font-medium">Field</th><th className="num font-medium">Fund row</th><th className="num font-medium">Σ investments</th><th className="num font-medium">Var.</th></tr></thead>
              <tbody>
                {(["cost", "contributions", "distributions", "nav"] as const).map((k) => {
                  const v = variance?.fields.find((f) => f.field === k);
                  return (
                    <tr key={k} className={v?.flagged ? "text-neg" : ""}>
                      <td className="py-1 capitalize">{k === "nav" ? "NAV" : k}</td>
                      <td className="num"><Fig value={s?.[k]} fmt={fmtMoneyM} missing={missingReason(s, k, batch)} /></td>
                      <td className="num"><Fig value={roll[k].sum} fmt={fmtMoneyM} missing={roll[k].missing ? `${roll[k].missing} investment(s) missing ${k} in the latest import — no partial sum.` : "No investment rows in the latest import."} /></td>
                      <td className="num"><Fig value={v?.variance ?? null} fmt={fmtMoneyM} missing="Not reconcilable (a side is missing)." /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="faint mt-2">Variance is recorded on the import batch at commit time; the fund row is what accounting reported.</p>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-h"><h2>Investments</h2><Link href={`/investments?fund=${fund.id}`} className="link muted">open in table</Link></div>
        <div className="tbl-wrap border-0 rounded-none">
          <table className="tbl compact">
            <thead><tr><th>Name</th><th>Bucket</th><th>Sector</th><th>Status</th><th className="num">Cost</th><th className="num">NAV</th><th className="num">Distributions</th><th className="num">MOIC (rep.)</th></tr></thead>
            <tbody>
              {fund.investments.map((i) => {
                const r = invSnaps.get(i.id);
                return (
                  <tr key={i.id}>
                    <td><Link href={`/investments/${i.id}`} className="link">{i.name}</Link></td>
                    <td>{i.bucket}</td>
                    <td className="muted">{i.sector ?? "—"}</td>
                    <td><StatusBadge status={i.status} /></td>
                    <td className="num"><Fig value={r?.cost} fmt={fmtMoneyM} missing={missingReason(r, "Cost", batch)} /></td>
                    <td className="num"><Fig value={r?.nav} fmt={fmtMoneyM} missing={missingReason(r, "NAV", batch)} /></td>
                    <td className="num"><Fig value={r?.distributions} fmt={fmtMoneyM} missing={missingReason(r, "Distributions", batch)} /></td>
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
          <div className="card-h"><h2>Fund terms</h2><span className="muted">editable · not accounting data</span></div>
          <div className="card-b"><FundEditForm fund={fund} /></div>
        </section>
      </div>
    </div>
  );
}
