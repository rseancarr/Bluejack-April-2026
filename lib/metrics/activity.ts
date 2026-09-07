// Fund activity roll-ups over the "LP Performance" cash-flow rows, exactly as imported.
// Sums use sumAvailable (the count of blank inputs travels with the result) and are labelled
// as sums of the workbook's own rows; nothing is estimated or interpolated.
import type { FundActivity, FundFlow } from "../import/parser";
import { LP_PERFORMANCE } from "../import/schema";
import { sumAvailable, type StrictSum } from "./returns";

export type FlowClass = "nonAffiliateNet" | "affiliates" | "gpCarry" | "total";
export const FLOW_CLASSES: { key: FlowClass; label: string }[] = [
  { key: "nonAffiliateNet", label: "LPs (net)" },
  { key: "affiliates", label: "Affiliates" },
  { key: "gpCarry", label: "GP carry" },
  { key: "total", label: "Total fund" },
];

export const isCapitalCall = (f: FundFlow) => f.type.trim().toLowerCase() === LP_PERFORMANCE.capitalCallType.toLowerCase();

/** Σ of one class over a set of rows (all rows, or e.g. only distributions). */
export function sumFlows(flows: FundFlow[], key: FlowClass): StrictSum {
  return sumAvailable(flows.map((f) => f[key]));
}

export interface YearGroup {
  year: number;
  flows: FundFlow[]; // newest first
  calls: Record<FlowClass, StrictSum>;
  distributions: Record<FlowClass, StrictSum>;
}

/** Rows grouped by calendar year, newest year first; each year carries its own call / distribution sums. */
export function flowsByYear(activity: FundActivity): YearGroup[] {
  const byYear = new Map<number, FundFlow[]>();
  for (const f of activity.flows) {
    const y = Number(f.date.slice(0, 4));
    byYear.set(y, [...(byYear.get(y) ?? []), f]);
  }
  const sums = (rows: FundFlow[]) => Object.fromEntries(FLOW_CLASSES.map((c) => [c.key, sumFlows(rows, c.key)])) as Record<FlowClass, StrictSum>;
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, rows]) => {
      const flows = [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      return { year, flows, calls: sums(flows.filter(isCapitalCall)), distributions: sums(flows.filter((f) => !isCapitalCall(f))) };
    });
}

/** Inception-to-date sums split into capital calls and everything else (distributions, income, ROC, redemptions, taxes withheld). */
export function activityTotals(activity: FundActivity) {
  const calls = activity.flows.filter(isCapitalCall);
  const dists = activity.flows.filter((f) => !isCapitalCall(f));
  const sums = (rows: FundFlow[]) => Object.fromEntries(FLOW_CLASSES.map((c) => [c.key, sumFlows(rows, c.key)])) as Record<FlowClass, StrictSum>;
  return { calls: sums(calls), distributions: sums(dists), callCount: calls.length, distributionCount: dists.length };
}
