import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmtDate, fmtMoneyM, fmtMultiple, fmtPct, fmtRatioPct } from "@/lib/format";
import { dpi, tvpi, uncalled } from "@/lib/metrics/returns";
import { latestBatches, latestFundSnapshots, missingReason } from "@/lib/queries/snapshots";
import { IRR_SCALE } from "@/lib/import/schema";
import { Fig } from "@/components/ui/Fig";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function FundsPage() {
  const [funds, latest] = await Promise.all([
    prisma.fund.findMany({ orderBy: { vintage: "asc" }, include: { _count: { select: { investments: true } } } }),
    latestBatches(),
  ]);
  const batch = latest.global;
  const snaps = await latestFundSnapshots(latest);
  const irrFmt = IRR_SCALE === "fraction" ? fmtRatioPct : fmtPct;
  return (
    <div>
      <PageHeader title="Funds" subtitle={batch ? `Financials as of ${fmtDate(batch.asOfDate)} (latest import date; each fund shows its own as-of below)` : "No accounting import committed yet."} />
      <div className="tbl-wrap">
        <table className="tbl tbl-cards">
          <thead>
            <tr>
              <th>Fund</th>
              <th>Vintage</th>
              <th>Status</th>
              <th className="num">Investments</th>
              <th className="num">Commitments</th>
              <th className="num">Called</th>
              <th className="num">Uncalled</th>
              <th className="num">Distributions</th>
              <th className="num">NAV</th>
              <th className="num">DPI</th>
              <th className="num">TVPI</th>
              <th className="num">Net IRR</th>
              <th className="num">Net MOIC</th>
              <th className="num">Gross IRR</th>
              <th>As of</th>
            </tr>
          </thead>
          <tbody>
            {funds.map((f) => {
              const s = snaps.get(f.id);
              const batch = latest.byFund.get(f.id) ?? null;
              return (
                <tr key={f.id}>
                  <td className="card-title"><Link href={`/funds/${f.id}`} className="link font-medium">{f.name}</Link></td>
                  <td className="tnum" data-label="Vintage">{f.vintage}</td>
                  <td data-label="Status"><StatusBadge status={f.status} /></td>
                  <td className="num" data-label="Investments">{f._count.investments}</td>
                  <td className="num" data-label="Commitments"><Fig value={s?.commitments} fmt={fmtMoneyM} missing={missingReason(s, "Total Commitments", batch)} /></td>
                  <td className="num" data-label="Called"><Fig value={s?.contributions} fmt={fmtMoneyM} missing={missingReason(s, "Called Capital", batch)} /></td>
                  <td className="num" data-label="Uncalled"><Fig value={uncalled(s?.commitments, s?.contributions)} fmt={fmtMoneyM} missing="Needs commitments and called capital from the latest import." /></td>
                  <td className="num" data-label="Distributions"><Fig value={s?.distributions} fmt={fmtMoneyM} missing={missingReason(s, "Distributions", batch)} /></td>
                  <td className="num" data-label="NAV"><Fig value={s?.nav} fmt={fmtMoneyM} missing={missingReason(s, "NAV", batch)} /></td>
                  <td className="num" data-label="DPI"><Fig value={dpi(s?.distributions, s?.contributions)} fmt={fmtMultiple} missing="Computed: distributions ÷ contributions. An input is missing." /></td>
                  <td className="num" data-label="TVPI"><Fig value={tvpi(s?.distributions, s?.nav, s?.contributions)} fmt={fmtMultiple} missing="Computed: (distributions + NAV) ÷ contributions. An input is missing." /></td>
                  <td className="num" data-label="Net IRR"><Fig value={s?.irrNet} fmt={irrFmt} missing={missingReason(s, "Fund Net IRR", batch)} /></td>
                  <td className="num" data-label="Net MOIC"><Fig value={s?.moicNet} fmt={fmtMultiple} missing={missingReason(s, "Fund Net MOIC", batch)} /></td>
                  <td className="num" data-label="Gross IRR"><Fig value={s?.irrGross} fmt={irrFmt} missing={missingReason(s, "Fund Gross IRR", batch)} /></td>
                  <td className="whitespace-nowrap" data-label="As of">{s ? fmtDate(s.asOfDate) : <span className="missing" title={missingReason(s, "", batch)}>—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
