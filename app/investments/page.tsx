import { prisma } from "@/lib/db";
import { BUCKETS } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { sumStrict } from "@/lib/metrics/returns";
import { latestBatches, latestInvestmentSnapshots, latestFundSnapshots, missingReason } from "@/lib/queries/snapshots";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/FilterBar";
import { GroupedInvestmentsTable, type FundGroup } from "@/components/investments/GroupedTable";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage({ searchParams }: { searchParams: Promise<{ fund?: string; bucket?: string; status?: string }> }) {
  const sp = await searchParams;
  const [funds, latest] = await Promise.all([prisma.fund.findMany({ orderBy: { vintage: "asc" } }), latestBatches()]);
  const batch = latest.global;
  const investments = await prisma.investment.findMany({
    where: { fundId: sp.fund || undefined, bucket: sp.bucket || undefined, status: sp.status || undefined },
    include: { fund: { select: { id: true } }, documents: { where: { type: "quarterly_report" }, orderBy: { date: "desc" }, take: 1 } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  const [snaps, fundSnaps] = await Promise.all([latestInvestmentSnapshots(latest), latestFundSnapshots(latest)]);

  const groups: FundGroup[] = funds
    .map((f) => {
      const fb = latest.byFund.get(f.id) ?? null;
      const rows = investments
        .filter((i) => i.fund.id === f.id)
        .map((i) => {
          const s = snaps.get(i.id);
          return {
            id: i.id,
            name: i.name,
            bucket: i.bucket,
            assetClass: i.assetClass,
            sector: i.sector,
            status: i.status,
            cost: s?.cost ?? null,
            nav: s?.nav ?? null,
            irr: s?.irr ?? null,
            moic: s?.moic ?? null,
            asOf: s ? fmtDate(s.asOfDate) : null,
            valued: s?.holdingStatus ?? (s?.valuationDate ? fmtDate(s.valuationDate) : null),
            lastReport: i.documents[0] ? fmtDate(i.documents[0].date) : null,
            missing: {
              cost: missingReason(s, "Cost", fb),
              nav: missingReason(s, "NAV", fb),
              irr: missingReason(s, "IRR", fb),
              moic: missingReason(s, "MOIC", fb),
              asOf: missingReason(s, "", fb),
            },
          };
        });
      const active = rows.filter((r) => r.status === "active");
      const cost = sumStrict(active.map((r) => r.cost));
      const nav = sumStrict(active.map((r) => r.nav));
      const fs = fundSnaps.get(f.id);
      return {
        id: f.id,
        name: f.name,
        vintage: f.vintage,
        status: f.status,
        asOf: fs ? fmtDate(fs.asOfDate) : null,
        rows,
        cost: { sum: cost.sum, note: active.length ? `${cost.missing} active holding(s) have no cost in the latest import — no partial sum.` : "No active holdings." },
        nav: { sum: nav.sum, note: active.length ? `${nav.missing} active holding(s) have no NAV in the latest import — no partial sum.` : "No active holdings." },
      };
    })
    .filter((g) => g.rows.length > 0 || !sp.bucket && !sp.status && !sp.fund);

  return (
    <div>
      <PageHeader title="Investments" subtitle={batch ? `Latest import as of ${fmtDate(batch.asOfDate)} · each fund shows its own as-of · grouped by fund` : "No accounting import committed yet."}>
        <span className="muted">{investments.length} holdings</span>
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
      <div className="mt-3">
        <GroupedInvestmentsTable groups={groups} />
      </div>
    </div>
  );
}
