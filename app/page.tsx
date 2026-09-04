import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { fmtDate, fmtMoneyM, fmtMultiple, fmtRatioPct } from "@/lib/format";
import { dpi, sumAvailable, uncalled } from "@/lib/metrics/returns";
import { samePeriod, sourcedCount } from "@/lib/metrics/funnel";
import { latestBatches, latestFundSnapshots, missingReason } from "@/lib/queries/snapshots";
import { actionItemInclude, openItemsFor, sortByUrgency, startOfDay } from "@/lib/queries/actionItems";
import { aggregateExposure, fundExposure } from "@/lib/queries/exposure";
import { ItemsTable } from "@/components/actionItems/ItemsTable";
import { Fig } from "@/components/ui/Fig";
import { Kpi } from "@/components/ui/Kpi";
import { QuickAdd } from "@/components/actionItems/QuickAdd";
import { ExposureLegend, ExposurePie } from "@/components/charts/ExposurePie";
import { linkOptions } from "@/lib/queries/actionItems";
import { teamMembers } from "@/lib/constants";
import { StatusBadge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function Home() {
  const me = await currentUser();
  const now = new Date();
  const today = startOfDay(now);
  const weekEnd = new Date(today.getTime() + 7 * 86_400_000);
  const year = now.getUTCFullYear();

  const [mine, dueThisWeek, deals, funds, latest, options] = await Promise.all([
    openItemsFor(me),
    prisma.actionItem.findMany({ where: { status: "open", dueDate: { gte: today, lt: weekEnd } }, include: actionItemInclude }),
    prisma.deal.findMany({ select: { id: true, estSize: true, sourceType: true, dateSourced: true } }),
    prisma.fund.findMany({ orderBy: { vintage: "asc" }, include: { _count: { select: { investments: true } } } }),
    latestBatches(),
    linkOptions(),
  ]);
  const batch = latest.global;
  const fundSnaps = await latestFundSnapshots(latest);
  const ytd = sourcedCount(deals, samePeriod(year, now));
  const lastYtd = sourcedCount(deals, samePeriod(year - 1, now));
  const overdue = mine.filter((i) => i.dueDate && i.dueDate < today).length;

  // Totals across funds: sum of the funds that report the figure, always labelled with how many did.
  const rows = funds.map((f) => {
    const s = fundSnaps.get(f.id);
    const classes = s?.classJson ? (JSON.parse(s.classJson) as Record<"gpCarry", Record<"totalValue" | "distributions" | "nav", number | null>>) : null;
    return { f, s, fb: latest.byFund.get(f.id) ?? null, gpCarry: classes?.gpCarry ?? null };
  });
  const totals = {
    commitments: sumAvailable(rows.map((r) => r.s?.commitments)),
    called: sumAvailable(rows.map((r) => r.s?.contributions)),
    distributions: sumAvailable(rows.map((r) => r.s?.distributions)),
    nav: sumAvailable(rows.map((r) => r.s?.nav)),
    gpCarry: sumAvailable(rows.map((r) => r.gpCarry?.totalValue)),
  };
  const whoMissing = (pick: (r: (typeof rows)[number]) => number | null | undefined) => rows.filter((r) => pick(r) === null || pick(r) === undefined).map((r) => r.f.name.replace("Freestone ", ""));
  const Cnt = ({ k, pick }: { k: keyof typeof totals; pick: (r: (typeof rows)[number]) => number | null | undefined }) =>
    totals[k].missing ? <span className="faint block text-[10.5px]" title={`Not reported by: ${whoMissing(pick).join(", ")}`}>{totals[k].count - totals[k].missing} of {totals[k].count} funds</span> : null;
  // Ratios and AUM only over funds that report every input, so they are never mixed-basis.
  const complete = rows.filter((r) => r.s && r.s.commitments !== null && r.s.contributions !== null && r.s.distributions !== null && r.s.nav !== null);
  const cSum = (pick: (s: NonNullable<(typeof rows)[number]["s"]>) => number | null) => (complete.length ? complete.reduce((a, r) => a + (pick(r.s!) ?? 0), 0) : null);
  const totalUncalled = uncalled(cSum((s) => s.commitments), cSum((s) => s.contributions));
  const totalDpi = dpi(cSum((s) => s.distributions), cSum((s) => s.contributions));
  const cCalled = cSum((s) => s.contributions);
  const totalTvpi = cCalled === null || cCalled === 0 ? null : ((cSum((s) => s.distributions) ?? 0) + (cSum((s) => s.nav) ?? 0)) / cCalled;
  const aum = cSum((s) => s.nav) === null || totalUncalled === null ? null : (cSum((s) => s.nav) as number) + totalUncalled;
  const completeNote = complete.length < rows.length ? `${complete.length} of ${rows.length} funds (those reporting commitments, called, distributions and NAV)` : "";
  const agg = aggregateExposure(rows.map((r) => ({ fundName: r.f.name, snap: r.s })));
  const noneNote = (label: string) => `No fund reports ${label} in its latest import.`;

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
          <span className="muted">{batch ? `latest import as of ${fmtDate(batch.asOfDate)} · each fund shows its own as-of` : "no import yet"}</span>
        </div>
        <div className="tbl-wrap border-0 rounded-none">
          <table className="tbl compact tbl-cards">
            <thead>
              <tr>
                <th>Fund</th>
                <th>Vintage</th>
                <th className="num">Commitments</th>
                <th className="num">Called</th>
                <th className="num">Uncalled</th>
                <th className="num">Distributions</th>
                <th className="num">NAV</th>
                <th className="num">DPI</th>
                <th className="num">Net IRR</th>
                <th className="num">Net MOIC</th>
                <th className="num">GP carry generated</th>
                <th>As of</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ f, s, fb, gpCarry }) => (
                <tr key={f.id}>
                  <td className="card-title"><Link href={`/funds/${f.id}`} className="link">{f.name}</Link> <span className="ml-1 align-middle"><StatusBadge status={f.status} /></span></td>
                  <td className="tnum card-hide">{f.vintage}</td>
                  <td className="num" data-label="Commitments"><Fig value={s?.commitments} fmt={fmtMoneyM} missing={missingReason(s, "Total Commitments", fb)} /></td>
                  <td className="num" data-label="Called"><Fig value={s?.contributions} fmt={fmtMoneyM} missing={missingReason(s, "Called Capital", fb)} /></td>
                  <td className="num" data-label="Uncalled"><Fig value={uncalled(s?.commitments, s?.contributions)} fmt={fmtMoneyM} missing="Needs commitments and called capital from the latest import." /></td>
                  <td className="num" data-label="Distributions"><Fig value={s?.distributions} fmt={fmtMoneyM} missing={missingReason(s, "Distributions", fb)} /></td>
                  <td className="num" data-label="NAV"><Fig value={s?.nav} fmt={fmtMoneyM} missing={missingReason(s, "Remaining NAV", fb)} /></td>
                  <td className="num" data-label="DPI"><Fig value={dpi(s?.distributions, s?.contributions)} fmt={fmtMultiple} missing="distributions ÷ called; an input is missing" /></td>
                  <td className="num" data-label="Net IRR"><Fig value={s?.irrNet} fmt={fmtRatioPct} missing={missingReason(s, "Fund Net IRR", fb)} /></td>
                  <td className="num" data-label="Net MOIC"><Fig value={s?.moicNet} fmt={fmtMultiple} missing={missingReason(s, "Fund Net MOIC", fb)} /></td>
                  <td className="num" data-label="GP carry generated">
                    <Fig
                      value={gpCarry?.totalValue}
                      fmt={fmtMoneyM}
                      missing={s ? "GP Carry class Total Value is blank in this fund's import (no carry accrued or distributed, or not reported)." : missingReason(s, "GP Carry", fb)}
                    />
                    {gpCarry?.totalValue !== null && gpCarry?.totalValue !== undefined && (
                      <span className="faint block text-[10.5px]" title="GP Carry class: distributions + remaining NAV, as reported">
                        dist {fmtMoneyM(gpCarry.distributions ?? 0)} · NAV {fmtMoneyM(gpCarry.nav ?? 0)}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap" data-label="As of">{s ? fmtDate(s.asOfDate) : <span className="missing" title={missingReason(s, "", fb)}>—</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="card-title">Total</td>
                <td className="card-hide" />
                <td className="num" data-label="Commitments"><Fig value={totals.commitments.sum} fmt={fmtMoneyM} missing={noneNote("commitments")} /><Cnt k="commitments" pick={(r) => r.s?.commitments} /></td>
                <td className="num" data-label="Called"><Fig value={totals.called.sum} fmt={fmtMoneyM} missing={noneNote("called capital")} /><Cnt k="called" pick={(r) => r.s?.contributions} /></td>
                <td className="num" data-label="Uncalled"><Fig value={totalUncalled} fmt={fmtMoneyM} missing="Σ commitments − Σ called over the funds reporting both." />{(totals.commitments.missing || totals.called.missing) ? <span className="faint block text-[10.5px]">reporting funds only</span> : null}</td>
                <td className="num" data-label="Distributions"><Fig value={totals.distributions.sum} fmt={fmtMoneyM} missing={noneNote("distributions")} /><Cnt k="distributions" pick={(r) => r.s?.distributions} /></td>
                <td className="num" data-label="NAV"><Fig value={totals.nav.sum} fmt={fmtMoneyM} missing={noneNote("NAV")} /><Cnt k="nav" pick={(r) => r.s?.nav} /></td>
                <td className="num" data-label="DPI"><Fig value={totalDpi} fmt={fmtMultiple} missing="Σ distributions ÷ Σ called over fully-reporting funds" />{completeNote && <span className="faint block text-[10.5px]" title={completeNote}>{complete.length} of {rows.length} funds</span>}</td>
                <td className="num" data-label="Net IRR"><span className="missing" title="An aggregate IRR is not in the accounting files and is not computed here.">—</span></td>
                <td className="num" data-label="TVPI (aggregate)"><Fig value={totalTvpi} fmt={fmtMultiple} missing="(Σ distributions + Σ NAV) ÷ Σ called over fully-reporting funds" /><span className="faint block text-[10.5px]" title={completeNote || undefined}>TVPI, computed{completeNote ? ` · ${complete.length} of ${rows.length}` : ""}</span></td>
                <td className="num" data-label="GP carry generated"><Fig value={totals.gpCarry.sum} fmt={fmtMoneyM} missing={noneNote("a GP carry figure")} /><Cnt k="gpCarry" pick={(r) => r.gpCarry?.totalValue} /></td>
                <td data-label="AUM (NAV + uncalled)"><span className="faint">AUM </span><Fig value={aum} fmt={fmtMoneyM} missing="NAV + uncalled over fully-reporting funds" />{completeNote && <span className="faint block text-[10.5px]" title={completeNote}>{complete.length} of {rows.length} funds</span>}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="px-3 py-1.5 faint">Totals sum the funds that report each figure and say how many did (hover for which are missing). DPI, TVPI and AUM use only funds reporting all four inputs. AUM = Σ NAV + Σ uncalled. GP carry generated = the GP Carry class Total Value (distributions + redemptions + NAV) as reported on each fund's dashboard.</div>
      </section>

      <section className="card">
        <div className="card-h">
          <h2>Exposure by asset class</h2>
          <span className="muted">fund-NAV basis, from each fund's latest dashboard{agg.excluded.length ? ` · not reported for ${agg.excluded.join(", ")}` : ""}</span>
        </div>
        <div className="card-b grid gap-6 md:grid-cols-[minmax(260px,1fr)_2fr]">
          <div>
            <h3 className="mb-2">All funds ({agg.included} reporting)</h3>
            {agg.slices.length ? (
              <div className="flex items-center gap-4 flex-wrap">
                <ExposurePie slices={agg.slices} size={200} showLabels={false} />
                <div className="flex-1 min-w-[200px]"><ExposureLegend slices={agg.slices} /></div>
              </div>
            ) : (
              <div className="muted">No fund has reported asset-class exposure yet (the table starts in the July 2026 dashboards).</div>
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {rows.map(({ f, s }) => {
              const slices = fundExposure(s);
              return (
                <div key={f.id} className="min-w-0">
                  <div className="text-[12px] font-medium truncate" title={f.name}>{f.name.replace("Freestone ", "")}</div>
                  {slices && slices.length ? (
                    <>
                      <ExposurePie slices={slices} size={120} showLabels={false} />
                      <ExposureLegend slices={slices} />
                    </>
                  ) : (
                    <div className="faint text-[11.5px] py-6 text-center">{s ? "not in this fund's file" : "no import yet"}</div>
                  )}
                </div>
              );
            })}
          </div>
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
