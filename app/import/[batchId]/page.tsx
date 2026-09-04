import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmtDate, fmtMoney, fmtMoneyM, fmtMultiple, fmtPct, fmtRatioPct } from "@/lib/format";
import type { ParsedWorkbook } from "@/lib/import/parser";
import { emptyResolutions, resolveWorkbook, type UserResolutions } from "@/lib/import/match";
import { reconcile, type FundReconciliation } from "@/lib/import/reconcile";
import { diffAgainstPrior } from "@/lib/import/diff";
import { MARK_CHANGE_FLAG_PCT } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Fig } from "@/components/ui/Fig";
import { ResolveFund, ResolveInvestment } from "@/components/import/Resolve";
import { CommitBar } from "@/components/import/CommitBar";
import { fieldLabel } from "@/components/import/labels";
import { ReconciliationPanel } from "@/components/import/ReconciliationPanel";

export const dynamic = "force-dynamic";

const CLASS_LABELS = { nonAffiliate: "Non-Affiliate", affiliate: "Affiliate", gpCarry: "GP Carry", total: "Fund Total" } as const;
const MEASURE_LABELS = { commitments: "Total Commitments", called: "Called Capital", distributions: "Distributions", redemptions: "Redemptions", nav: "Remaining NAV", totalValue: "Total Value" } as const;

