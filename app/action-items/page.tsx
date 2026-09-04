import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { teamMembers } from "@/lib/constants";
import { actionItemInclude, linkOptions, sortByUrgency } from "@/lib/queries/actionItems";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/FilterBar";
import { ItemsTable } from "@/components/actionItems/ItemsTable";
import { QuickAdd } from "@/components/actionItems/QuickAdd";
import { EditItemForm } from "./EditItemForm";

export const dynamic = "force-dynamic";

export default async function ActionItemsPage({ searchParams }: { searchParams: Promise<{ owner?: string; status?: string; linked?: string; edit?: string }> }) {
  const sp = await searchParams;
  const me = await currentUser();
  const status = sp.status ?? "open";
  const items = await prisma.actionItem.findMany({
    where: {
      owner: sp.owner || undefined,
      status: status === "all" ? undefined : status,
      investmentId: sp.linked === "investment" ? { not: null } : undefined,
      dealId: sp.linked === "deal" ? { not: null } : undefined,
      fundId: sp.linked === "fund" ? { not: null } : undefined,
      AND: sp.linked === "none" ? [{ investmentId: null }, { dealId: null }, { fundId: null }] : undefined,
    },
    include: actionItemInclude,
    orderBy: { createdAt: "desc" },
  });
  const options = await linkOptions();
  const editing = sp.edit ? items.find((i) => i.id === sp.edit) ?? (await prisma.actionItem.findUnique({ where: { id: sp.edit }, include: actionItemInclude })) : null;

  return (
    <div className="space-y-4">
      <PageHeader title="Action items" subtitle={`${items.length} shown`}>
        <Link href="/action-items/meeting" className="btn btn-secondary">Meeting mode</Link>
      </PageHeader>
      <QuickAdd options={options} members={teamMembers()} defaultOwner={me} />
      <FilterBar
        current={{ ...sp, status: sp.status }}
        filters={[
          { key: "owner", label: "Owner", options: teamMembers().map((m) => ({ value: m, label: m })) },
          { key: "status", label: "Status", emptyLabel: "Open", options: [{ value: "done", label: "Done" }, { value: "all", label: "All" }] },
          { key: "linked", label: "Linked to", options: [{ value: "investment", label: "Investments" }, { value: "deal", label: "Deals" }, { value: "fund", label: "Funds" }, { value: "none", label: "Unlinked" }] },
        ]}
      />
      {editing && <EditItemForm item={editing} options={options} members={teamMembers()} />}
      <ItemsTable items={status === "open" ? sortByUrgency(items) : items} emptyText="No items match." />
    </div>
  );
}
