// Reconciliation of investment-level sums vs fund-level figures in the same workbook.
import { RECONCILIATION_TOLERANCE_USD } from "../constants";
import { sumStrict } from "../metrics/returns";
import type { ParsedRow } from "./parser";

export const RECONCILED_FIELDS = ["cost", "contributions", "distributions", "nav"] as const;
export type ReconciledField = (typeof RECONCILED_FIELDS)[number];

export interface FieldVariance {
  field: ReconciledField;
  fundValue: number | null;
  investmentSum: number | null;
  /** number of investment rows missing this field (sum is null when > 0) */
  missing: number;
  /** fundValue − investmentSum; null if either side is null */
  variance: number | null;
  flagged: boolean;
}

export interface FundReconciliation {
  fundKey: string; // fund external ID if present, else fund name (as in workbook)
  fundName: string;
  investmentCount: number;
  fields: FieldVariance[];
  flagged: boolean;
  /** true if a fund row had no investment rows, or investment rows referenced a fund with no fund row */
  orphan: "no-investments" | "no-fund-row" | null;
}

function fundKeyOf(row: { externalId: string | null; name: string }) {
  return row.externalId ? `id:${row.externalId}` : `name:${row.name.toLowerCase()}`;
}
function investmentFundKeyOf(row: ParsedRow) {
  return row.fundExternalId ? `id:${row.fundExternalId}` : `name:${(row.fundName ?? "").toLowerCase()}`;
}

/**
 * Sum investment rows per fund and compare to the fund row. Investment rows are grouped
 * by Fund ID when present on both sheets, otherwise by Fund Name (case-insensitive).
 */
export function reconcile(funds: ParsedRow[], investments: ParsedRow[], tolerance = RECONCILIATION_TOLERANCE_USD): FundReconciliation[] {
  const groups = new Map<string, ParsedRow[]>();
  for (const inv of investments) {
    const key = investmentFundKeyOf(inv);
    const list = groups.get(key) ?? [];
    list.push(inv);
    groups.set(key, list);
  }

  const out: FundReconciliation[] = [];
  const seen = new Set<string>();
  for (const fund of funds) {
    const key = fundKeyOf(fund);
    seen.add(key);
    const invs = groups.get(key) ?? [];
    const fields: FieldVariance[] = RECONCILED_FIELDS.map((field) => {
      const fundValue = fund.fields[field];
      const s = sumStrict(invs.map((i) => i.fields[field]));
      const investmentSum = invs.length === 0 ? null : s.sum;
      const variance = fundValue === null || investmentSum === null ? null : fundValue - investmentSum;
      const flagged = variance !== null && Math.abs(variance) > tolerance;
      return { field, fundValue, investmentSum, missing: s.missing, variance, flagged };
    });
    out.push({
      fundKey: key,
      fundName: fund.name,
      investmentCount: invs.length,
      fields,
      flagged: fields.some((f) => f.flagged),
      orphan: invs.length === 0 ? "no-investments" : null,
    });
  }
  for (const [key, invs] of groups) {
    if (seen.has(key)) continue;
    out.push({
      fundKey: key,
      fundName: invs[0].fundName ?? invs[0].fundExternalId ?? key,
      investmentCount: invs.length,
      fields: RECONCILED_FIELDS.map((field) => {
        const s = sumStrict(invs.map((i) => i.fields[field]));
        return { field, fundValue: null, investmentSum: s.sum, missing: s.missing, variance: null, flagged: false };
      }),
      flagged: true,
      orphan: "no-fund-row",
    });
  }
  return out;
}
