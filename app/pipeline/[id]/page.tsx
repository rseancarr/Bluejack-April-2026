import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { teamMembers } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { actionItemInclude, linkOptions, sortByUrgency } from "@/lib/queries/actionItems";
import { PageHeader } from "@/components/ui/PageHeader";
import { StageBadge } from "@/components/ui/Badge";
import { ItemsTable } from "@/components/actionItems/ItemsTable";
import { QuickAdd } from "@/components/actionItems/QuickAdd";
import { DealEditForm } from "./DealEditForm";
import { StageControl } from "./StageControl";

export const dynamic = "force-dynamic";

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = await prisma.deal.findUnique({
    where: { id },
    include: { funds: true, stageEvents: { orderBy: { enteredAt: "asc" } }, actionItems: { where: { status: "open" }, include: actionItemInclude } },
  });
  if (!deal) notFound();
  const [funds, options, me] = await Promise.all([prisma.fund.findMany({ orderBy: { vintage: "asc" } }), linkOptions(), currentUser()]);
  const events = deal.stageEvents;

  return (
    <div className="space-y-6">
      <PageHeader
        title={<span className="flex items-center gap-3">{deal.name} <StageBadge stage={deal.stage} /></span>}
        subtitle={<>{deal.funds.map((f) => funds.find((x) => x.id === f.fundId)?.name).filter(Boolean).join(", ")} · {deal.owner} · sourced {fmtDate(deal.dateSourced)} · <Link href="/pipeline" className="link">back to board</Link></>}
      >
        <StageControl dealId={deal.id} stage={deal.stage} passReason={deal.passReason} />
      </PageHeader>

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="card lg:col-span-2">
          <div className="card-h"><h2>Deal</h2><span className="muted">editable</span></div>
          <div className="card-b"><DealEditForm deal={deal} fundIds={deal.funds.map((f) => f.fundId)} funds={funds.map((f) => ({ id: f.id, name: f.name }))} members={teamMembers()} /></div>
        </section>
        <section className="card">
          <div className="card-h"><h2>Stage history</h2><span className="muted">append-only</span></div>
          <div className="card-b">
            <ol className="space-y-2">
              {events.map((e, i) => {
                const next = events[i + 1];
                const days = next ? Math.round((next.enteredAt.getTime() - e.enteredAt.getTime()) / 86_400_000) : null;
                return (
                  <li key={e.id} className="flex items-baseline gap-3">
                    <span className="tnum whitespace-nowrap muted w-24">{fmtDate(e.enteredAt)}</span>
                    <StageBadge stage={e.stage} />
                    <span className="faint">{days !== null ? `${days}d` : "current"}{e.changedBy ? ` · ${e.changedBy}` : ""}{e.note ? ` · ${e.note}` : ""}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      </div>

      <section className="space-y-2">
        <h2>Open action items</h2>
        <QuickAdd options={options} members={teamMembers()} defaultOwner={me} defaultLink={`deal:${deal.id}`} />
        <ItemsTable items={sortByUrgency(deal.actionItems)} showLink={false} emptyText="No open items." />
      </section>
    </div>
  );
}
