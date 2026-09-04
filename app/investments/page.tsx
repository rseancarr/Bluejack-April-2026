import Link from "next/link";
import { prisma } from "@/lib/db";
import { BUCKETS } from "@/lib/constants";
import { fmtDate, fmtMoneyM, fmtMultiple } from "@/lib/format";
import { latestBatches, latestInvestmentSnapshots, missingReason } from "@/lib/queries/snapshots";
import { Fig } from "@/components/ui/Fig";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/Badge";
import { FilterBar } from "@/components/FilterBar";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage({ searchParams }: { searchParams: Promise<{ fund?: string; bucket?: string; status?: string }> }) {
  const sp = await searchParams;
  const [funds, latest] = await Promise.all([prisma.fund.findMany({ orderBy: { vintage: "asc" } }), latestBatches()]);
  const batch = latest.global;
  const investments = await prisma.investment.findMany({
    where: {
      fundId: sp.fund || undefined,
      bucket: sp.bucket || undefined,
      status: sp.status || undefined,
    },
    include: {
      fund: { select: { id: true, name: true } },
      documents: { where: { type: "quarterly_report" }, orderBy: { date: "desc" }, take: 1 },
    },
    orderBy: [{ fund: { vintage: "asc" } }, { name: "asc" }],
  });
  const snaps = await latestInvestmentSnapshots(latest);

  return (
    <div>
      <PageHeader title="Investments" subtitle={batch ? `Latest import as of ${fmtDate(batch.asOfDate)} · each fund shows its own as-of` : "No accounting import committed yet."}>
        <span className="muted">{investments.length} shown</span>
      </PageHeader>
      <FilterBar
        basePath="/investments"
        current={sp}
        filters={[
          { key: "fund", label: "Fund", options: funds.map((f) => ({ value: f.id, label: f.name })) },
          { key: "bucket", label: "Bucket", options: BUCKETS.map((b) => ({ value: b, label: b })) },
          { key: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "realized", label: "Realized" }] },
        ]}
      />
      <div className="tbl-wrap mt-3">
        <table className="tbl tbl-cards">
          <thead>
            <tr>
              <th>Name</th>
              <th>Fund</th>
              <th>Bucket</th>
              <th>Sector</th>
              <th className="num">Cost</th>
              <th className="num">Mark (NAV)</th>
              <th className="num">MOIC (rep.)</th>
              <th>Status</th>
              <th>As of</th>
              <th>Valued</th>
              <th>Last report</th>
            </tr>
          </thead>
          <tbody>
            {investments.map((i) => {
              const s = snaps.get(i.id);
              const batch = latest.byFund.get(i.fund.id) ?? null;
              return (
                <tr key={i.id}>
                  <td className="card-title"><Link href={`/investments/${i.id}`} className="link font-medium">{i.name}</Link></td>
                  <td data-label="Fund"><Link href={`/funds/${i.fund.id}`} className="hover:underline">{i.fund.name}</Link></td>
                  <td data-label="Bucket">{i.bucket}</td>
                  <td className="muted card-hide">{i.sector ?? "—"}</td>
                  <td className="num" data-label="Cost"><Fig value={s?.cost} fmt={fmtMoneyM} missing={missingReason(s, "Cost", batch)} /></td>
                  <td className="num" data-label="Mark (NAV)"><Fig value={s?.nav} fmt={fmtMoneyM} missing={missingReason(s, "NAV", batch)} /></td>
                  <td className="num" data-label="MOIC (rep.)"><Fig value={s?.moic} fmt={fmtMultiple} missing={missingReason(s, "MOIC", batch)} /></td>
                  <td data-label="Status"><StatusBadge status={i.status} /></td>
                  <td className="whitespace-nowrap" data-label="As of">{s ? fmtDate(s.asOfDate) : <span className="missing" title={missingReason(s, "", batch)}>—</span>}</td>
                  <td className="whitespace-nowrap card-hide muted">{s?.holdingStatus ?? (s?.valuationDate ? fmtDate(s.valuationDate) : "—")}</td>
                  <td className="whitespace-nowrap card-hide">{i.documents[0] ? fmtDate(i.documents[0].date) : <span className="faint" title="No quarterly report uploaded">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
