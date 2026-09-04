import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { UploadForm } from "./UploadForm";
import type { FundReconciliation } from "@/lib/import/reconcile";
import { SHEETS, DASHBOARD, MTM } from "@/lib/import/schema";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const batches = await prisma.importBatch.findMany({ orderBy: { uploadedAt: "desc" }, include: { _count: { select: { snapshots: true } } } });
  const tone = (s: string) => (s === "committed" ? "pos" : s === "failed" ? "neg" : s === "pending" ? "warn" : "");
  return (
    <div className="space-y-6">
      <PageHeader title="Monthly accounting import" subtitle="Upload accounting's workbook, review the preview and reconciliation, then commit it as a new snapshot batch.">
        <Link href="/import/mappings" className="btn btn-secondary">Name mappings</Link>
      </PageHeader>

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="card lg:col-span-2">
          <div className="card-h"><h2>Upload workbook</h2></div>
          <div className="card-b"><UploadForm /></div>
        </section>
        <section className="card">
          <div className="card-h"><h2>What the workbook must contain</h2><span className="badge badge-pos">matches accounting's file</span></div>
          <div className="card-b text-[12px] space-y-2">
            <p>One fund per workbook, .xlsx or .xlsm (e.g. <span className="mono">20260731_FAPIV_TB_Analysis.xlsm</span>). Three tabs are read:</p>
            <p><b>{SHEETS.dashboard}</b> — fund name in B2; the <i>{DASHBOARD.returnBasisHeader}</i> table (Fund Gross / Fund Net / Total Fund × IRR, MOIC); the <i>{DASHBOARD.measureHeader}</i> table (Total Commitments, Called Capital, Distributions, Redemptions, Remaining NAV, Total Value × Non-Affiliate, Affiliate, GP Carry, Fund Total); the <i>{DASHBOARD.holdingHeader}</i> table (Valuation Date, NAV, IRR, MOIC, ending at the Total row); the <i>{DASHBOARD.asOfLabel}</i> row.</p>
            <p><b>{SHEETS.mtm}</b> — {MTM.columns.cost} and {MTM.columns.type} per holding, plus the Total row.</p>
            <p><b>{SHEETS.irrDetail}</b> — cash-flow columns per holding down to the Current Value row. Contributions = negative flows, distributions = positive flows.</p>
            <p><b>Wind-down funds</b> (no Dashboard tab, e.g. FAP III): fund figures from <b>TB Recalc</b>, holdings from <b>MTM</b> and <b>IRR</b>. Commitments, gross/net returns and exposure are not in those files and stay blank.</p>
            <p className="faint">Cells are found by their labels, so rows may move but labels must not be renamed. Blank cells are stored as blank. Anything unexpected aborts the upload with a list of what was wrong (nothing is written). Layout reference: <code className="mono">lib/import/schema.ts</code>.</p>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-h"><h2>Import log</h2><span className="muted">{batches.length} uploads</span></div>
        <div className="tbl-wrap border-0 rounded-none">
          <table className="tbl compact">
            <thead><tr><th>Uploaded</th><th>File</th><th>Fund</th><th>As of</th><th>Status</th><th className="num">Rows</th><th>By</th><th>Reconciliation</th><th></th></tr></thead>
            <tbody>
              {batches.map((b) => {
                const variances = b.varianceJson ? (JSON.parse(b.varianceJson) as FundReconciliation[]) : null;
                const flagged = variances?.reduce((a, v) => a + v.checks.filter((c) => c.flagged).length + v.holdingChecks.filter((h) => h.flagged).length, 0) ?? 0;
                return (
                  <tr key={b.id}>
                    <td className="whitespace-nowrap">{fmtDate(b.uploadedAt)}</td>
                    <td><Link href={`/import/${b.id}`} className="link">{b.fileName}</Link></td>
                    <td className="muted">{b.fundName ?? "—"}</td>
                    <td className="whitespace-nowrap">{fmtDate(b.asOfDate)}</td>
                    <td><Badge tone={tone(b.status)}>{b.status}</Badge></td>
                    <td className="num">{b.status === "committed" ? b._count.snapshots : b.rowCount ?? "—"}</td>
                    <td>{b.uploadedBy ?? "—"}</td>
                    <td>{variances ? (flagged ? <span className="text-neg">{flagged} check(s) flagged</span> : <span className="text-pos">clean</span>) : b.errorMessage ? <span className="text-neg truncate block max-w-[360px]" title={b.errorMessage}>{b.errorMessage.split("\n")[0]}</span> : "—"}</td>
                    <td className="text-right"><Link href={`/import/${b.id}`} className="btn btn-ghost btn-sm">{b.status === "pending" ? "Review" : "Open"}</Link></td>
                  </tr>
                );
              })}
              {batches.length === 0 && <tr><td colSpan={9} className="muted text-center py-6">No imports yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
