// Accounting workbook parser (layout in ./schema.ts). Fails loudly; never coerces; never skips silently.
import ExcelJS from "exceljs";
import { DASHBOARD, FUND_FIELDS, IRR_DETAIL, MTM, NUMERIC_FIELDS, SHEETS, type FundField, type NumericField } from "./schema";

export class ParseError extends Error {
  problems: string[];
  constructor(problems: string[]) {
    super(`Import aborted: ${problems.length} problem(s)\n - ${problems.join("\n - ")}`);
    this.name = "ParseError";
    this.problems = problems;
  }
}

export type ExtraValue = number | string | null;
export type ClassKey = keyof typeof DASHBOARD.classColumns;
export type MeasureKey = keyof typeof DASHBOARD.measureRows;

export interface ParsedRow {
  sheet: string;
  row: number;
  externalId: string | null; // the workbook carries no IDs; kept for the matching pipeline
  name: string;
  fundName: string | null;
  fundExternalId: string | null;
  asOfDate: string; // yyyy-mm-dd
  fields: Record<NumericField, number | null>;
  /** Date of the mark behind NAV (holdings only), yyyy-mm-dd. */
  valuationDate: string | null;
  /** Status word that appeared instead of a valuation date, e.g. "Closed". */
  holdingStatus: string | null;
  missingFields: NumericField[];
  extra: Record<string, ExtraValue>;
  /** Where each field came from, for tooltips: field → "Sheet!Cell". */
  sources: Record<string, string>;
}

export interface ParsedFund extends ParsedRow {
  fundFields: Record<FundField, number | null>;
  /** Measures by investor class, exactly as on the dashboard. */
  classes: Record<ClassKey, Record<MeasureKey, number | null>>;
}

export interface ParsedWorkbook {
  asOfDate: string;
  funds: ParsedFund[]; // exactly one
  investments: ParsedRow[];
  /** "Total / Portfolio" NAV from the holdings table, for reconciliation. */
  portfolioNavTotal: number | null;
  /** Σ Cost from the MTM total row. */
  mtmTotalCost: number | null;
  sheetsRead: string[];
}

type CellValue = ExcelJS.CellValue;

