import { prisma } from "@/lib/db";
import type { FinancialSnapshot, ImportBatch } from "@prisma/client";
import { fmtDate } from "@/lib/format";

export type SnapshotWithBatch = FinancialSnapshot & { batch: ImportBatch };

/**
 * Accounting delivers one workbook per fund, so "latest" is per fund: each fund's most
 * recent committed batch (by as-of date). `global` is the newest of those, for page labels.
 */
export interface LatestBatches {
  global: ImportBatch | null;
  byFund: Map<string, ImportBatch>;
}

export async function latestBatches(): Promise<LatestBatches> {
  const committed = await prisma.importBatch.findMany({ where: { status: "committed", fundId: { not: null } }, orderBy: { asOfDate: "desc" } });
  const byFund = new Map<string, ImportBatch>();
  for (const b of committed) if (!byFund.has(b.fundId!)) byFund.set(b.fundId!, b);
  return { global: committed[0] ?? null, byFund };
}

/** The most recent committed import overall. Null when nothing has been imported. */
export async function latestBatch(): Promise<ImportBatch | null> {
  return (await latestBatches()).global;
}

/** Investment-level snapshots from each fund's latest committed batch, keyed by investmentId. */
export async function latestInvestmentSnapshots(latest?: LatestBatches): Promise<Map<string, SnapshotWithBatch>> {
  const l = latest ?? (await latestBatches());
  const ids = [...l.byFund.values()].map((b) => b.id);
  if (ids.length === 0) return new Map();
  const rows = await prisma.financialSnapshot.findMany({ where: { batchId: { in: ids }, level: "investment" }, include: { batch: true } });
  return new Map(rows.map((r) => [r.investmentId!, r]));
}

/** Fund-level snapshots from each fund's latest committed batch, keyed by fundId. */
export async function latestFundSnapshots(latest?: LatestBatches): Promise<Map<string, SnapshotWithBatch>> {
  const l = latest ?? (await latestBatches());
  const ids = [...l.byFund.values()].map((b) => b.id);
  if (ids.length === 0) return new Map();
  const rows = await prisma.financialSnapshot.findMany({ where: { batchId: { in: ids }, level: "fund" }, include: { batch: true } });
  return new Map(rows.map((r) => [r.fundId!, r]));
}

/** All committed snapshots for an investment, oldest first. */
export async function investmentHistory(investmentId: string): Promise<SnapshotWithBatch[]> {
  return prisma.financialSnapshot.findMany({
    where: { investmentId, batch: { status: "committed" } },
    include: { batch: true },
    orderBy: { asOfDate: "asc" },
  });
}

export async function fundHistory(fundId: string): Promise<SnapshotWithBatch[]> {
  return prisma.financialSnapshot.findMany({
    where: { fundId, batch: { status: "committed" } },
    include: { batch: true },
    orderBy: { asOfDate: "asc" },
  });
}

/** Latest as-of date at which an investment appeared in any committed import. */
export async function lastSeen(investmentId: string): Promise<SnapshotWithBatch | null> {
  return prisma.financialSnapshot.findFirst({
    where: { investmentId, batch: { status: "committed" } },
    include: { batch: true },
    orderBy: { asOfDate: "desc" },
  });
}

/** Tooltip text for a null field on a snapshot. `latest` should be the fund's own latest batch. */
export function missingReason(snap: SnapshotWithBatch | null | undefined, field: string, latest?: ImportBatch | null): string {
  if (!snap) {
    return latest
      ? `Not in the ${fmtDate(latest.asOfDate)} import for this fund (${latest.fileName}). No forward-fill from earlier months.`
      : "No accounting import has been committed for this fund yet.";
  }
  return `${field} was blank in ${snap.batch.fileName} (as of ${fmtDate(snap.asOfDate)}, sheet ${snap.sourceSheet}). Stored as null, not 0.`;
}

export const FIELD_LABELS: Record<string, string> = {
  cost: "Cost",
  contributions: "Contributions",
  distributions: "Distributions",
  nav: "NAV",
  irr: "IRR",
  moic: "MOIC",
};
