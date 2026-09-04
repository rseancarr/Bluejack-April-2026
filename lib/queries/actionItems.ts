import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const actionItemInclude = {
  investment: { select: { id: true, name: true } },
  deal: { select: { id: true, name: true } },
  fund: { select: { id: true, name: true } },
} satisfies Prisma.ActionItemInclude;

export type ActionItemRow = Prisma.ActionItemGetPayload<{ include: typeof actionItemInclude }>;

export function linkOf(item: ActionItemRow): { label: string; href: string; kind: string } | null {
  if (item.investment) return { label: item.investment.name, href: `/investments/${item.investment.id}`, kind: "Investment" };
  if (item.deal) return { label: item.deal.name, href: `/pipeline/${item.deal.id}`, kind: "Deal" };
  if (item.fund) return { label: item.fund.name, href: `/funds/${item.fund.id}`, kind: "Fund" };
  return null;
}

/** Overdue first, then soonest due, then undated. */
export function sortByUrgency<T extends { dueDate: Date | null }>(items: T[], now = new Date()): T[] {
  const t = now.getTime();
  return [...items].sort((a, b) => {
    const ad = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const bd = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const ao = ad < t ? 0 : 1;
    const bo = bd < t ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return ad - bd;
  });
}

export function isOverdue(item: { dueDate: Date | null; status: string }, now = new Date()): boolean {
  return item.status === "open" && !!item.dueDate && item.dueDate.getTime() < startOfDay(now).getTime();
}

export function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function openItemsFor(owner: string) {
  const items = await prisma.actionItem.findMany({ where: { owner, status: "open" }, include: actionItemInclude });
  return sortByUrgency(items);
}

/** Options for the "link to" select: investments, deals (open), funds. */
export async function linkOptions() {
  const [investments, deals, funds] = await Promise.all([
    prisma.investment.findMany({ select: { id: true, name: true, fund: { select: { name: true } } }, orderBy: { name: "asc" } }),
    prisma.deal.findMany({ select: { id: true, name: true, stage: true }, orderBy: [{ stage: "asc" }, { name: "asc" }] }),
    prisma.fund.findMany({ select: { id: true, name: true }, orderBy: { vintage: "asc" } }),
  ]);
  return {
    investments: investments.map((i) => ({ value: `investment:${i.id}`, label: `${i.name} · ${i.fund.name}` })),
    deals: deals.map((d) => ({ value: `deal:${d.id}`, label: `${d.name} · ${d.stage}` })),
    funds: funds.map((f) => ({ value: `fund:${f.id}`, label: f.name })),
  };
}

export type LinkOptions = Awaited<ReturnType<typeof linkOptions>>;