// ---------- cell helpers ----------
function unwrap(v: CellValue): CellValue {
  if (v && typeof v === "object" && "formula" in v) return (v as ExcelJS.CellFormulaValue).result as CellValue;
  if (v && typeof v === "object" && "sharedFormula" in v) return (v as ExcelJS.CellSharedFormulaValue).result as CellValue;
  return v;
}
function isBlank(v: CellValue): boolean {
  const u = unwrap(v);
  if (u === null || u === undefined) return true;
  if (typeof u === "string") return u.trim() === "";
  if (typeof u === "object" && "richText" in u) return (u as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("").trim() === "";
  return false;
}
function describe(v: CellValue): string {
  const u = unwrap(v);
  if (u === null || u === undefined) return "blank";
  if (typeof u === "object" && "error" in u) return `error ${(u as ExcelJS.CellErrorValue).error}`;
  if (u instanceof Date) return `date ${u.toISOString().slice(0, 10)}`;
  if (typeof u === "object") return JSON.stringify(u);
  return `${typeof u} ${JSON.stringify(u)}`;
}
function textOf(v: CellValue): string | null {
  const u = unwrap(v);
  if (typeof u === "string") return u.trim();
  if (typeof u === "number") return String(u);
  if (u && typeof u === "object" && "richText" in u) return (u as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("").trim();
  if (u && typeof u === "object" && "text" in u) return String((u as ExcelJS.CellHyperlinkValue).text).trim();
  return null;
}
function numberOf(v: CellValue): number | null | { bad: string } {
  if (isBlank(v)) return null;
  const u = unwrap(v);
  if (typeof u === "number") return Number.isFinite(u) ? u : { bad: describe(v) };
  return { bad: describe(v) };
}
function dateOf(v: CellValue): string | null | { bad: string } {
  if (isBlank(v)) return null;
  const u = unwrap(v);
  if (u instanceof Date) return Number.isNaN(u.getTime()) ? { bad: describe(v) } : u.toISOString().slice(0, 10);
  if (typeof u === "string" && /^\d{4}-\d{2}-\d{2}$/.test(u.trim())) return u.trim();
  return { bad: describe(v) };
}
function extraOf(v: CellValue): ExtraValue {
  if (isBlank(v)) return null;
  const u = unwrap(v);
  if (typeof u === "number") return u;
  if (u instanceof Date) return u.toISOString().slice(0, 10);
  if (typeof u === "boolean") return u ? "TRUE" : "FALSE";
  return textOf(v) ?? describe(v);
}
const norm = (s: string | null) => (s ?? "").trim().toLowerCase();
const colLetter = (n: number) => {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

class SheetReader {
  constructor(public ws: ExcelJS.Worksheet, public problems: string[]) {}
  get name() {
    return this.ws.name;
  }
  addr(r: number, c: number) {
    return `${this.name}!${colLetter(c)}${r}`;
  }
  cell(r: number, c: number): CellValue {
    return this.ws.getRow(r).getCell(c).value;
  }
  text(r: number, c: number): string | null {
    return textOf(this.cell(r, c));
  }
  /** First row (from `from`) whose column `col` text satisfies `pred`. */
  findRow(col: number, pred: (t: string) => boolean, from = 1, to = this.ws.rowCount): number | null {
    for (let r = from; r <= to; r++) {
      const t = norm(this.text(r, col));
      if (t && pred(t)) return r;
    }
    return null;
  }
  /** Column index of a header text on a row. */
  findCol(r: number, header: string): number | null {
    const row = this.ws.getRow(r);
    let found: number | null = null;
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      if (found === null && norm(textOf(cell.value)) === norm(header)) found = c;
    });
    return found;
  }
  /** Numeric cell → number|null, or record a problem and return null. */
  num(r: number, c: number, what: string): number | null {
    const n = numberOf(this.cell(r, c));
    if (n !== null && typeof n === "object") {
      this.problems.push(`${this.addr(r, c)} (${what}) must be numeric, got ${n.bad}`);
      return null;
    }
    return n;
  }
}

// ---------- Dashboard ----------
function readDashboard(wb: ExcelJS.Workbook, problems: string[]) {
  const ws = wb.getWorksheet(SHEETS.dashboard);
  if (!ws) {
    problems.push(`Missing sheet "${SHEETS.dashboard}" (sheets found: ${wb.worksheets.map((w) => `"${w.name}"`).join(", ")})`);
    return null;
  }
  const s = new SheetReader(ws, problems);
  const B = 2;
  const startsWith = (prefix: string) => (t: string) => t.startsWith(norm(prefix));
  const exact = (label: string) => (t: string) => t === norm(label);

  // Fund name
  const fundName = textOf(ws.getCell(DASHBOARD.fundNameCell).value);
  if (!fundName) problems.push(`${s.name}!${DASHBOARD.fundNameCell} (fund name) is blank`);

  // As-of date
  const asOfRow = s.findRow(B, startsWith(DASHBOARD.asOfLabel));
  let asOfDate: string | null = null;
  if (!asOfRow) problems.push(`${s.name}: no row in column B starting "${DASHBOARD.asOfLabel}"`);
  else {
    const row = ws.getRow(asOfRow);
    let found: string | null | { bad: string } = null;
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      if (c === B || found) return;
      const d = dateOf(cell.value);
      if (d !== null) found = d;
    });
    if (found === null) problems.push(`${s.name} row ${asOfRow}: no date cell found next to "${DASHBOARD.asOfLabel}"`);
    else if (typeof found === "object") problems.push(`${s.name} row ${asOfRow}: as-of date is ${(found as { bad: string }).bad}`);
    else asOfDate = found;
  }

  // Return basis table
  const rbRow = s.findRow(B, exact(DASHBOARD.returnBasisHeader));
  const returns: Record<"gross" | "net" | "total", { irr: number | null; moic: number | null; src: string }> = {
    gross: { irr: null, moic: null, src: "" },
    net: { irr: null, moic: null, src: "" },
    total: { irr: null, moic: null, src: "" },
  };
  if (!rbRow) problems.push(`${s.name}: no "${DASHBOARD.returnBasisHeader}" header row in column B`);
  else {
    const irrCol = s.findCol(rbRow, "IRR");
    const moicCol = s.findCol(rbRow, "MOIC");
    if (!irrCol || !moicCol) problems.push(`${s.name} row ${rbRow}: expected "IRR" and "MOIC" column headers`);
    else {
      for (const key of ["gross", "net", "total"] as const) {
        const label = DASHBOARD.returnRows[key];
        const r = s.findRow(B, startsWith(label), rbRow + 1, rbRow + 8);
        if (!r) {
          problems.push(`${s.name}: no row starting "${label}" under "${DASHBOARD.returnBasisHeader}"`);
          continue;
        }
        returns[key] = { irr: s.num(r, irrCol, `${label} IRR`), moic: s.num(r, moicCol, `${label} MOIC`), src: s.addr(r, irrCol) };
      }
    }
  }

  // Measures by class
  const mRow = s.findRow(B, exact(DASHBOARD.measureHeader));
  const classCols: Partial<Record<ClassKey, number>> = {};
  const classes = {} as Record<ClassKey, Record<MeasureKey, number | null>>;
  const measureSrc: Partial<Record<MeasureKey, string>> = {};
  for (const k of Object.keys(DASHBOARD.classColumns) as ClassKey[]) classes[k] = { commitments: null, called: null, distributions: null, redemptions: null, nav: null, totalValue: null };
  if (!mRow) problems.push(`${s.name}: no "${DASHBOARD.measureHeader}" header row in column B`);
  else {
    for (const [k, header] of Object.entries(DASHBOARD.classColumns) as [ClassKey, string][]) {
      const c = s.findCol(mRow, header);
      if (!c) problems.push(`${s.name} row ${mRow}: missing column header "${header}"`);
      else classCols[k] = c;
    }
    if (Object.keys(classCols).length === 4) {
      for (const [mk, label] of Object.entries(DASHBOARD.measureRows) as [MeasureKey, string][]) {
        const r = mk === "nav" ? s.findRow(B, exact(label), mRow + 1, mRow + 12) : s.findRow(B, startsWith(label), mRow + 1, mRow + 12);
        if (!r) {
          problems.push(`${s.name}: no row "${label}" under "${DASHBOARD.measureHeader}"`);
          continue;
        }
        for (const [ck, c] of Object.entries(classCols) as [ClassKey, number][]) classes[ck][mk] = s.num(r, c, `${label} / ${DASHBOARD.classColumns[ck]}`);
        measureSrc[mk] = s.addr(r, classCols.total!);
      }
    }
  }

  // Holdings table
  const hRow = s.findRow(B, exact(DASHBOARD.holdingHeader));
  const holdings: ParsedRow[] = [];
  let portfolioNavTotal: number | null = null;
  if (!hRow) problems.push(`${s.name}: no "${DASHBOARD.holdingHeader}" header row in column B`);
  else {
    const cols: Partial<Record<keyof typeof DASHBOARD.holdingColumns, number>> = {};
    for (const [k, header] of Object.entries(DASHBOARD.holdingColumns) as [keyof typeof DASHBOARD.holdingColumns, string][]) {
      const c = s.findCol(hRow, header);
      if (!c) problems.push(`${s.name} row ${hRow}: missing column header "${header}"`);
      else cols[k] = c;
    }
    if (Object.keys(cols).length === 4) {
      let r = hRow + 1;
      let sawTotal = false;
      for (; r <= ws.rowCount; r++) {
        const label = s.text(r, B);
        if (label === null || label === "") {
          problems.push(`${s.name} row ${r}: blank holding name before the "${DASHBOARD.holdingTotalPrefix}" row`);
          break;
        }
        if (norm(label).startsWith(norm(DASHBOARD.holdingTotalPrefix))) {
          portfolioNavTotal = s.num(r, cols.nav!, "portfolio NAV total");
          sawTotal = true;
          break;
        }
        const vdRaw = s.cell(r, cols.valuationDate!);
        let valuationDate: string | null = null;
        let holdingStatus: string | null = null;
        if (!isBlank(vdRaw)) {
          const d = dateOf(vdRaw);
          if (typeof d === "string") valuationDate = d;
          else {
            const t = textOf(vdRaw);
            if (t && /^[A-Za-z][A-Za-z /-]*$/.test(t)) holdingStatus = t;
            else problems.push(`${s.addr(r, cols.valuationDate!)} (valuation date) must be a date or a status word, got ${describe(vdRaw)}`);
          }
        }
        const fields: Record<NumericField, number | null> = {
          cost: null,
          contributions: null,
          distributions: null,
          nav: s.num(r, cols.nav!, `${label} NAV`),
          irr: s.num(r, cols.irr!, `${label} IRR`),
          moic: s.num(r, cols.moic!, `${label} MOIC`),
        };
        holdings.push({
          sheet: s.name,
          row: r,
          externalId: null,
          name: label,
          fundName: fundName ?? null,
          fundExternalId: null,
          asOfDate: asOfDate ?? "",
          fields,
          valuationDate,
          holdingStatus,
          missingFields: [],
          extra: {},
          sources: { nav: s.addr(r, cols.nav!), irr: s.addr(r, cols.irr!), moic: s.addr(r, cols.moic!) },
        });
      }
      if (!sawTotal && r > ws.rowCount) problems.push(`${s.name}: holdings table has no "${DASHBOARD.holdingTotalPrefix}" row`);
      if (holdings.length === 0) problems.push(`${s.name}: holdings table is empty`);
      const seenNames = new Map<string, number>();
      for (const h of holdings) {
        const dup = seenNames.get(norm(h.name));
        if (dup) problems.push(`${s.name}: duplicate holding "${h.name}" on rows ${dup} and ${h.row}`);
        else seenNames.set(norm(h.name), h.row);
      }
    }
  }

  return { s, fundName, asOfDate, returns, classes, measureSrc, holdings, portfolioNavTotal };
}

