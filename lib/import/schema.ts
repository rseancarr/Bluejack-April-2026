/**
 * ACCOUNTING WORKBOOK LAYOUTS — confirmed against the June 2026 FAP IV file and the July 2026
 * FAP III / IV / V / VI files in samples/ (.xlsx and .xlsm).
 *
 * One workbook = one fund, one as-of date. Two layouts exist:
 *
 * A. DASHBOARD layout (active funds: IV, V, VI). Three tabs are read; everything else is ignored.
 *
 * 1. "Dashboard" (June's file called it "Dashboard Confessional"; any sheet whose name starts with
 *    "Dashboard" is accepted) — the source of truth. Values are located by the label text in
 *    column B (not by fixed cell addresses), so rows can move but labels must not be renamed.
 *      B2                     Fund name
 *      "Return Basis" table   rows starting "Fund Gross", "Fund Net", "Total Fund"; columns "IRR", "MOIC"
 *      "Measure" table        rows "Total Commitments", "Called Capital", "Distributions", "Redemptions",
 *                             "Remaining NAV", "Total Value"; columns "Non-Affiliate", "Affiliate",
 *                             "GP Carry", "Fund Total"
 *      "Holding" table        one row per investment: Holding | Valuation Date | NAV | IRR | MOIC,
 *                             ending at a row starting "Total". Valuation Date is a date for live
 *                             holdings or a status word (e.g. "Closed") for realized ones.
 *      "Exposure by Asset Class" table (July onward, optional)
 *                             Asset Class | Investment NAV | % | Fund NAV, ending at "Total"
 *      "As-of date" row       the date cell on that row (column E in the sample)
 *
 *    Cells containing the text "n/a" in a numeric position are stored as blank (accounting uses
 *    it for "not applicable", e.g. GP Carry called capital). Any other text aborts the import.
 *    The Valuation Date column sometimes carries the MTM "Source" text instead of a date
 *    (FAP V, July): the text is kept as a note and the date is taken from MTM "Date of Valuation".
 *    A holding is realized when that cell says Closed / Realized / Disposed / Exited / Sold /
 *    Liquidated.
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
 * B. WINDDOWN layout (FAP III, no dashboard tab). Read when no "Dashboard*" sheet exists:
 *      "TB Recalc"   fund name in B1; column-B labels with the administrator (SS&C) figure in the
 *                    first numeric column: "Partner's Capital - Contributions" (negated → called),
 *                    "Partner's Capital - Distributions" + "Partner's Capital - Return of Capital"
 *                    (→ distributions), "Partner's Capital - Redemptions", "NAV",
 *                    "Distributions - Carried Interest" (→ GP carry distributions, if any).
 *      "MTM"         Investment | FS Value (→ NAV) | Cost | IRR | MOIC per live holding, "Total" row.
 *      "IRR"         as-of date in A1; per-holding blocks (name in row 2, "Cash Date | Amount |
 *                    Description" in row 3); flows until the row whose Description is "Value";
 *                    then IRR / MOIC / Contribution / Distribution rows (Amount column).
 *      "Valuation"   optional: "Mark date" per holding (mm/dd/yyyy text, "CM" = as-of date).
 *    Commitments, gross/net returns, total value and asset-class exposure are not in this file
 *    and stay blank. Holdings = MTM rows ∪ IRR blocks (matched by exact name); IRR/MOIC prefer
 *    the IRR sheet's summary rows over MTM's columns.
 *
 * Conventions confirmed from the samples:
 *   - Called capital, distributions, NAV are positive amounts.
 *   - IRR is a fraction (0.2586 = 25.9%); MOIC is a multiple (2.18 = 2.18x). Stored as-is.
 *   - Realized holdings have a status word instead of a valuation date and a blank NAV.
 *   - Fund NAV ("Remaining NAV") ≠ Σ holding NAV: the difference is cash, fees, accruals and
 *     GP carry. Reconciliation reports it as information, not an error.
 */

export const SHEETS = {
  dashboard: "Dashboard", // prefix match; "Dashboard Confessional" (June 2026) also qualifies
  mtm: "MTM",
  irrDetail: "IRR Detail",
  // winddown layout
  tbRecalc: "TB Recalc",
  irr: "IRR",
  valuation: "Valuation",
} as const;

/** Text accepted in a numeric cell and stored as blank. Anything else aborts. */
export const NA_TOKENS = ["n/a", "na"] as const;

/** Valuation-date cell words that mean the holding is realized. */
export const REALIZED_WORDS = ["closed", "realized", "disposed", "exited", "sold", "liquidated"] as const;

export const EXPOSURE = {
  sectionLabel: "Exposure by Asset Class",
  columns: { assetClass: "Asset Class", investmentNav: "Investment NAV", pct: "%", fundNav: "Fund NAV" },
  totalLabel: "Total",
} as const;

export const WINDDOWN = {
  fundNameCell: "B1",
  tb: {
    contributions: "Partner's Capital - Contributions",
    returnOfCapital: "Partner's Capital - Return of Capital",
    distributions: "Partner's Capital - Distributions",
    redemptions: "Partner's Capital - Redemptions",
    nav: "NAV",
    carryDistributions: "Distributions - Carried Interest",
  },
  mtm: { header: "Investment", columns: { nav: "FS Value", cost: "Cost", irr: "IRR", moic: "MOIC", manager: "Manager" }, total: "Total" },
  irr: { asOfCell: "A1", dateHeader: "Cash Date", amountHeader: "Amount", descHeader: "Description", terminal: { value: "Value", irr: "IRR", moic: "MOIC", contribution: "Contribution", distribution: "Distribution" } },
  valuation: { investment: "Investment", markDate: "Mark date", currentMonth: "CM" },
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
  columns: { cost: "Cost", valuationDate: "Date of Valuation", fsValue: "FS Value", type: "Investment Type", source: "Source" },
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
