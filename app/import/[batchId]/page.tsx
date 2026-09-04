import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmtDate, fmtMoney, fmtMoneyM, fmtMultiple, fmtPct } from "@/lib/format";
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

export const dynamic = "force-dynamic";

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
            <p className="muted mt-3">Fix the workbook and upload it again. The expected layout is on the <Link href="/import" className="link">import page</Link>.</p>
          </div>
        </section>
      </div>
    );
  }

  if (batch.status !== "pending") {
    const variances = batch.varianceJson ? (JSON.parse(batch.varianceJson) as FundReconciliation[]) : [];
    const snaps = await prisma.financialSnapshot.findMany({ where: { batchId }, include: { investment: { select: { name: true } }, fund: { select: { name: true } } }, orderBy: [{ level: "desc" }, { sourceRow: "asc" }] });
    return (
      <div className="space-y-6">
        <PageHeader title={batch.fileName} subtitle={`As of ${fmtDate(batch.asOfDate)} · uploaded ${fmtDate(batch.uploadedAt)} by ${batch.uploadedBy ?? "—"}${batch.committedAt ? ` · committed ${fmtDate(batch.committedAt)}` : ""}`}>
          <Badge tone={batch.status === "committed" ? "pos" : ""}>{batch.status}</Badge>
          {batch.status === "committed" && <CommitBar batchId={batchId} mode="committed" />}
        </PageHeader>
        <ReconciliationTable variances={variances} />
        <section className="card">
          <div className="card-h"><h2>Snapshots in this batch</h2><span className="muted">{snaps.length} rows, stored as received</span></div>
          <div className="tbl-wrap border-0 rounded-none">
            <table className="tbl compact">
              <thead><tr><th>Level</th><th>Record</th><th>Workbook name</th><th className="num">Cost</th><th className="num">Contrib.</th><th className="num">Distrib.</th><th className="num">NAV</th><th className="num">IRR</th><th className="num">MOIC</th><th>Row</th></tr></thead>
              <tbody>
                {snaps.map((s) => (
                  <tr key={s.id}>
                    <td>{s.level}</td>
                    <td>{s.investment ? <Link href={`/investments/${s.investmentId}`} className="link">{s.investment.name}</Link> : <Link href={`/funds/${s.fundId}`} className="link">{s.fund?.name}</Link>}</td>
                    <td className="muted">{s.sourceName}</td>
                    <td className="num"><Fig value={s.cost} fmt={fmtMoney} missing="blank in workbook" /></td>
                    <td className="num"><Fig value={s.contributions} fmt={fmtMoney} missing="blank in workbook" /></td>
                    <td className="num"><Fig value={s.distributions} fmt={fmtMoney} missing="blank in workbook" /></td>
                    <td className="num"><Fig value={s.nav} fmt={fmtMoney} missing="blank in workbook" /></td>
                    <td className="num"><Fig value={s.irr} fmt={(v) => String(v)} missing="blank in workbook" /></td>
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
  const [resolved, funds, investments, prior] = await Promise.all([
    resolveWorkbook(parsed, user),
    prisma.fund.findMany({ orderBy: { vintage: "asc" }, select: { id: true, name: true } }),
    prisma.investment.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, fundId: true, externalId: true } }),
    prisma.importBatch.findFirst({ where: { status: "committed", asOfDate: { lt: batch.asOfDate! } }, orderBy: { asOfDate: "desc" }, include: { snapshots: { where: { level: "investment" } } } }),
  ]);
  const priorRows = (prior?.snapshots ?? []).map((s) => ({ investmentId: s.investmentId!, asOfDate: s.asOfDate.toISOString().slice(0, 10), nav: s.nav, cost: s.cost, distributions: s.distributions, contributions: s.contributions }));
  const diff = diffAgainstPrior(parsed.investments, resolved.investments.map((r) => ({ index: r.index, investmentId: r.investmentId, createNew: r.createNew })), priorRows);
  const variances = reconcile(parsed.funds, parsed.investments);
  const invById = new Map(investments.map((i) => [i.id, i]));
  const fundById = new Map(funds.map((f) => [f.id, f]));
  const disappeared = diff.disappeared.map((id) => invById.get(id)?.name ?? id);
  const alreadyCommitted = await prisma.importBatch.findFirst({ where: { status: "committed", asOfDate: batch.asOfDate! } });

  return (
    <div className="space-y-6">
      <PageHeader title={batch.fileName} subtitle={`As of ${fmtDate(batch.asOfDate)} · ${parsed.funds.length} fund rows, ${parsed.investments.length} investment rows · prior month: ${prior ? `${fmtDate(prior.asOfDate)} (${prior.fileName})` : "none"}`}>
        <Badge tone="warn">preview — nothing written yet</Badge>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="card kpi"><div className="kpi-l">Unmatched rows</div><div className={`kpi-v ${resolved.unresolvedCount ? "text-neg" : ""}`}>{resolved.unresolvedCount}</div><div className="kpi-s">must be mapped or created</div></div>
        <div className="card kpi"><div className="kpi-l">New investments</div><div className="kpi-v">{diff.counts.new}</div><div className="kpi-s">no prior snapshot</div></div>
        <div className="card kpi"><div className="kpi-l">Mark changes &gt; {MARK_CHANGE_FLAG_PCT}%</div><div className={`kpi-v ${diff.counts.flagged ? "text-warn" : ""}`}>{diff.counts.flagged}</div><div className="kpi-s">vs prior month NAV</div></div>
        <div className="card kpi"><div className="kpi-l">Missing from workbook</div><div className={`kpi-v ${disappeared.length ? "text-warn" : ""}`}>{disappeared.length}</div><div className="kpi-s truncate" title={disappeared.join(", ")}>{disappeared.length ? disappeared.join(", ") : "all prior investments present"}</div></div>
        <div className="card kpi"><div className="kpi-l">Reconciliation</div><div className={`kpi-v ${variances.some((v) => v.flagged) ? "text-neg" : "text-pos"}`}>{variances.filter((v) => v.flagged).length ? `${variances.filter((v) => v.flagged).length} flagged` : "clean"}</div><div className="kpi-s">Σ investments vs fund rows</div></div>
      </div>

      {alreadyCommitted && <div className="card p-3 text-neg">A committed import already exists for {fmtDate(batch.asOfDate)} ({alreadyCommitted.fileName}). Discard that batch first if this is a restatement.</div>}

      <section className="card">
        <div className="card-h"><h2>Funds sheet</h2></div>
        <div className="tbl-wrap border-0 rounded-none">
          <table className="tbl compact">
            <thead><tr><th>Row</th><th>Workbook name</th><th>ID</th><th>Matched</th><th className="num">Cost</th><th className="num">Contrib.</th><th className="num">Distrib.</th><th className="num">NAV</th><th className="num">IRR</th><th className="num">MOIC</th></tr></thead>
            <tbody>
              {parsed.funds.map((row, i) => {
                const r = resolved.funds[i];
                return (
                  <tr key={i}>
                    <td className="faint">{row.row}</td>
                    <td className="font-medium">{row.name}</td>
                    <td className="mono">{row.externalId ?? <span className="faint">—</span>}</td>
                    <td>
                      {r.fundId ? <><Badge tone="pos">{fundById.get(r.fundId)?.name}</Badge> <span className="faint">via {r.matchedBy}</span></> : <ResolveFund batchId={batchId} index={i} sourceName={row.name} hasExternalId={!!row.externalId} funds={funds} suggestion={r.suggestion} />}
                    </td>
                    <td className="num"><Fig value={row.fields.cost} fmt={fmtMoney} missing="blank / no column" /></td>
                    <td className="num"><Fig value={row.fields.contributions} fmt={fmtMoney} missing="blank" /></td>
                    <td className="num"><Fig value={row.fields.distributions} fmt={fmtMoney} missing="blank" /></td>
                    <td className="num"><Fig value={row.fields.nav} fmt={fmtMoney} missing="blank" /></td>
                    <td className="num"><Fig value={row.fields.irr} fmt={(v) => String(v)} missing="blank / no column" /></td>
                    <td className="num"><Fig value={row.fields.moic} fmt={fmtMultiple} missing="blank / no column" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-h"><h2>Investments sheet</h2><span className="muted">NAV change vs {prior ? fmtDate(prior.asOfDate) : "—"}</span></div>
        <div className="tbl-wrap border-0 rounded-none">
          <table className="tbl compact">
            <thead><tr><th>Row</th><th>Workbook name</th><th>ID</th><th>Fund (wb)</th><th>Matched</th><th className="num">Cost</th><th className="num">Contrib.</th><th className="num">Distrib.</th><th className="num">Prior NAV</th><th className="num">NAV</th><th className="num">Δ%</th><th>Missing</th></tr></thead>
            <tbody>
              {parsed.investments.map((row, i) => {
                const r = resolved.investments[i];
                const d = diff.entries[i];
                return (
                  <tr key={i} className={d.status === "unmatched" ? "bg-neg-soft" : ""}>
                    <td className="faint">{row.row}</td>
                    <td className="font-medium">{row.name}</td>
                    <td className="mono">{row.externalId ?? <span className="faint">—</span>}</td>
                    <td className="muted">{row.fundName}{row.fundExternalId ? <span className="mono ml-1">{row.fundExternalId}</span> : null}{!r.fundId && <span className="text-neg ml-1" title="Fund not matched — map it on the Funds sheet first">fund?</span>}</td>
                    <td>
                      {r.investmentId ? (
                        <><Badge tone={d.status === "new" ? "warn" : "pos"}>{invById.get(r.investmentId)?.name}</Badge> <span className="faint">via {r.matchedBy}</span>{d.status === "new" && <span className="faint"> · first snapshot</span>}</>
                      ) : r.createNew ? (
                        <><Badge tone="warn">create new · {r.bucket}</Badge> <ResolveInvestment batchId={batchId} index={i} sourceName={row.name} hasExternalId={!!row.externalId} investments={investments.filter((x) => !r.fundId || x.fundId === r.fundId)} suggestion={r.suggestion} canCreate={!!r.fundId} clearOnly /></>
                      ) : (
                        <ResolveInvestment batchId={batchId} index={i} sourceName={row.name} hasExternalId={!!row.externalId} investments={investments.filter((x) => !r.fundId || x.fundId === r.fundId)} suggestion={r.suggestion} canCreate={!!r.fundId} />
                      )}
                    </td>
                    <td className="num"><Fig value={row.fields.cost} fmt={fmtMoney} missing="blank" /></td>
                    <td className="num"><Fig value={row.fields.contributions} fmt={fmtMoney} missing="blank" /></td>
                    <td className="num"><Fig value={row.fields.distributions} fmt={fmtMoney} missing="blank" /></td>
                    <td className="num muted"><Fig value={d.navPrior} fmt={fmtMoney} missing={d.status === "existing" ? "blank in prior import" : "no prior snapshot"} /></td>
                    <td className="num"><Fig value={row.fields.nav} fmt={fmtMoney} missing="blank" /></td>
                    <td className={`num ${d.flagged ? "text-neg font-medium" : "muted"}`}><Fig value={d.navChangePct} fmt={fmtPct} missing="n/a" /></td>
                    <td className="faint">{row.missingFields.length ? row.missingFields.map(fieldLabel).join(", ") : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <ReconciliationTable variances={variances} />

      <CommitBar batchId={batchId} mode="pending" unresolved={resolved.unresolvedCount} blocked={!!alreadyCommitted} flagged={variances.filter((v) => v.flagged).length} />
    </div>
  );
}

function ReconciliationTable({ variances }: { variances: FundReconciliation[] }) {
  return (
    <section className="card">
      <div className="card-h"><h2>Reconciliation: Σ investment rows vs fund rows</h2><span className="muted">variance = fund − Σ investments; flagged above $1 · recorded on the batch</span></div>
      <div className="tbl-wrap border-0 rounded-none">
        <table className="tbl compact">
          <thead><tr><th>Fund (workbook)</th><th className="num">Inv. rows</th>{["cost", "contributions", "distributions", "nav"].map((f) => <th key={f} colSpan={3} className="text-center border-l border-line">{fieldLabel(f)}</th>)}</tr></thead>
          <tbody>
            {variances.map((v) => (
              <tr key={v.fundKey} className={v.flagged ? "bg-neg-soft" : ""}>
                <td className="font-medium">{v.fundName}{v.orphan === "no-fund-row" && <span className="text-neg ml-2">no fund row</span>}{v.orphan === "no-investments" && <span className="text-warn ml-2">no investment rows</span>}</td>
                <td className="num">{v.investmentCount}</td>
                {v.fields.map((f) => (
                  <>
                    <td key={`${f.field}f`} className="num border-l border-line-2"><Fig value={f.fundValue} fmt={fmtMoneyM} missing="fund row blank" /></td>
                    <td key={`${f.field}s`} className="num"><Fig value={f.investmentSum} fmt={fmtMoneyM} missing={f.missing ? `${f.missing} row(s) blank — no partial sum` : "no rows"} /></td>
                    <td key={`${f.field}v`} className={`num ${f.flagged ? "text-neg font-medium" : "faint"}`}><Fig value={f.variance} fmt={fmtMoney} missing="n/a" /></td>
                  </>
                ))}
              </tr>
            ))}
            {variances.length === 0 && <tr><td colSpan={14} className="muted text-center py-4">No fund rows.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-1.5 faint">Columns per field: fund row · Σ investments · variance.</div>
    </section>
  );
}