// ---------- MTM ----------
function readMtm(wb: ExcelJS.Workbook, problems: string[]) {
  const ws = wb.getWorksheet(SHEETS.mtm);
  if (!ws) {
    problems.push(`Missing sheet "${SHEETS.mtm}"`);
    return null;
  }
  const s = new SheetReader(ws, problems);
  const hRow = s.findRow(2, (t) => t === norm(MTM.headerName), 1, 10);
  if (!hRow) {
    problems.push(`${s.name}: no header row with "${MTM.headerName}" in column B (rows 1-10)`);
    return null;
  }
  const costCol = s.findCol(hRow, MTM.columns.cost);
  const typeCol = s.findCol(hRow, MTM.columns.type);
  const vdCol = s.findCol(hRow, MTM.columns.valuationDate);
  if (!costCol) {
    problems.push(`${s.name} row ${hRow}: missing column header "${MTM.columns.cost}"`);
    return null;
  }
  const byName = new Map<string, { cost: number | null; type: string | null; valuationDate: string | null; src: string }>();
  let totalCost: number | null = null;
  for (let r = hRow + 1; r <= ws.rowCount; r++) {
    const name = s.text(r, 2);
    if (!name) continue; // MTM has a blank row before Total
    if (norm(name) === norm(MTM.totalLabel)) {
      totalCost = s.num(r, costCol, "MTM total cost");
      break;
    }
    if (byName.has(norm(name))) problems.push(`${s.name} row ${r}: duplicate investment "${name}"`);
    let vd: string | null = null;
    if (vdCol) {
      const d = dateOf(s.cell(r, vdCol));
      if (typeof d === "string") vd = d;
    }
    byName.set(norm(name), { cost: s.num(r, costCol, `${name} cost`), type: typeCol ? s.text(r, typeCol) : null, valuationDate: vd, src: s.addr(r, costCol) });
  }
  return { byName, totalCost, sheet: s.name };
}

