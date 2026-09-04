import { fmtMoney, fmtMultiple, fmtRatioPct } from "@/lib/format";
import type { FundReconciliation } from "@/lib/import/reconcile";
import { Fig } from "@/components/ui/Fig";

/** Internal-consistency checks of the workbook, as computed at preview / recorded at commit. */
export function ReconciliationPanel({ variances }: { variances: FundReconciliation[] }) {
  const rec = variances[0];
  if (!rec) return null;
  return (
    <section className="card">
      <div className="card-h"><h2>Reconciliation</h2><span className="muted">each check reproduces arithmetic the workbook itself performs · flagged above $1 · recorded on the batch</span></div>
      <div className="tbl-wrap border-0 rounded-none">
        <table className="tbl compact">
          <thead><tr><th>Check</th><th className="num">Left</th><th className="num">Right</th><th className="num">Variance</th><th>Result</th></tr></thead>
          <tbody>
            {rec.checks.map((c) => (
              <tr key={c.key} className={c.flagged ? "bg-neg-soft" : ""}>
                <td><div className="font-medium">{c.label}</div><div className="faint">{c.leftLabel} vs {c.rightLabel}{c.note ? ` · ${c.note}` : ""}</div></td>
                <td className="num"><Fig value={c.left} fmt={fmtMoney} missing="not available" /></td>
                <td className="num"><Fig value={c.right} fmt={fmtMoney} missing="not available" /></td>
                <td className={`num ${c.flagged ? "text-neg font-medium" : "muted"}`}><Fig value={c.variance} fmt={fmtMoney} missing="n/a" /></td>
                <td>{c.kind === "info" ? <span className="muted">information</span> : c.variance === null ? <span className="faint">not checkable</span> : c.flagged ? <span className="text-neg">mismatch</span> : <span className="text-pos">ok</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-h border-t border-line-2"><h3>Reported MOIC vs cash flows</h3><span className="faint">(distributions + NAV) ÷ contributions from IRR Detail, vs the dashboard MOIC · flagged above 0.5%</span></div>
      <div className="tbl-wrap border-0 rounded-none">
        <table className="tbl compact">
          <thead><tr><th>Holding</th><th className="num">Reported</th><th className="num">From cash flows</th><th className="num">Diff</th><th>Result</th></tr></thead>
          <tbody>
            {rec.holdingChecks.map((h) => (
              <tr key={h.name} className={h.flagged ? "bg-neg-soft" : ""}>
                <td>{h.name}{h.note && <span className="faint ml-2">{h.note}</span>}</td>
                <td className="num"><Fig value={h.reportedMoic} fmt={fmtMultiple} missing="blank" /></td>
                <td className="num"><Fig value={h.computedMoic} fmt={fmtMultiple} missing="n/a" /></td>
                <td className={`num ${h.flagged ? "text-neg font-medium" : "muted"}`}><Fig value={h.variancePct} fmt={fmtRatioPct} missing="n/a" /></td>
                <td>{h.computedMoic === null ? <span className="faint">not checkable</span> : h.flagged ? <span className="text-neg">mismatch</span> : <span className="text-pos">ok</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
