import { prisma } from "@/lib/db";
import type { FinancialSnapshot, ImportBatch } from "@prisma/client";
import { fmtDate } from "@/lib/format";

export type SnapshotWithBatch = FinancialSnapshot & { batch: ImportBatch };

/** The most recent committed import (by as-of date). Null when nothing has been imported. */
export async function latestBatch(): Promise<ImportBatch | null> {
  return prisma.importBatch.findFirst({ where: { status: "committed" }, orderBy: { asOfDate: "desc" } });
}

/** Investment-level snapshots from the latest committed batch, keyed by investmentId. */
export async function latestInvestmentSnapshots(batch?: ImportBatch | null): Promise<Map<string, SnapshotWithBatch>> {
  const b = batch === undefined ? await latestBatch() : batch;
  if (!b) return new Map();
  const rows = await prisma.financialSnapshot.findMany({ where: { batchId: b.id, level: "investment" }, include: { batch: true } });
  return new Map(rows.map((r) => [r.investmentId!, r]));
}

/** Fund-level snapshots from the latest committed batch, keyed by fundId. */
export async function latestFundSnapshots(batch?: ImportBatch | null): Promise<Map<string, SnapshotWithBatch>> {
  const b = batch === undefined ? await latestBatch() : batch;
  if (!b) return new Map();
  const rows = await prisma.financialSnapshot.findMany({ where: { batchId: b.id, level: "fund" }, include: { batch: true } });
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

/** Tooltip text for a null field on a snapshot. */
export function missingReason(snap: SnapshotWithBatch | null | undefined, field: string, latest?: ImportBatch | null): string {
  if (!snap) {
    return latest
      ? `Not in the ${fmtDate(latest.asOfDate)} import (${latest.fileName}). No forward-fill from earlier months.`
      : "No accounting import has been committed yet.";
  }
  return `${field} was blank in ${snap.batch.fileName} (as of ${fmtDate(snap.asOfDate)}). Stored as null, not 0.`;
}

export const FIELD_LABELS: Record<string, string> = {
  cost: "Cost",
  contributions: "Contributions",
  distributions: "Distributions",
  nav: "NAV",
  irr: "IRR",
  moic: "MOIC",
};