// ---------- IRR Detail ----------
function readIrrDetail(wb: ExcelJS.Workbook, problems: string[]) {
  const ws = wb.getWorksheet(SHEETS.irrDetail);
  if (!ws) {
    problems.push(`Missing sheet "${SHEETS.irrDetail}"`);
    return null;
  }
  const s = new SheetReader(ws, problems);
  // Header row: a row that contains a "Date" cell immediately followed by "Cash".
  let hRow: number | null = null;
  const blocks: { name: string; dateCol: number; cashCol: number }[] = [];
  for (let r = 1; r <= Math.min(ws.rowCount, 12) && hRow === null; r++) {
    const row = ws.getRow(r);
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      if (norm(textOf(cell.value)) === norm(IRR_DETAIL.dateHeader) && norm(s.text(r, c + 1)) === norm(IRR_DETAIL.cashHeader)) {
        hRow = r;
        const name = s.text(r - 1, c);
        if (name) blocks.push({ name, dateCol: c, cashCol: c + 1 });
        else problems.push(`${s.addr(r - 1, c)}: expected an investment name above the "Date" header`);
      }
    });
  }
  if (hRow === null) {
    problems.push(`${s.name}: no "${IRR_DETAIL.dateHeader}" / "${IRR_DETAIL.cashHeader}" header row found (rows 1-12)`);
    return null;
  }
  const termRow = s.findRow(2, (t) => t === norm(IRR_DETAIL.terminalLabel), hRow + 1);
  if (!termRow) {
    problems.push(`${s.name}: no "${IRR_DETAIL.terminalLabel}" row in column B below the header`);
    return null;
  }
  const byName = new Map<string, { contributions: number; distributions: number; flows: number; src: string }>();
  for (const b of blocks) {
    let contributions = 0;
    let distributions = 0;
    let flows = 0;
    for (let r = (hRow as number) + 1; r < termRow; r++) {
      const v = s.cell(r, b.cashCol);
      if (isBlank(v)) continue;
      const n = numberOf(v);
      if (n === null || typeof n === "object") {
        problems.push(`${s.addr(r, b.cashCol)} (${b.name} cash flow) must be numeric, got ${describe(v)}`);
        continue;
      }
      const d = dateOf(s.cell(r, b.dateCol));
      if (typeof d !== "string") problems.push(`${s.addr(r, b.dateCol)} (${b.name} cash-flow date) must be a date, got ${describe(s.cell(r, b.dateCol))}`);
      flows++;
      if (n < 0) contributions += -n;
      else distributions += n;
    }
    if (byName.has(norm(b.name))) problems.push(`${s.name}: duplicate cash-flow block for "${b.name}"`);
    byName.set(norm(b.name), { contributions, distributions, flows, src: `${s.name}!${colLetter(b.cashCol)}${(hRow as number) + 1}:${colLetter(b.cashCol)}${termRow - 1}` });
  }
  return { byName, sheet: s.name };
}

