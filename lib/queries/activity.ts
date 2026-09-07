import { prisma } from "../db";
import type { FundActivity } from "../import/parser";
import { latestBatches, type LatestBatches } from "./snapshots";

export interface NavByClassPoint {
  asOf: string; // yyyy-mm-dd
  fileName: string;
  nonAffiliate: number | null;
  affiliate: number | null;
  gpCarry: number | null;
  total: number | null;
}

export interface FundActivityData {
  fundId: string;
  fundName: string;
  /** From the latest committed import's "LP Performance" tab; null when that file has none. */
  activity: FundActivity | null;
  /** Which import the activity came from. */
  fileName: string | null;
  /** Remaining NAV by investor class from every committed import (Dashboard class table), oldest first. */
  navHistory: NavByClassPoint[];
}

type ClassJson = Record<"nonAffiliate" | "affiliate" | "gpCarry" | "total", Record<"nav", number | null>>;

export async function fundActivity(fundId: string, latest?: LatestBatches): Promise<FundActivityData> {
  const l = latest ?? (await latestBatches());
  const [fund, snaps] = await Promise.all([
    prisma.fund.findUniqueOrThrow({ where: { id: fundId }, select: { name: true } }),
    prisma.financialSnapshot.findMany({ where: { fundId, level: "fund", batch: { status: "committed" } }, include: { batch: true }, orderBy: { asOfDate: "asc" } }),
  ]);
  const latestBatch = l.byFund.get(fundId);
  const latestSnap = latestBatch ? snaps.find((s) => s.batchId === latestBatch.id) : undefined;
  const navHistory: NavByClassPoint[] = snaps.map((s) => {
    const c = s.classJson ? (JSON.parse(s.classJson) as ClassJson) : null;
    return {
      asOf: s.asOfDate.toISOString().slice(0, 10),
      fileName: s.batch.fileName,
      nonAffiliate: c?.nonAffiliate.nav ?? null,
      affiliate: c?.affiliate.nav ?? null,
      gpCarry: c?.gpCarry.nav ?? null,
      total: s.nav,
    };
  });
  return {
    fundId,
    fundName: fund.name,
    activity: latestSnap?.activityJson ? (JSON.parse(latestSnap.activityJson) as FundActivity) : null,
    fileName: latestSnap?.batch.fileName ?? null,
    navHistory,
  };
}
