import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { teamMembers } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/FilterBar";
import { Board, type BoardDeal } from "@/components/pipeline/Board";
import { AddDealForm } from "@/components/pipeline/AddDealForm";

export const dynamic = "force-dynamic";

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ fund?: string; owner?: string; showClosed?: string }> }) {
  const sp = await searchParams;
  const [funds, me] = await Promise.all([prisma.fund.findMany({ orderBy: { vintage: "asc" } }), currentUser()]);
  const deals = await prisma.deal.findMany({
    where: {
      funds: sp.fund ? { some: { fundId: sp.fund } } : undefined,
      owner: sp.owner || undefined,
    },
    include: { funds: { include: { fund: { select: { id: true, name: true } } } }, _count: { select: { actionItems: { where: { status: "open" } } } } },
    orderBy: { updatedAt: "desc" },
  });
  const boardDeals: BoardDeal[] = deals.map((d) => ({
    id: d.id,
    name: d.name,
    stage: d.stage,
    owner: d.owner,
    sponsor: d.sponsor,
    bucket: d.bucket,
    estSize: d.estSize,
    nextStep: d.nextStep,
    sourceType: d.sourceType,
    dateSourced: d.dateSourced.toISOString().slice(0, 10),
    updatedAt: d.updatedAt.toISOString(),
    funds: d.funds.map((f) => f.fund.name),
    openItems: d._count.actionItems,
    passReason: d.passReason,
  }));
  const defaultFund = funds.filter((f) => f.status === "investing").at(-1) ?? funds.at(-1);

  return (
    <div className="space-y-4">
      <PageHeader title="Pipeline" subtitle={`${deals.length} deals · drag a card to change its stage (each move is recorded)`}>
        <AddDealForm funds={funds.map((f) => ({ id: f.id, name: f.name }))} members={teamMembers()} defaultOwner={me} defaultFundId={sp.fund || defaultFund?.id || ""} />
      </PageHeader>
      <FilterBar
        current={sp}
        filters={[
          { key: "fund", label: "Fund", options: funds.map((f) => ({ value: f.id, label: f.name })) },
          { key: "owner", label: "Owner", options: teamMembers().map((m) => ({ value: m, label: m })) },
          { key: "showClosed", label: "Closed / Passed", emptyLabel: "Last 180 days", options: [{ value: "all", label: "Show all" }, { value: "90", label: "Last 90 days" }] },
        ]}
      />
      <Board deals={boardDeals} terminalWindowDays={sp.showClosed === "all" ? null : sp.showClosed ? Number(sp.showClosed) : 180} />
    </div>
  );
}
