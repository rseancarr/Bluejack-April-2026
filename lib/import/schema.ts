/**
 * ACCOUNTING WORKBOOK LAYOUT — confirmed against
 * samples/20260630_FAPIV_TB_Analysis_JC.xlsx ("Freestone Advantage Partners IV LP", as of 2026-06-30).
 *
 * One workbook = one fund, one as-of date. Three tabs are read; everything else is ignored.
 *
 * 1. "Dashboard Confessional" — the source of truth. Values are located by the label text in
 *    column B (not by fixed cell addresses), so rows can move but labels must not be renamed.
 *      B2                     Fund name
 *      "Return Basis" table   rows starting "Fund Gross", "Fund Net", "Total Fund"; columns "IRR", "MOIC"
 *      "Measure" table        rows "Total Commitments", "Called Capital", "Distributions", "Redemptions",
 *                             "Remaining NAV", "Total Value"; columns "Non-Affiliate", "Affiliate",
 *                             "GP Carry", "Fund Total"
 *      "Holding" table        one row per investment: Holding | Valuation Date | NAV | IRR | MOIC,
 *                             ending at a row starting "Total". Valuation Date is a date for live
 *                             holdings or a status word (e.g. "Closed") for realized ones.
 *      "As-of date" row       the date cell on that row (column E in the sample)
 *
 * 2. "MTM" — Investment | Date of Valuation | FS Value | Cost | … | Investment Type.
 *    Supplies Cost per holding (matched by exact holding name) and the investment type.
 *
 * 3. "IRR Detail" — per-investment cash-flow columns (name in the row above "Date | Cash"),
 *    flows down to the row labelled "Current Value" (exclusive).
 *      contributions = −Σ negative cash flows    distributions = Σ positive cash flows
 *    These are sums of accounting's own rows (the same inputs its MOIC formula uses), never
 *    estimates. Missing block → both null.
 *
 * Conventions confirmed from the sample:
 *   - Called capital, distributions, NAV are positive amounts.
 *   - IRR is a fraction (0.2586 = 25.9%); MOIC is a multiple (2.18 = 2.18x). Stored as-is.
 *   - Realized holdings have a status word instead of a valuation date and a blank NAV.
 *   - Fund NAV ("Remaining NAV") ≠ Σ holding NAV: the difference is cash, fees, accruals and
 *     GP carry. Reconciliation reports it as information, not an error.
 */

export const SHEETS = {
  dashboard: "Dashboard Confessional",
  mtm: "MTM",
  irrDetail: "IRR Detail",
} as const;

export const DASHBOARD = {
  fundNameCell: "B2",
  labelColumn: "B",
  returnBasisHeader: "Return Basis",
  returnRows: { gross: "Fund Gross", net: "Fund Net", total: "Total Fund" },
  measureHeader: "Measure",
  measureRows: {
    commitments: "Total Commitments",
    called: "Called Capital",
    distributions: "Distributions",
    redemptions: "Redemptions",
    nav: "Remaining NAV",
    totalValue: "Total Value",
  },
  classColumns: { nonAffiliate: "Non-Affiliate", affiliate: "Affiliate", gpCarry: "GP Carry", total: "Fund Total" },
  holdingHeader: "Holding",
  holdingColumns: { valuationDate: "Valuation Date", nav: "NAV", irr: "IRR", moic: "MOIC" },
  holdingTotalPrefix: "Total",
  asOfLabel: "As-of date",
} as const;

export const MTM = {
  headerName: "Investment",
  columns: { cost: "Cost", valuationDate: "Date of Valuation", fsValue: "FS Value", type: "Investment Type" },
  totalLabel: "Total",
} as const;

export const IRR_DETAIL = {
  dateHeader: "Date",
  cashHeader: "Cash",
  terminalLabel: "Current Value",
} as const;

/** Financial fields stored on FinancialSnapshot for both levels. */
export const NUMERIC_FIELDS = ["cost", "contributions", "distributions", "nav", "irr", "moic"] as const;
export type NumericField = (typeof NUMERIC_FIELDS)[number];

/** Additional fund-level fields. */
export const FUND_FIELDS = ["commitments", "redemptions", "totalValue", "irrGross", "moicGross", "irrNet", "moicNet"] as const;
export type FundField = (typeof FUND_FIELDS)[number];

/** IRR is a fraction in the workbook (confirmed). Display-only. */
export const IRR_SCALE: "fraction" | "percent" = "fraction";
