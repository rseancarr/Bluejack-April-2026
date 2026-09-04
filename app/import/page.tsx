import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { UploadForm } from "./UploadForm";
import type { FundReconciliation } from "@/lib/import/reconcile";
import { SHEETS, FUND_COLUMNS, INVESTMENT_COLUMNS, FUND_REQUIRED, INVESTMENT_REQUIRED } from "@/lib/import/schema";

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
          <div className="card-h"><h2>Expected layout</h2><span className="badge badge-warn">provisional</span></div>
          <div className="card-b text-[12px] space-y-2">
            <p>Sheet <b>{SHEETS.funds}</b>: {Object.entries(FUND_COLUMNS).map(([k, v]) => <span key={k} className={(FUND_REQUIRED as readonly string[]).includes(k) ? "font-medium" : "muted"}>{v}{", "}</span>)}</p>
            <p>Sheet <b>{SHEETS.investments}</b>: {Object.entries(INVESTMENT_COLUMNS).map(([k, v]) => <span key={k} className={(INVESTMENT_REQUIRED as readonly string[]).includes(k) ? "font-medium" : "muted"}>{v}{", "}</span>)}</p>
            <p className="faint">Bold = required. Header in row 1, one row per fund / investment, no total rows, same As Of Date everywhere. Extra columns are kept verbatim. Anything else aborts the import with a list of what was wrong. Layout is defined in <code className="mono">lib/import/schema.ts</code> and must be confirmed against accounting's real file.</p>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-h"><h2>Import log</h2><span className="muted">{batches.length} uploads</span></div>
        <div className="tbl-wrap border-0 rounded-none">
          <table className="tbl compact">
            <thead><tr><th>Uploaded</th><th>File</th><th>As of</th><th>Status</th><th className="num">Rows</th><th>By</th><th>Reconciliation</th><th></th></tr></thead>
            <tbody>
              {batches.map((b) => {
                const variances = b.varianceJson ? (JSON.parse(b.varianceJson) as FundReconciliation[]) : null;
                const flagged = variances?.filter((v) => v.flagged).length ?? 0;
                return (
                  <tr key={b.id}>
                    <td className="whitespace-nowrap">{fmtDate(b.uploadedAt)}</td>
                    <td><Link href={`/import/${b.id}`} className="link">{b.fileName}</Link></td>
                    <td className="whitespace-nowrap">{fmtDate(b.asOfDate)}</td>
                    <td><Badge tone={tone(b.status)}>{b.status}</Badge></td>
                    <td className="num">{b.status === "committed" ? b._count.snapshots : b.rowCount ?? "—"}</td>
                    <td>{b.uploadedBy ?? "—"}</td>
                    <td>{variances ? (flagged ? <span className="text-neg">{flagged} fund(s) with variance</span> : <span className="text-pos">clean</span>) : b.errorMessage ? <span className="text-neg truncate block max-w-[360px]" title={b.errorMessage}>{b.errorMessage.split("\n")[0]}</span> : "—"}</td>
                    <td className="text-right"><Link href={`/import/${b.id}`} className="btn btn-ghost btn-sm">{b.status === "pending" ? "Review" : "Open"}</Link></td>
                  </tr>
                );
              })}
              {batches.length === 0 && <tr><td colSpan={8} className="muted text-center py-6">No imports yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