/** Parse a workbook buffer. Throws ParseError listing every problem found. */
export async function parseWorkbook(buffer: Buffer | ArrayBuffer): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  } catch (e) {
    throw new ParseError([`File is not a readable .xlsx workbook (${(e as Error).message})`]);
  }
  const problems: string[] = [];
  const dash = readDashboard(wb, problems);
  const mtm = readMtm(wb, problems);
  const irr = readIrrDetail(wb, problems);
  if (!dash || problems.length) throw new ParseError(problems);
  const asOfDate = dash.asOfDate!;
  const fundName = dash.fundName!;

  // Holdings: enrich with cost (MTM) and cash-flow sums (IRR Detail).
  for (const h of dash.holdings) {
    const key = norm(h.name);
    h.asOfDate = asOfDate;
    const m = mtm?.byName.get(key);
    if (m) {
      h.fields.cost = m.cost;
      h.sources.cost = m.src;
      if (m.type) h.extra["Investment Type"] = m.type;
      if (!h.valuationDate && m.valuationDate) h.valuationDate = m.valuationDate;
    }
    const cf = irr?.byName.get(key);
    if (cf) {
      h.fields.contributions = cf.contributions;
      h.fields.distributions = cf.distributions;
      h.sources.contributions = cf.src;
      h.sources.distributions = cf.src;
      h.extra["Cash flows"] = cf.flows;
    }
    h.missingFields = NUMERIC_FIELDS.filter((f) => h.fields[f] === null);
  }
  if (problems.length) throw new ParseError(problems);

  const total = dash.classes.total;
  const fund: ParsedFund = {
    sheet: dash.s.name,
    row: 2,
    externalId: null,
    name: fundName,
    fundName,
    fundExternalId: null,
    asOfDate,
    fields: {
      cost: mtm?.totalCost ?? null,
      contributions: total.called,
      distributions: total.distributions,
      nav: total.nav,
      irr: dash.returns.total.irr,
      moic: dash.returns.total.moic,
    },
    valuationDate: null,
    holdingStatus: null,
    missingFields: [],
    extra: {},
    sources: {
      cost: mtm ? `${mtm.sheet} Total` : "",
      contributions: dash.measureSrc.called ?? "",
      distributions: dash.measureSrc.distributions ?? "",
      nav: dash.measureSrc.nav ?? "",
      irr: dash.returns.total.src,
      moic: dash.returns.total.src,
      commitments: dash.measureSrc.commitments ?? "",
      redemptions: dash.measureSrc.redemptions ?? "",
      totalValue: dash.measureSrc.totalValue ?? "",
      irrGross: dash.returns.gross.src,
      irrNet: dash.returns.net.src,
    },
    fundFields: {
      commitments: total.commitments,
      redemptions: total.redemptions,
      totalValue: total.totalValue,
      irrGross: dash.returns.gross.irr,
      moicGross: dash.returns.gross.moic,
      irrNet: dash.returns.net.irr,
      moicNet: dash.returns.net.moic,
    },
    classes: dash.classes,
  };
  fund.missingFields = NUMERIC_FIELDS.filter((f) => fund.fields[f] === null);
  void FUND_FIELDS;

  return {
    asOfDate,
    funds: [fund],
    investments: dash.holdings,
    portfolioNavTotal: dash.portfolioNavTotal,
    mtmTotalCost: mtm?.totalCost ?? null,
    sheetsRead: [dash.s.name, mtm?.sheet, irr?.sheet].filter((x): x is string => !!x),
  };
}
