import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { fmtDate, fmtMoneyM, fmtMultiple } from "@/lib/format";
import { dpi, uncalled } from "@/lib/metrics/returns";
import { samePeriod, sourcedCount } from "@/lib/metrics/funnel";
import { latestBatch, latestFundSnapshots, missingReason } from "@/lib/queries/snapshots";
import { actionItemInclude, openItemsFor, sortByUrgency, startOfDay } from "@/lib/queries/actionItems";
import { ItemsTable } from "@/components/actionItems/ItemsTable";
import { Fig } from "@/components/ui/Fig";
import { Kpi } from "@/components/ui/Kpi";
import { QuickAdd } from "@/components/actionItems/QuickAdd";
import { linkOptions } from "@/lib/queries/actionItems";
import { teamMembers } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function Home() {
  const me = await currentUser();
  const now = new Date();
  const today = startOfDay(now);
  const weekEnd = new Date(today.getTime() + 7 * 86_400_000);
  const year = now.getUTCFullYear();

  const [mine, dueThisWeek, deals, funds, batch, options] = await Promise.all([
    openItemsFor(me),
    prisma.actionItem.findMany({ where: { status: "open", dueDate: { gte: today, lt: weekEnd } }, include: actionItemInclude }),
    prisma.deal.findMany({ select: { id: true, estSize: true, sourceType: true, dateSourced: true } }),
    prisma.fund.findMany({ orderBy: { vintage: "asc" } }),
    latestBatch(),
    linkOptions(),
  ]);
  const fundSnaps = await latestFundSnapshots(batch);
  const ytd = sourcedCount(deals, samePeriod(year, now));
  const lastYtd = sourcedCount(deals, samePeriod(year - 1, now));
  const overdue = mine.filter((i) => i.dueDate && i.dueDate < today).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        <Kpi label="My open items" value={mine.length} sub={overdue ? <span className="overdue">{overdue} overdue</span> : "none overdue"} />
        <Kpi label="Due this week (team)" value={dueThisWeek.length} sub={`through ${fmtDate(weekEnd)}`} />
        <Kpi label={`Deals sourced YTD ${year}`} value={ytd} sub={`vs ${lastYtd} same period ${year - 1}`} />
        <Kpi label="Latest accounting import" value={batch ? fmtDate(batch.asOfDate) : "—"} sub={batch ? batch.fileName : "none committed"} />
      </div>

      <section className="card">
        <div className="card-h">
          <h2>Funds</h2>
          <span className="muted">{batch ? `as of ${fmtDate(batch.asOfDate)}` : "no import yet"}</span>
        </div>
        <div className="tbl-wrap border-0 rounded-none">
          <table className="tbl compact tbl-cards">
            <thead>
              <tr>
                <th>Fund</th>
                <th>Vintage</th>
                <th className="num">Committed</th>
                <th className="num">Called</th>
                <th className="num">Uncalled</th>
                <th className="num">NAV</th>
                <th className="num">DPI</th>
                <th>As of</th>
              </tr>
            </thead>
            <tbody>
              {funds.map((f) => {
                const s = fundSnaps.get(f.id);
                return (
                  <tr key={f.id}>
                    <td className="card-title"><Link href={`/funds/${f.id}`} className="link">{f.name}</Link></td>
                    <td className="tnum card-hide">{f.vintage}</td>
                    <td className="num" data-label="Committed"><Fig value={f.committedCapital} fmt={fmtMoneyM} missing="Committed capital not set on the fund." /></td>
                    <td className="num" data-label="Called"><Fig value={s?.contributions} fmt={fmtMoneyM} missing={missingReason(s, "Contributions", batch)} /></td>
                    <td className="num" data-label="Uncalled"><Fig value={uncalled(f.committedCapital, s?.contributions)} fmt={fmtMoneyM} missing="Needs committed capital and contributions from the latest import." /></td>
                    <td className="num" data-label="NAV"><Fig value={s?.nav} fmt={fmtMoneyM} missing={missingReason(s, "NAV", batch)} /></td>
                    <td className="num" data-label="DPI"><Fig value={dpi(s?.distributions, s?.contributions)} fmt={fmtMultiple} missing="Needs distributions and contributions from the latest import." /></td>
                    <td className="whitespace-nowrap" data-label="As of">{s ? fmtDate(s.asOfDate) : <span className="missing" title={missingReason(s, "", batch)}>—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2>My open items</h2>
            <Link href="/action-items" className="link muted">all items</Link>
          </div>
          <QuickAdd options={options} members={teamMembers()} defaultOwner={me} />
          <ItemsTable items={mine} showOwner={false} emptyText="No open items assigned to you." />
        </section>
        <section className="space-y-2">
          <h2>Due this week (everyone)</h2>
          <ItemsTable items={sortByUrgency(dueThisWeek)} emptyText="Nothing due this week." />
        </section>
      </div>
    </div>
  );
}
