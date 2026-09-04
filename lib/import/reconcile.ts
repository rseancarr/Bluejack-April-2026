// Reconciliation checks over a parsed workbook. Every check reproduces arithmetic the
// workbook itself performs (or should), so a flag means the file is internally inconsistent.
import { RECONCILIATION_TOLERANCE_USD } from "../constants";
import { sumAvailable } from "../metrics/returns";
import type { ParsedWorkbook } from "./parser";
import { DASHBOARD } from "./schema";
import type { MeasureKey } from "./parser";

export interface Check {
  key: string;
  label: string;
  left: number | null;
  leftLabel: string;
  right: number | null;
  rightLabel: string;
  /** left − right; null when either side is null */
  variance: number | null;
  /** "match" = should be zero; "info" = an expected difference, shown but never flagged */
  kind: "match" | "info";
  flagged: boolean;
  note?: string;
}

export interface HoldingCheck {
  name: string;
  reportedMoic: number | null;
  computedMoic: number | null;
  variancePct: number | null;
  flagged: boolean;
  note?: string;
}

export interface FundReconciliation {
  fundKey: string;
  fundName: string;
  investmentCount: number;
  checks: Check[];
  holdingChecks: HoldingCheck[];
  flagged: boolean;
}

const MEASURE_LABELS: Record<MeasureKey, string> = {
  commitments: "Total Commitments",
  called: "Called Capital",
  distributions: "Distributions",
  redemptions: "Redemptions",
  nav: "Remaining NAV",
  totalValue: "Total Value",
};

function check(key: string, label: string, left: number | null, leftLabel: string, right: number | null, rightLabel: string, kind: Check["kind"], tolerance: number, note?: string): Check {
  const variance = left === null || right === null ? null : left - right;
  return { key, label, left, leftLabel, right, rightLabel, variance, kind, flagged: kind === "match" && variance !== null && Math.abs(variance) > tolerance, note };
}

/** Relative tolerance for reported vs recomputed MOIC (the workbook's own formula). */
export const MOIC_CHECK_TOLERANCE = 0.005;

export function reconcile(parsed: ParsedWorkbook, tolerance = RECONCILIATION_TOLERANCE_USD): FundReconciliation[] {
  const fund = parsed.funds[0];
  const holdings = parsed.investments;
  const checks: Check[] = [];

  // 1. Σ holding NAV vs the dashboard's own "Total / Portfolio" NAV (reproduces its SUM).
  const navSum = sumAvailable(holdings.map((h) => h.fields.nav));
  checks.push(
    check("portfolio-nav", "Σ holding NAV vs dashboard portfolio total", navSum.sum, "Σ holdings", parsed.portfolioNavTotal, `dashboard "${DASHBOARD.holdingTotalPrefix}" row`, "match", tolerance, navSum.missing ? `${navSum.missing} holding(s) have no NAV (realized)` : undefined),
  );
  // 2. Fund NAV vs Σ holding NAV — expected to differ (cash, accruals, fees, GP carry).
  checks.push(check("fund-vs-portfolio", "Fund Remaining NAV vs Σ holding NAV", fund.fields.nav, "fund Remaining NAV", navSum.sum, "Σ holdings", "info", tolerance, "difference = cash, accruals, fees and GP carry held outside the holdings"));
  // 3. Σ holding cost vs MTM total row.
  const costSum = sumAvailable(holdings.map((h) => h.fields.cost));
  checks.push(check("mtm-cost", "Σ holding cost vs MTM total", costSum.sum, "Σ holdings", parsed.mtmTotalCost, "MTM Total row", "match", tolerance, costSum.missing ? `${costSum.missing} holding(s) have no cost (not on MTM)` : undefined));
  // 4. Investor classes add up to Fund Total for every measure (dashboard layout only).
  for (const mk of parsed.layout === "dashboard" ? (Object.keys(MEASURE_LABELS) as MeasureKey[]) : []) {
    const c = fund.classes;
    const parts = [c.nonAffiliate[mk], c.affiliate[mk], c.gpCarry[mk]];
    const s = sumAvailable(parts);
    checks.push(check(`class-${mk}`, `${MEASURE_LABELS[mk]}: classes vs Fund Total`, s.sum, "Non-Affiliate + Affiliate + GP Carry", c.total[mk], "Fund Total", "match", tolerance, s.missing ? `${s.missing} class cell(s) blank` : undefined));
  }
  // 5. Total Value = Distributions + Redemptions + Remaining NAV.
  const t = fund.classes.total;
  const tv = sumAvailable([t.distributions, t.redemptions, t.nav]);
  checks.push(check("total-value", "Total Value vs Distributions + Redemptions + NAV", t.totalValue, "Total Value", tv.missing ? null : tv.sum, "sum of components", "match", tolerance));
  // 6. Exposure by asset class: fund-NAV column adds to fund NAV; investment-NAV column adds to the portfolio total.
  if (parsed.exposure) {
    const ef = sumAvailable(parsed.exposure.map((e) => e.fundNav));
    const ei = sumAvailable(parsed.exposure.map((e) => e.investmentNav));
    checks.push(check("exposure-fund", "Exposure (fund NAV column) vs fund Remaining NAV", ef.sum, "Σ asset classes", fund.fields.nav, "fund Remaining NAV", "match", tolerance));
    checks.push(check("exposure-inv", "Exposure (investment NAV column) vs dashboard portfolio total", ei.sum, "Σ asset classes", parsed.portfolioNavTotal, "portfolio total", "info", tolerance, "workbooks differ in what this column holds (some repeat fund NAV)"));
  }

  // 6. Per holding: reported MOIC vs (distributions + NAV) ÷ contributions from the cash flows.
  const holdingChecks: HoldingCheck[] = holdings.map((h) => {
    const { contributions, distributions, nav, moic } = h.fields;
    if (contributions === null || distributions === null || moic === null) {
      return { name: h.name, reportedMoic: moic, computedMoic: null, variancePct: null, flagged: false, note: "not checkable (missing cash flows or MOIC)" };
    }
    if (contributions === 0) return { name: h.name, reportedMoic: moic, computedMoic: null, variancePct: null, flagged: false, note: "no contributions" };
    const computed = (distributions + (nav ?? 0)) / contributions;
    const variancePct = moic === 0 ? null : (computed - moic) / Math.abs(moic);
    return { name: h.name, reportedMoic: moic, computedMoic: computed, variancePct, flagged: variancePct !== null && Math.abs(variancePct) > MOIC_CHECK_TOLERANCE, note: nav === null ? "NAV blank treated as 0 (realized)" : undefined };
  });

  return [
    {
      fundKey: `name:${fund.name.toLowerCase()}`,
      fundName: fund.name,
      investmentCount: holdings.length,
      checks,
      holdingChecks,
      flagged: checks.some((c) => c.flagged) || holdingChecks.some((h) => h.flagged),
    },
  ];
}
