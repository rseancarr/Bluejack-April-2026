/**
 * EXPECTED WORKBOOK SCHEMA — PROVISIONAL.
 *
 * TODO(sample-workbook): No sample file was available in /samples when this parser
 * was written, so the layout below is an assumption to be replaced/confirmed
 * against accounting's real monthly workbook. Everything in this file is the single
 * place that encodes that assumption. Things that MUST be confirmed with accounting:
 *
 *   1. Sheet names ("Funds", "Investments") and header row position (row 1).
 *   2. Column headers (below). Matching is case-insensitive, whitespace-trimmed.
 *   3. Sign conventions. The parser stores numbers exactly as received and never
 *      flips signs. The app *displays* contributions and distributions as positive
 *      amounts, so if accounting reports contributions as negative cash flows
 *      (LP perspective) the display labels need to change — not the data.
 *   4. Percent scale for IRR: Excel percent-formatted cells hold fractions (0.123),
 *      some exports hold 12.3. IRR_SCALE below controls display only.
 *   5. Whether MOIC is present, and whether it is net or gross.
 *   6. Whether there are total/subtotal rows (the expected schema has none; a row
 *      named "Total" would show up as an unmatched name in preview and cannot be
 *      committed without an explicit mapping).
 *
 * The parser fails loudly on any deviation from this schema.
 */

export const SHEETS = {
  funds: "Funds",
  investments: "Investments",
} as const;

/** Column headers on the Funds sheet. */
export const FUND_COLUMNS = {
  externalId: "Fund ID", // optional
  name: "Fund Name", // required
  asOfDate: "As Of Date", // required, same value on every row of every sheet
  cost: "Cost", // optional
  contributions: "Contributions", // required
  distributions: "Distributions", // required
  nav: "NAV", // required
  irr: "IRR", // optional
  moic: "MOIC", // optional
} as const;

/** Column headers on the Investments sheet. */
export const INVESTMENT_COLUMNS = {
  externalId: "Investment ID", // optional
  name: "Investment Name", // required
  fundExternalId: "Fund ID", // optional
  fundName: "Fund Name", // required
  asOfDate: "As Of Date", // required
  cost: "Cost", // required
  contributions: "Contributions", // required
  distributions: "Distributions", // required
  nav: "NAV", // required
  irr: "IRR", // optional
  moic: "MOIC", // optional
} as const;

export const FUND_REQUIRED = ["name", "asOfDate", "contributions", "distributions", "nav"] as const;
export const INVESTMENT_REQUIRED = ["name", "fundName", "asOfDate", "cost", "contributions", "distributions", "nav"] as const;

/** Financial fields stored on FinancialSnapshot. Everything else lands in extraJson verbatim. */
export const NUMERIC_FIELDS = ["cost", "contributions", "distributions", "nav", "irr", "moic"] as const;
export type NumericField = (typeof NUMERIC_FIELDS)[number];

/**
 * How IRR is scaled in the workbook. "fraction" = 0.123 means 12.3%.
 * Display-only; the stored value is untouched. TODO(sample-workbook): confirm.
 */
export const IRR_SCALE: "fraction" | "percent" = "fraction";
