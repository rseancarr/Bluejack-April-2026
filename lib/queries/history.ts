import type { HistoryPoint } from "@/components/charts/HistoryChart";
import type { FinancialSnapshot } from "@prisma/client";

export function toHistoryPoints(snaps: FinancialSnapshot[]): HistoryPoint[] {
  return snaps.map((s) => ({
    asOf: s.asOfDate.toISOString().slice(0, 10),
    nav: s.nav,
    cost: s.cost,
    distributions: s.distributions,
    contributions: s.contributions,
  }));
}
