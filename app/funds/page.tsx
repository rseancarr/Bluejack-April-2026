import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmtDate, fmtMoneyM, fmtMultiple, fmtPct, fmtRatioPct } from "@/lib/format";
import { dpi, tvpi, uncalled } from "@/lib/metrics/returns";
import { latestBatch, latestFundSnapshots, missingReason } from "@/lib/queries/snapshots";
import { IRR_SCALE } from "@/lib/import/schema";
import { Fig } from "@/components/ui/Fig";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function FundsPage() {
  const [funds, batch] = await Promise.all([
    prisma.fund.findMany({ orderBy: { vintage: "asc" }, include: { _count: { select: { investments: true } } } }),
    latestBatch(),
  ]);
  const snaps = await latestFundSnapshots(batch);
  const irrFmt = IRR_SCALE === "fraction" ? fmtRatioPct : fmtPct;
  return (
    <div>
      <PageHeader title="Funds" subtitle={batch ? `Financials as of ${fmtDate(batch.asOfDate)} · ${batch.fileName}` : "No accounting import committed yet."} />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Fund</th>
              <th>Vintage</th>
              <th>Status</th>
              <th className="num">Investments</th>
              <th className="num">Committed</th>
              <th className="num">Called</th>
              <th className="num">Uncalled</th>
              <th className="num">Distributions</th>
              <th className="num">NAV</th>
              <th className="num">DPI</th>
              <th className="num">TVPI</th>
              <th className="num">IRR (rep.)</th>
              <th className="num">MOIC (rep.)</th>
            </tr>
          </thead>
          <tbody>
            {funds.map((f) => {
              const s = snaps.get(f.id);
              return (
                <tr key={f.id}>
                  <td><Link href={`/funds/${f.id}`} className="link font-medium">{f.name}</Link></td>
                  <td className="tnum">{f.vintage}</td>
                  <td><StatusBadge status={f.status} /></td>
                  <td className="num">{f._count.investments}</td>
                  <td className="num"><Fig value={f.committedCapital} fmt={fmtMoneyM} missing="Committed capital not set." /></td>
                  <td className="num"><Fig value={s?.contributions} fmt={fmtMoneyM} missing={missingReason(s, "Contributions", batch)} /></td>
                  <td className="num"><Fig value={uncalled(f.committedCapital, s?.contributions)} fmt={fmtMoneyM} missing="Needs committed capital and imported contributions." /></td>
                  <td className="num"><Fig value={s?.distributions} fmt={fmtMoneyM} missing={missingReason(s, "Distributions", batch)} /></td>
                  <td className="num"><Fig value={s?.nav} fmt={fmtMoneyM} missing={missingReason(s, "NAV", batch)} /></td>
                  <td className="num"><Fig value={dpi(s?.distributions, s?.contributions)} fmt={fmtMultiple} missing="Computed: distributions ÷ contributions. An input is missing." /></td>
                  <td className="num"><Fig value={tvpi(s?.distributions, s?.nav, s?.contributions)} fmt={fmtMultiple} missing="Computed: (distributions + NAV) ÷ contributions. An input is missing." /></td>
                  <td className="num"><Fig value={s?.irr} fmt={irrFmt} missing={missingReason(s, "IRR", batch)} /></td>
                  <td className="num"><Fig value={s?.moic} fmt={fmtMultiple} missing={missingReason(s, "MOIC", batch)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