export default async function BatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) notFound();

  if (batch.status === "failed") {
    return (
      <div className="space-y-4">
        <PageHeader title={batch.fileName} subtitle={`Uploaded ${fmtDate(batch.uploadedAt)} by ${batch.uploadedBy ?? "—"}`}><Badge tone="neg">failed</Badge></PageHeader>
        <section className="card">
          <div className="card-h"><h2>Import aborted — nothing was written</h2></div>
          <div className="card-b">
            <ul className="list-disc pl-5 space-y-1 text-neg">{(batch.errorMessage ?? "").split("\n").map((l, i) => <li key={i}>{l}</li>)}</ul>
            <p className="muted mt-3">Fix the workbook and upload it again. What the file must contain is listed on the <Link href="/import" className="link">import page</Link>.</p>
          </div>
        </section>
      </div>
    );
  }

  if (batch.status !== "pending") {
    const variances = batch.varianceJson ? (JSON.parse(batch.varianceJson) as FundReconciliation[]) : [];
    const snaps = await prisma.financialSnapshot.findMany({ where: { batchId }, include: { investment: { select: { name: true } }, fund: { select: { name: true } } }, orderBy: [{ level: "desc" }, { sourceRow: "asc" }] });
    const fundSnap = snaps.find((s) => s.level === "fund");
    const classes = fundSnap?.classJson ? (JSON.parse(fundSnap.classJson) as Record<keyof typeof CLASS_LABELS, Record<keyof typeof MEASURE_LABELS, number | null>>) : null;
    return (
      <div className="space-y-6">
        <PageHeader title={batch.fileName} subtitle={`${batch.fundName ?? ""} · as of ${fmtDate(batch.asOfDate)} · uploaded ${fmtDate(batch.uploadedAt)} by ${batch.uploadedBy ?? "—"}${batch.committedAt ? ` · committed ${fmtDate(batch.committedAt)}` : ""}`}>
          <Badge tone={batch.status === "committed" ? "pos" : ""}>{batch.status}</Badge>
          {batch.status === "committed" && <CommitBar batchId={batchId} mode="committed" />}
        </PageHeader>
        {fundSnap && classes && <FundPanel snap={fundSnap} classes={classes} fundId={fundSnap.fundId} />}
        <ReconciliationPanel variances={variances} />
        <section className="card">
          <div className="card-h"><h2>Holdings in this batch</h2><span className="muted">{snaps.length - 1} rows, stored as received</span></div>
          <div className="tbl-wrap border-0 rounded-none">
            <table className="tbl compact">
              <thead><tr><th>Holding</th><th>Workbook name</th><th>Valuation</th><th className="num">Cost</th><th className="num">Contrib.</th><th className="num">Distrib.</th><th className="num">NAV</th><th className="num">IRR</th><th className="num">MOIC</th><th>Row</th></tr></thead>
              <tbody>
                {snaps.filter((s) => s.level === "investment").map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/investments/${s.investmentId}`} className="link">{s.investment?.name}</Link></td>
                    <td className="muted">{s.sourceName}</td>
                    <td className="whitespace-nowrap">{s.holdingStatus ?? fmtDate(s.valuationDate)}</td>
                    <td className="num"><Fig value={s.cost} fmt={fmtMoney} missing="not on MTM" /></td>
                    <td className="num"><Fig value={s.contributions} fmt={fmtMoney} missing="no cash-flow block" /></td>
                    <td className="num"><Fig value={s.distributions} fmt={fmtMoney} missing="no cash-flow block" /></td>
                    <td className="num"><Fig value={s.nav} fmt={fmtMoney} missing="blank in workbook" /></td>
                    <td className="num"><Fig value={s.irr} fmt={fmtRatioPct} missing="blank in workbook" /></td>
                    <td className="num"><Fig value={s.moic} fmt={fmtMultiple} missing="blank in workbook" /></td>
                    <td className="faint">{s.sourceSheet}!{s.sourceRow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  // ---------- pending: preview ----------
  const parsed = JSON.parse(batch.parsedJson!) as ParsedWorkbook;
  const user = batch.resolutionsJson ? (JSON.parse(batch.resolutionsJson) as UserResolutions) : emptyResolutions();
  const [resolved, funds, investments] = await Promise.all([
    resolveWorkbook(parsed, user),
    prisma.fund.findMany({ orderBy: { vintage: "asc" }, select: { id: true, name: true } }),
    prisma.investment.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, fundId: true, externalId: true } }),
  ]);
  const fundRes = resolved.funds[0];
  const fundRow = parsed.funds[0];
  const prior = fundRes.fundId
    ? await prisma.importBatch.findFirst({ where: { status: "committed", fundId: fundRes.fundId, asOfDate: { lt: batch.asOfDate! } }, orderBy: { asOfDate: "desc" }, include: { snapshots: { where: { level: "investment" } } } })
    : null;
  const priorRows = (prior?.snapshots ?? []).map((s) => ({ investmentId: s.investmentId!, asOfDate: s.asOfDate.toISOString().slice(0, 10), nav: s.nav, cost: s.cost, distributions: s.distributions, contributions: s.contributions }));
  const diff = diffAgainstPrior(parsed.investments, resolved.investments.map((r) => ({ index: r.index, investmentId: r.investmentId, createNew: r.createNew })), priorRows);
  const variances = reconcile(parsed);
  const invById = new Map(investments.map((i) => [i.id, i]));
  const fundById = new Map(funds.map((f) => [f.id, f]));
  const disappeared = diff.disappeared.map((id) => invById.get(id)?.name ?? id);
  const alreadyCommitted = fundRes.fundId ? await prisma.importBatch.findFirst({ where: { status: "committed", asOfDate: batch.asOfDate!, fundId: fundRes.fundId } }) : null;
  const flaggedChecks = variances.reduce((a, v) => a + v.checks.filter((c) => c.flagged).length + v.holdingChecks.filter((h) => h.flagged).length, 0);

  return (
    <div className="space-y-6">
      <PageHeader title={batch.fileName} subtitle={`${fundRow.name} · as of ${fmtDate(batch.asOfDate)} · ${parsed.investments.length} holdings · sheets read: ${parsed.sheetsRead.join(", ")} · prior month: ${prior ? `${fmtDate(prior.asOfDate)} (${prior.fileName})` : "none for this fund"}`}>
        <Badge tone="warn">preview — nothing written yet</Badge>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
        <div className="card kpi"><div className="kpi-l">Unmatched rows</div><div className={`kpi-v ${resolved.unresolvedCount ? "text-neg" : ""}`}>{resolved.unresolvedCount}</div><div className="kpi-s">must be mapped or created</div></div>
        <div className="card kpi"><div className="kpi-l">New holdings</div><div className="kpi-v">{diff.counts.new}</div><div className="kpi-s">no prior snapshot</div></div>
        <div className="card kpi"><div className="kpi-l">Mark changes &gt; {MARK_CHANGE_FLAG_PCT}%</div><div className={`kpi-v ${diff.counts.flagged ? "text-warn" : ""}`}>{diff.counts.flagged}</div><div className="kpi-s">vs prior month NAV</div></div>
        <div className="card kpi"><div className="kpi-l">Missing from workbook</div><div className={`kpi-v ${disappeared.length ? "text-warn" : ""}`}>{disappeared.length}</div><div className="kpi-s truncate" title={disappeared.join(", ")}>{disappeared.length ? disappeared.join(", ") : "all prior holdings present"}</div></div>
        <div className="card kpi"><div className="kpi-l">Reconciliation</div><div className={`kpi-v ${flaggedChecks ? "text-neg" : "text-pos"}`}>{flaggedChecks ? `${flaggedChecks} flagged` : "clean"}</div><div className="kpi-s">internal checks on the workbook</div></div>
      </div>

      {alreadyCommitted && <div className="card p-3 text-neg">A committed import already exists for this fund as of {fmtDate(batch.asOfDate)} ({alreadyCommitted.fileName}). Discard that batch first if this is a restatement.</div>}

      <section className="card">
        <div className="card-h">
          <h2>Fund: {fundRow.name}</h2>
          <span>
            {fundRes.fundId ? <><Badge tone="pos">{fundById.get(fundRes.fundId)?.name}</Badge> <span className="faint">via {fundRes.matchedBy}</span></> : <ResolveFund batchId={batchId} index={0} sourceName={fundRow.name} hasExternalId={false} funds={funds} suggestion={fundRes.suggestion} />}
          </span>
        </div>
        <div className="grid md:grid-cols-3 gap-0 md:divide-x divide-line-2">
          <div className="p-3">
            <h3 className="mb-2">Return basis</h3>
            <table className="w-full text-[12.5px]">
              <thead><tr className="muted"><th className="text-left font-medium">Basis</th><th className="num font-medium">IRR</th><th className="num font-medium">MOIC</th></tr></thead>
              <tbody>
                <tr><td className="py-0.5">Fund Gross</td><td className="num"><Fig value={fundRow.fundFields.irrGross} fmt={fmtRatioPct} missing="blank" /></td><td className="num"><Fig value={fundRow.fundFields.moicGross} fmt={fmtMultiple} missing="blank" /></td></tr>
                <tr><td className="py-0.5">Fund Net</td><td className="num"><Fig value={fundRow.fundFields.irrNet} fmt={fmtRatioPct} missing="blank" /></td><td className="num"><Fig value={fundRow.fundFields.moicNet} fmt={fmtMultiple} missing="blank" /></td></tr>
                <tr><td className="py-0.5">Total Fund</td><td className="num"><Fig value={fundRow.fields.irr} fmt={fmtRatioPct} missing="blank" /></td><td className="num"><Fig value={fundRow.fields.moic} fmt={fmtMultiple} missing="blank" /></td></tr>
              </tbody>
            </table>
          </div>
          <div className="p-3 md:col-span-2">
            <h3 className="mb-2">Capital &amp; distributions by class</h3>
            <div className="tbl-wrap border-0">
              <table className="tbl compact">
                <thead><tr><th>Measure</th>{Object.values(CLASS_LABELS).map((l) => <th key={l} className="num">{l}</th>)}</tr></thead>
                <tbody>
                  {(Object.keys(MEASURE_LABELS) as (keyof typeof MEASURE_LABELS)[]).map((mk) => (
                    <tr key={mk}>
                      <td>{MEASURE_LABELS[mk]}</td>
                      {(Object.keys(CLASS_LABELS) as (keyof typeof CLASS_LABELS)[]).map((ck) => (
                        <td key={ck} className={`num ${ck === "total" ? "font-medium" : ""}`}><Fig value={fundRow.classes[ck][mk]} fmt={fmtMoney} missing="blank in workbook" /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-h"><h2>Holdings</h2><span className="muted">NAV change vs {prior ? fmtDate(prior.asOfDate) : "—"}</span></div>
        <div className="tbl-wrap border-0 rounded-none">
          <table className="tbl compact">
            <thead><tr><th>Row</th><th>Workbook name</th><th>Valuation</th><th>Matched</th><th className="num">Cost</th><th className="num">Contrib.</th><th className="num">Distrib.</th><th className="num">Prior NAV</th><th className="num">NAV</th><th className="num">Δ%</th><th className="num">IRR</th><th className="num">MOIC</th><th>Missing</th></tr></thead>
            <tbody>
              {parsed.investments.map((row, i) => {
                const r = resolved.investments[i];
                const d = diff.entries[i];
                return (
                  <tr key={i} className={d.status === "unmatched" ? "bg-neg-soft" : ""}>
                    <td className="faint">{row.row}</td>
                    <td className="font-medium">{row.name}{typeof row.extra["Investment Type"] === "string" && <span className="faint ml-1">· {row.extra["Investment Type"]}</span>}</td>
                    <td className="whitespace-nowrap">{row.holdingStatus ? <Badge tone="warn">{row.holdingStatus}</Badge> : fmtDate(row.valuationDate)}</td>
                    <td>
                      {r.investmentId ? (
                        <><Badge tone={d.status === "new" ? "warn" : "pos"}>{invById.get(r.investmentId)?.name}</Badge> <span className="faint">via {r.matchedBy}</span>{d.status === "new" && <span className="faint"> · first snapshot</span>}</>
                      ) : r.createNew ? (
                        <><Badge tone="warn">create new · {r.bucket}</Badge> <ResolveInvestment batchId={batchId} index={i} sourceName={row.name} hasExternalId={false} investments={investments.filter((x) => !r.fundId || x.fundId === r.fundId)} suggestion={r.suggestion} canCreate={!!r.fundId} clearOnly /></>
                      ) : (
                        <ResolveInvestment batchId={batchId} index={i} sourceName={row.name} hasExternalId={false} investments={investments.filter((x) => !r.fundId || x.fundId === r.fundId)} suggestion={r.suggestion} canCreate={!!r.fundId} />
                      )}
                    </td>
                    <td className="num"><Fig value={row.fields.cost} fmt={fmtMoney} missing="not on MTM" /></td>
                    <td className="num"><Fig value={row.fields.contributions} fmt={fmtMoney} missing="no cash-flow block" /></td>
                    <td className="num"><Fig value={row.fields.distributions} fmt={fmtMoney} missing="no cash-flow block" /></td>
                    <td className="num muted"><Fig value={d.navPrior} fmt={fmtMoney} missing={d.status === "existing" ? "blank in prior import" : "no prior snapshot"} /></td>
                    <td className="num"><Fig value={row.fields.nav} fmt={fmtMoney} missing="blank" /></td>
                    <td className={`num ${d.flagged ? "text-neg font-medium" : "muted"}`}><Fig value={d.navChangePct} fmt={fmtPct} missing="n/a" /></td>
                    <td className="num"><Fig value={row.fields.irr} fmt={fmtRatioPct} missing="blank" /></td>
                    <td className="num"><Fig value={row.fields.moic} fmt={fmtMultiple} missing="blank" /></td>
                    <td className="faint">{row.missingFields.length ? row.missingFields.map(fieldLabel).join(", ") : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <ReconciliationPanel variances={variances} />

      <CommitBar batchId={batchId} mode="pending" unresolved={resolved.unresolvedCount} blocked={!!alreadyCommitted} flagged={flaggedChecks} />
    </div>
  );
}

function FundPanel({ snap, classes, fundId }: { snap: { irrGross: number | null; moicGross: number | null; irrNet: number | null; moicNet: number | null; irr: number | null; moic: number | null }; classes: Record<keyof typeof CLASS_LABELS, Record<keyof typeof MEASURE_LABELS, number | null>>; fundId: string | null }) {
  return (
    <section className="card">
      <div className="card-h"><h2>Fund-level figures</h2>{fundId && <Link href={`/funds/${fundId}`} className="link muted">open fund</Link>}</div>
      <div className="grid md:grid-cols-3 gap-0 md:divide-x divide-line-2">
        <div className="p-3">
          <h3 className="mb-2">Return basis</h3>
          <table className="w-full text-[12.5px]">
            <thead><tr className="muted"><th className="text-left font-medium">Basis</th><th className="num font-medium">IRR</th><th className="num font-medium">MOIC</th></tr></thead>
            <tbody>
              <tr><td className="py-0.5">Fund Gross</td><td className="num"><Fig value={snap.irrGross} fmt={fmtRatioPct} missing="blank" /></td><td className="num"><Fig value={snap.moicGross} fmt={fmtMultiple} missing="blank" /></td></tr>
              <tr><td className="py-0.5">Fund Net</td><td className="num"><Fig value={snap.irrNet} fmt={fmtRatioPct} missing="blank" /></td><td className="num"><Fig value={snap.moicNet} fmt={fmtMultiple} missing="blank" /></td></tr>
              <tr><td className="py-0.5">Total Fund</td><td className="num"><Fig value={snap.irr} fmt={fmtRatioPct} missing="blank" /></td><td className="num"><Fig value={snap.moic} fmt={fmtMultiple} missing="blank" /></td></tr>
            </tbody>
          </table>
        </div>
        <div className="p-3 md:col-span-2">
          <h3 className="mb-2">Capital &amp; distributions by class</h3>
          <div className="tbl-wrap border-0">
            <table className="tbl compact">
              <thead><tr><th>Measure</th>{Object.values(CLASS_LABELS).map((l) => <th key={l} className="num">{l}</th>)}</tr></thead>
              <tbody>
                {(Object.keys(MEASURE_LABELS) as (keyof typeof MEASURE_LABELS)[]).map((mk) => (
                  <tr key={mk}>
                    <td>{MEASURE_LABELS[mk]}</td>
                    {(Object.keys(CLASS_LABELS) as (keyof typeof CLASS_LABELS)[]).map((ck) => (
                      <td key={ck} className={`num ${ck === "total" ? "font-medium" : ""}`}><Fig value={classes[ck][mk]} fmt={fmtMoneyM} missing="blank in workbook" /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
