import Link from "next/link";
import { prisma } from "@/lib/db";
import { BUCKETS } from "@/lib/constants";
import { fmtDate, fmtMoneyM, fmtMultiple } from "@/lib/format";
import { latestBatch, latestInvestmentSnapshots, missingReason } from "@/lib/queries/snapshots";
import { Fig } from "@/components/ui/Fig";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/Badge";
import { FilterBar } from "@/components/FilterBar";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage({ searchParams }: { searchParams: Promise<{ fund?: string; bucket?: string; status?: string }> }) {
  const sp = await searchParams;
  const [funds, batch] = await Promise.all([prisma.fund.findMany({ orderBy: { vintage: "asc" } }), latestBatch()]);
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
  const snaps = await latestInvestmentSnapshots(batch);

  return (
    <div>
      <PageHeader title="Investments" subtitle={batch ? `Financials as of ${fmtDate(batch.asOfDate)} · ${batch.fileName}` : "No accounting import committed yet."}>
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
        <table className="tbl">
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
              <th>Last report</th>
            </tr>
          </thead>
          <tbody>
            {investments.map((i) => {
              const s = snaps.get(i.id);
              return (
                <tr key={i.id}>
                  <td><Link href={`/investments/${i.id}`} className="link font-medium">{i.name}</Link></td>
                  <td><Link href={`/funds/${i.fund.id}`} className="hover:underline">{i.fund.name}</Link></td>
                  <td>{i.bucket}</td>
                  <td className="muted">{i.sector ?? "—"}</td>
                  <td className="num"><Fig value={s?.cost} fmt={fmtMoneyM} missing={missingReason(s, "Cost", batch)} /></td>
                  <td className="num"><Fig value={s?.nav} fmt={fmtMoneyM} missing={missingReason(s, "NAV", batch)} /></td>
                  <td className="num"><Fig value={s?.moic} fmt={fmtMultiple} missing={missingReason(s, "MOIC", batch)} /></td>
                  <td><StatusBadge status={i.status} /></td>
                  <td className="whitespace-nowrap">{s ? fmtDate(s.asOfDate) : <span className="missing" title={missingReason(s, "", batch)}>—</span>}</td>
                  <td className="whitespace-nowrap">{i.documents[0] ? fmtDate(i.documents[0].date) : <span className="faint" title="No quarterly report uploaded">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
