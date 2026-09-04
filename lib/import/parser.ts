// Accounting workbook parser (layouts in ./schema.ts). Fails loudly; never coerces; never skips silently.
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  DASHBOARD,
  EXPOSURE,
  FUND_FIELDS,
  IRR_DETAIL,
  MTM,
  NA_TOKENS,
  NUMERIC_FIELDS,
  REALIZED_WORDS,
  SHEETS,
  WINDDOWN,
  type FundField,
  type NumericField,
} from "./schema";

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
export type Layout = "dashboard" | "winddown";

export interface ParsedRow {
  sheet: string;
  row: number;
  externalId: string | null;
  name: string;
  fundName: string | null;
  fundExternalId: string | null;
  asOfDate: string;
  fields: Record<NumericField, number | null>;
  /** Date of the mark behind NAV (holdings only), yyyy-mm-dd. */
  valuationDate: string | null;
  /** Text that appeared in the valuation-date cell (e.g. "Closed", "Quarterly PCAP"). */
  holdingStatus: string | null;
  /** True when holdingStatus is one of REALIZED_WORDS. */
  realized: boolean;
  /** Accounting's asset class for the holding (MTM "Asset Class"), when the workbook has it. */
  assetClass: string | null;
  missingFields: NumericField[];
  extra: Record<string, ExtraValue>;
  sources: Record<string, string>;
}

export interface ExposureRow {
  assetClass: string;
  investmentNav: number | null;
  pct: number | null;
  fundNav: number | null;
}

export interface ParsedFund extends ParsedRow {
  fundFields: Record<FundField, number | null>;
  classes: Record<ClassKey, Record<MeasureKey, number | null>>;
}

export interface ParsedWorkbook {
  layout: Layout;
  asOfDate: string;
  funds: ParsedFund[]; // exactly one
  investments: ParsedRow[];
  portfolioNavTotal: number | null;
  mtmTotalCost: number | null;
  /** "Exposure by Asset Class" table; null when the workbook has none. */
  exposure: ExposureRow[] | null;
  sheetsRead: string[];
  /** Non-fatal observations worth showing in the preview. */
  notes: string[];
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
  if (u instanceof Date && Number.isNaN(u.getTime())) return true; // exceljs yields an invalid Date for text in a date-formatted formula cell
  if (typeof u === "object" && "richText" in u) return (u as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("").trim() === "";
  return false;
}
function describe(v: CellValue): string {
  const u = unwrap(v);
  if (u === null || u === undefined) return "blank";
  if (typeof u === "object" && "error" in u) return `error ${(u as ExcelJS.CellErrorValue).error}`;
  if (u instanceof Date) return Number.isNaN(u.getTime()) ? "invalid date" : `date ${u.toISOString().slice(0, 10)}`;
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
/** Excel error values (#REF!, #NUM!, #DIV/0!, #N/A, #VALUE!, #NAME?) in numeric cells → blank, reported in notes. */
function errorOf(v: CellValue): string | null {
  const u = unwrap(v);
  return u && typeof u === "object" && "error" in u ? String((u as ExcelJS.CellErrorValue).error) : null;
}
const errorCells: string[] = [];

function isNaToken(v: CellValue): boolean {
  const t = textOf(v);
  return t !== null && (NA_TOKENS as readonly string[]).includes(t.toLowerCase());
}
function numberOf(v: CellValue): number | null | { bad: string } {
  if (isBlank(v) || isNaToken(v)) return null;
  const u = unwrap(v);
  if (typeof u === "number") return Number.isFinite(u) ? u : { bad: describe(v) };
  return { bad: describe(v) };
}
function dateOf(v: CellValue): string | null | { bad: string } {
  if (isBlank(v)) return null;
  const u = unwrap(v);
  if (u instanceof Date) return Number.isNaN(u.getTime()) ? { bad: describe(v) } : u.toISOString().slice(0, 10);
  if (typeof u === "string") {
    const t = u.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return { bad: describe(v) };
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
const emptyFields = (): Record<NumericField, number | null> => ({ cost: null, contributions: null, distributions: null, nav: null, irr: null, moic: null });

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
  findRow(col: number, pred: (t: string) => boolean, from = 1, to = this.ws.rowCount): number | null {
    for (let r = from; r <= to; r++) {
      const t = norm(this.text(r, col));
      if (t && pred(t)) return r;
    }
    return null;
  }
  findCol(r: number, header: string): number | null {
    let found: number | null = null;
    this.ws.getRow(r).eachCell({ includeEmpty: false }, (cell, c) => {
      if (found === null && norm(textOf(cell.value)) === norm(header)) found = c;
    });
    return found;
  }
  /** First numeric cell to the right of column `col` on row r (skipping blanks/n-a); null when none. */
  firstNumberRight(r: number, col: number, what: string): number | null {
    const row = this.ws.getRow(r);
    let found: number | null = null;
    let seen = false;
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      if (seen || c <= col) return;
      const err = errorOf(cell.value);
      if (err) {
        seen = true;
        errorCells.push(`${this.addr(r, c)} (${what}) is ${err}`);
        return;
      }
      const n = numberOf(cell.value);
      if (n === null) return;
      seen = true;
      if (typeof n === "object") this.problems.push(`${this.addr(r, c)} (${what}) must be numeric, got ${n.bad}`);
      else found = n;
    });
    return found;
  }
  num(r: number, c: number, what: string): number | null {
    const err = errorOf(this.cell(r, c));
    if (err) {
      errorCells.push(`${this.addr(r, c)} (${what}) is ${err}`);
      return null;
    }
    const n = numberOf(this.cell(r, c));
    if (n !== null && typeof n === "object") {
      this.problems.push(`${this.addr(r, c)} (${what}) must be numeric, got ${n.bad}`);
      return null;
    }
    return n;
  }
}

function findSheet(wb: ExcelJS.Workbook, name: string, prefix = false): ExcelJS.Worksheet | undefined {
  return wb.worksheets.find((w) => (prefix ? norm(w.name).startsWith(norm(name)) : norm(w.name) === norm(name)));
}

/**
 * Load a workbook. Some .xlsm files carry Excel "table" definitions that ExcelJS cannot parse;
 * tables never affect cell values, so on failure they are stripped from the zip and the load retried.
 */
export async function loadWorkbook(buffer: Buffer | ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
    return wb;
  } catch (first) {
    let cleaned: Buffer;
    try {
      const zip = await JSZip.loadAsync(buffer as Buffer);
      const tables = Object.keys(zip.files).filter((n) => /^xl\/tables\/.*\.xml$/i.test(n));
      if (tables.length === 0) throw first;
      for (const t of tables) zip.remove(t);
      for (const n of Object.keys(zip.files)) {
        const f = zip.file(n);
        if (!f) continue;
        if (/^xl\/worksheets\/sheet\d+\.xml$/i.test(n)) {
          const xml = await f.async("string");
          if (/<tableParts/.test(xml)) zip.file(n, xml.replace(/<tableParts\b[^>]*\/>|<tableParts\b[^>]*>[\s\S]*?<\/tableParts>/g, ""));
        } else if (/^xl\/worksheets\/_rels\/.*\.rels$/i.test(n)) {
          const xml = await f.async("string");
          if (/\/table"/.test(xml)) zip.file(n, xml.replace(/<Relationship\b[^>]*\/table"[^>]*\/>/g, ""));
        } else if (n === "[Content_Types].xml") {
          const xml = await f.async("string");
          zip.file(n, xml.replace(/<Override\b[^>]*\/xl\/tables\/[^>]*\/>/g, ""));
        }
      }
      cleaned = await zip.generateAsync({ type: "nodebuffer" });
    } catch {
      throw new ParseError([`File is not a readable .xlsx/.xlsm workbook (${(first as Error).message})`]);
    }
    const wb2 = new ExcelJS.Workbook();
    try {
      await wb2.xlsx.load(cleaned as unknown as Parameters<typeof wb2.xlsx.load>[0]);
    } catch (e) {
      throw new ParseError([`File is not a readable .xlsx/.xlsm workbook (${(e as Error).message})`]);
    }
    return wb2;
  }
}

// =====================================================================
// Layout A: Dashboard
// =====================================================================
function readDashboard(ws: ExcelJS.Worksheet, problems: string[], notes: string[]) {
  const s = new SheetReader(ws, problems);
  const B = 2;
  const startsWith = (prefix: string) => (t: string) => t.startsWith(norm(prefix));
  const exact = (label: string) => (t: string) => t === norm(label);

  const fundName = textOf(ws.getCell(DASHBOARD.fundNameCell).value);
  if (!fundName) problems.push(`${s.name}!${DASHBOARD.fundNameCell} (fund name) is blank`);

  const asOfRow = s.findRow(B, startsWith(DASHBOARD.asOfLabel));
  let asOfDate: string | null = null;
  if (!asOfRow) problems.push(`${s.name}: no row in column B starting "${DASHBOARD.asOfLabel}"`);
  else {
    let found: string | null | { bad: string } = null;
    ws.getRow(asOfRow).eachCell({ includeEmpty: false }, (cell, c) => {
      if (c === B || found) return;
      const d = dateOf(cell.value);
      if (d !== null) found = d;
    });
    if (found === null) problems.push(`${s.name} row ${asOfRow}: no date cell found next to "${DASHBOARD.asOfLabel}"`);
    else if (typeof found === "object") problems.push(`${s.name} row ${asOfRow}: as-of date is ${(found as { bad: string }).bad}`);
    else asOfDate = found;
  }

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

  const hRow = s.findRow(B, exact(DASHBOARD.holdingHeader));
  const holdings: ParsedRow[] = [];
  let portfolioNavTotal: number | null = null;
  let holdingsEnd = hRow ?? 0;
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
          // Blank spacer rows are fine only if the next non-blank row is the Total row.
          let next = r + 1;
          while (next <= ws.rowCount && !s.text(next, B)) next++;
          if (next <= ws.rowCount && norm(s.text(next, B)).startsWith(norm(DASHBOARD.holdingTotalPrefix))) continue;
          problems.push(`${s.name} row ${r}: blank holding name before the "${DASHBOARD.holdingTotalPrefix}" row`);
          break;
        }
        if (norm(label).startsWith(norm(DASHBOARD.holdingTotalPrefix))) {
          portfolioNavTotal = s.num(r, cols.nav!, "portfolio NAV total");
          sawTotal = true;
          holdingsEnd = r;
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
            if (t && /^[A-Za-z][A-Za-z0-9 /&-]*$/.test(t)) holdingStatus = t;
            else problems.push(`${s.addr(r, cols.valuationDate!)} (valuation date) must be a date or a status word, got ${describe(vdRaw)}`);
          }
        }
        const realized = holdingStatus !== null && (REALIZED_WORDS as readonly string[]).includes(norm(holdingStatus));
        const fields = emptyFields();
        fields.nav = s.num(r, cols.nav!, `${label} NAV`);
        fields.irr = s.num(r, cols.irr!, `${label} IRR`);
        fields.moic = s.num(r, cols.moic!, `${label} MOIC`);
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
          realized,
          assetClass: null,
          missingFields: [],
          extra: {},
          sources: { nav: s.addr(r, cols.nav!), irr: s.addr(r, cols.irr!), moic: s.addr(r, cols.moic!) },
        });
      }
      if (!sawTotal && r > ws.rowCount) problems.push(`${s.name}: holdings table has no "${DASHBOARD.holdingTotalPrefix}" row`);
      if (holdings.length === 0) problems.push(`${s.name}: holdings table is empty`);
    }
  }

  // Exposure by asset class (optional section)
  let exposure: ExposureRow[] | null = null;
  const eRow = s.findRow(B, exact(EXPOSURE.sectionLabel), holdingsEnd + 1);
  if (eRow) {
    const head = s.findRow(B, exact(EXPOSURE.columns.assetClass), eRow + 1, eRow + 3);
    if (!head) problems.push(`${s.name}: "${EXPOSURE.sectionLabel}" has no "${EXPOSURE.columns.assetClass}" header row`);
    else {
      const cInv = s.findCol(head, EXPOSURE.columns.investmentNav);
      const cPct = s.findCol(head, EXPOSURE.columns.pct);
      const cFund = s.findCol(head, EXPOSURE.columns.fundNav);
      if (!cInv || !cFund) problems.push(`${s.name} row ${head}: expected "${EXPOSURE.columns.investmentNav}" and "${EXPOSURE.columns.fundNav}" headers`);
      else {
        exposure = [];
        let r = head + 1;
        let sawTotal = false;
        for (; r <= ws.rowCount; r++) {
          const label = s.text(r, B);
          if (!label) break;
          if (norm(label) === norm(EXPOSURE.totalLabel)) {
            sawTotal = true;
            break;
          }
          exposure.push({ assetClass: label, investmentNav: s.num(r, cInv, `${label} investment NAV`), pct: cPct ? s.num(r, cPct, `${label} %`) : null, fundNav: s.num(r, cFund, `${label} fund NAV`) });
        }
        if (!sawTotal) problems.push(`${s.name}: "${EXPOSURE.sectionLabel}" table has no "${EXPOSURE.totalLabel}" row`);
      }
    }
  } else notes.push(`No "${EXPOSURE.sectionLabel}" table in this workbook (added from July 2026); asset-class exposure stays blank.`);

  return { s, fundName, asOfDate, returns, classes, measureSrc, holdings, portfolioNavTotal, exposure };
}

function readMtm(wb: ExcelJS.Workbook, problems: string[]) {
  const ws = findSheet(wb, SHEETS.mtm);
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
  const srcCol = s.findCol(hRow, MTM.columns.source);
  const acCol = s.findCol(hRow, MTM.columns.assetClass);
  if (!costCol) {
    problems.push(`${s.name} row ${hRow}: missing column header "${MTM.columns.cost}"`);
    return null;
  }
  const byName = new Map<string, { cost: number | null; type: string | null; source: string | null; assetClass: string | null; valuationDate: string | null; src: string }>();
  let totalCost: number | null = null;
  for (let r = hRow + 1; r <= ws.rowCount; r++) {
    const name = s.text(r, 2);
    if (!name) continue;
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
    byName.set(norm(name), { cost: s.num(r, costCol, `${name} cost`), type: typeCol ? s.text(r, typeCol) : null, source: srcCol ? s.text(r, srcCol) : null, assetClass: acCol ? s.text(r, acCol) || null : null, valuationDate: vd, src: s.addr(r, costCol) });
  }
  return { byName, totalCost, sheet: s.name, hasAssetClass: !!acCol };
}

function readIrrDetail(wb: ExcelJS.Workbook, problems: string[]) {
  const ws = findSheet(wb, SHEETS.irrDetail);
  if (!ws) {
    problems.push(`Missing sheet "${SHEETS.irrDetail}"`);
    return null;
  }
  const s = new SheetReader(ws, problems);
  let hRow = 0;
  const blocks: { name: string; dateCol: number; cashCol: number }[] = [];
  for (let r = 1; r <= Math.min(ws.rowCount, 12) && hRow === 0; r++) {
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, c) => {
      if (norm(textOf(cell.value)) === norm(IRR_DETAIL.dateHeader) && norm(s.text(r, c + 1)) === norm(IRR_DETAIL.cashHeader)) {
        hRow = r;
        const name = s.text(r - 1, c);
        if (name) blocks.push({ name, dateCol: c, cashCol: c + 1 });
        else problems.push(`${s.addr(r - 1, c)}: expected an investment name above the "Date" header`);
      }
    });
  }
  if (hRow === 0) {
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
    for (let r = hRow + 1; r < termRow; r++) {
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
    byName.set(norm(b.name), { contributions, distributions, flows, src: `${s.name}!${colLetter(b.cashCol)}${hRow + 1}:${colLetter(b.cashCol)}${termRow - 1}` });
  }
  return { byName, sheet: s.name };
}

async function parseDashboardLayout(wb: ExcelJS.Workbook, dashWs: ExcelJS.Worksheet): Promise<ParsedWorkbook> {
  const problems: string[] = [];
  const notes: string[] = [];
  const dash = readDashboard(dashWs, problems, notes);
  const mtm = readMtm(wb, problems);
  const irr = readIrrDetail(wb, problems);
  if (problems.length) throw new ParseError(problems);
  const asOfDate = dash.asOfDate!;
  const fundName = dash.fundName!;

  const seen = new Map<string, number>();
  for (const h of dash.holdings) {
    const key = norm(h.name);
    const dup = seen.get(key);
    if (dup) problems.push(`${dash.s.name}: duplicate holding "${h.name}" on rows ${dup} and ${h.row}`);
    seen.set(key, h.row);
    h.asOfDate = asOfDate;
    const m = mtm?.byName.get(key);
    if (m) {
      h.fields.cost = m.cost;
      h.sources.cost = m.src;
      if (m.type) h.extra["Investment Type"] = m.type;
      if (m.source) h.extra["Valuation source"] = m.source;
      if (m.assetClass) h.assetClass = m.assetClass;
      if (!h.valuationDate && m.valuationDate) {
        h.valuationDate = m.valuationDate;
        h.sources.valuationDate = `${mtm!.sheet} (${MTM.columns.valuationDate})`;
      }
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
  if (mtm && !mtm.hasAssetClass) notes.push(`No "${MTM.columns.assetClass}" column on ${mtm.sheet}; holdings keep their current asset class.`);

  const total = dash.classes.total;
  const fund: ParsedFund = {
    sheet: dash.s.name,
    row: 2,
    externalId: null,
    name: fundName,
    fundName,
    fundExternalId: null,
    asOfDate,
    fields: { cost: mtm?.totalCost ?? null, contributions: total.called, distributions: total.distributions, nav: total.nav, irr: dash.returns.total.irr, moic: dash.returns.total.moic },
    valuationDate: null,
    holdingStatus: null,
    realized: false,
    assetClass: null,
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
    layout: "dashboard",
    asOfDate,
    funds: [fund],
    investments: dash.holdings,
    portfolioNavTotal: dash.portfolioNavTotal,
    mtmTotalCost: mtm?.totalCost ?? null,
    exposure: dash.exposure,
    sheetsRead: [dash.s.name, mtm?.sheet, irr?.sheet].filter((x): x is string => !!x),
    notes,
  };
}

// =====================================================================
// Layout B: Winddown (no dashboard tab)
// =====================================================================
async function parseWinddownLayout(wb: ExcelJS.Workbook): Promise<ParsedWorkbook> {
  const problems: string[] = [];
  const notes: string[] = [`Winddown layout: no "${SHEETS.dashboard}" tab. Fund figures come from "${SHEETS.tbRecalc}", holdings from "${SHEETS.mtm}" and "${SHEETS.irr}". Commitments, gross/net returns, total value and asset-class exposure are not in this file.`];
  const tbWs = findSheet(wb, SHEETS.tbRecalc);
  const mtmWs = findSheet(wb, SHEETS.mtm);
  const irrWs = findSheet(wb, SHEETS.irr);
  const valWs = findSheet(wb, SHEETS.valuation);
  for (const [n, w] of [[SHEETS.tbRecalc, tbWs], [SHEETS.mtm, mtmWs], [SHEETS.irr, irrWs]] as const) if (!w) problems.push(`Missing sheet "${n}" (sheets found: ${wb.worksheets.map((x) => `"${x.name}"`).join(", ")})`);
  if (problems.length) throw new ParseError(problems);

  // --- TB Recalc: fund-level
  const tb = new SheetReader(tbWs!, problems);
  const fundName = textOf(tbWs!.getCell(WINDDOWN.fundNameCell).value);
  if (!fundName) problems.push(`${tb.name}!${WINDDOWN.fundNameCell} (fund name) is blank`);
  const tbValue = (label: string, required: boolean): { value: number | null; src: string } => {
    const r = tb.findRow(2, (t) => t === norm(label));
    if (!r) {
      if (required) problems.push(`${tb.name}: no row "${label}" in column B`);
      return { value: null, src: "" };
    }
    return { value: tb.firstNumberRight(r, 2, label), src: `${tb.name} row ${r}` };
  };
  const contrib = tbValue(WINDDOWN.tb.contributions, true);
  const roc = tbValue(WINDDOWN.tb.returnOfCapital, false);
  const dist = tbValue(WINDDOWN.tb.distributions, true);
  const red = tbValue(WINDDOWN.tb.redemptions, true);
  const nav = tbValue(WINDDOWN.tb.nav, true);
  const carry = tbValue(WINDDOWN.tb.carryDistributions, false);

  // --- IRR: as-of + holding blocks
  const irr = new SheetReader(irrWs!, problems);
  const asOf = dateOf(irrWs!.getCell(WINDDOWN.irr.asOfCell).value);
  let asOfDate: string | null = null;
  if (typeof asOf === "string") asOfDate = asOf;
  else problems.push(`${irr.name}!${WINDDOWN.irr.asOfCell} (as-of date) is ${asOf === null ? "blank" : asOf.bad}`);
  let hRow = 0;
  const blocks: { name: string; dateCol: number; amtCol: number; descCol: number }[] = [];
  for (let r = 1; r <= Math.min(irrWs!.rowCount, 6) && hRow === 0; r++) {
    irrWs!.getRow(r).eachCell({ includeEmpty: false }, (cell, c) => {
      if (norm(textOf(cell.value)) === norm(WINDDOWN.irr.dateHeader) && norm(irr.text(r, c + 1)) === norm(WINDDOWN.irr.amountHeader)) {
        hRow = r;
        const name = irr.text(r - 1, c + 1) ?? irr.text(r - 1, c);
        if (name) blocks.push({ name, dateCol: c, amtCol: c + 1, descCol: c + 2 });
        else problems.push(`${irr.addr(r - 1, c + 1)}: expected an investment name above the "${WINDDOWN.irr.amountHeader}" header`);
      }
    });
  }
  if (hRow === 0) problems.push(`${irr.name}: no "${WINDDOWN.irr.dateHeader}" / "${WINDDOWN.irr.amountHeader}" header row found (rows 1-6)`);
  if (problems.length) throw new ParseError(problems);

  interface Block { irr: number | null; moic: number | null; contributions: number | null; distributions: number | null; value: number | null; flows: number; src: string }
  const irrByName = new Map<string, Block>();
  for (const b of blocks) {
    // find the terminal "Value" row for this block
    let valueRow: number | null = null;
    for (let r = hRow + 1; r <= irrWs!.rowCount; r++) {
      if (norm(irr.text(r, b.descCol)) === norm(WINDDOWN.irr.terminal.value) && !isBlank(irr.cell(r, b.dateCol))) {
        valueRow = r;
        break;
      }
    }
    if (!valueRow) {
      problems.push(`${irr.name}: block "${b.name}" has no "${WINDDOWN.irr.terminal.value}" row in its Description column`);
      continue;
    }
    let flows = 0;
    for (let r = hRow + 1; r < valueRow; r++) {
      const v = irr.cell(r, b.amtCol);
      if (isBlank(v)) continue;
      const n = numberOf(v);
      if (n === null || typeof n === "object") problems.push(`${irr.addr(r, b.amtCol)} (${b.name} cash flow) must be numeric, got ${describe(v)}`);
      else flows++;
    }
    const term = (label: string, what: string): number | null => {
      for (let r = valueRow!; r <= Math.min(valueRow! + 8, irrWs!.rowCount); r++) if (norm(irr.text(r, b.descCol)) === norm(label)) return irr.num(r, b.amtCol, `${b.name} ${what}`);
      problems.push(`${irr.name}: block "${b.name}" has no "${label}" row under its "${WINDDOWN.irr.terminal.value}" row`);
      return null;
    };
    const contributions = term(WINDDOWN.irr.terminal.contribution, "contribution");
    const distributions = term(WINDDOWN.irr.terminal.distribution, "distribution");
    irrByName.set(norm(b.name), {
      irr: term(WINDDOWN.irr.terminal.irr, "IRR"),
      moic: term(WINDDOWN.irr.terminal.moic, "MOIC"),
      contributions: contributions === null ? null : Math.abs(contributions), // shown negative in the file
      distributions,
      value: irr.num(valueRow, b.amtCol, `${b.name} value`),
      flows,
      src: `${irr.name}!${colLetter(b.amtCol)}${valueRow}`,
    });
  }

  // --- MTM: live holdings
  const mtm = new SheetReader(mtmWs!, problems);
  const mHead = mtm.findRow(2, (t) => t === norm(WINDDOWN.mtm.header), 1, 10) ?? mtm.findRow(4, (t) => t === norm(WINDDOWN.mtm.header), 1, 10);
  interface MtmRow { row: number; nav: number | null; cost: number | null; irr: number | null; moic: number | null; manager: string | null; navSrc: string; costSrc: string }
  const mtmByName = new Map<string, MtmRow>();
  let mtmTotalCost: number | null = null;
  let mtmTotalNav: number | null = null;
  if (!mHead) problems.push(`${mtm.name}: no header row with "${WINDDOWN.mtm.header}" (rows 1-10)`);
  else {
    const nameCol = mtm.findCol(mHead, WINDDOWN.mtm.header)!;
    const navCol = mtm.findCol(mHead, WINDDOWN.mtm.columns.nav);
    const costCol = mtm.findCol(mHead, WINDDOWN.mtm.columns.cost);
    const irrCol = mtm.findCol(mHead, WINDDOWN.mtm.columns.irr);
    const moicCol = mtm.findCol(mHead, WINDDOWN.mtm.columns.moic);
    const mgrCol = mtm.findCol(mHead, WINDDOWN.mtm.columns.manager);
    if (!navCol || !costCol) problems.push(`${mtm.name} row ${mHead}: expected "${WINDDOWN.mtm.columns.nav}" and "${WINDDOWN.mtm.columns.cost}" headers`);
    else {
      for (let r = mHead + 1; r <= mtmWs!.rowCount; r++) {
        const name = mtm.text(r, nameCol);
        if (!name) continue;
        if (norm(name) === norm(WINDDOWN.mtm.total)) {
          mtmTotalCost = mtm.num(r, costCol, "MTM total cost");
          mtmTotalNav = mtm.num(r, navCol, "MTM total value");
          break;
        }
        if (mtmByName.has(norm(name))) problems.push(`${mtm.name} row ${r}: duplicate investment "${name}"`);
        mtmByName.set(norm(name), {
          row: r,
          nav: mtm.num(r, navCol, `${name} value`),
          cost: mtm.num(r, costCol, `${name} cost`),
          irr: irrCol ? mtm.num(r, irrCol, `${name} IRR`) : null,
          moic: moicCol ? mtm.num(r, moicCol, `${name} MOIC`) : null,
          manager: mgrCol ? mtm.text(r, mgrCol) : null,
          navSrc: mtm.addr(r, navCol),
          costSrc: mtm.addr(r, costCol),
        });
      }
    }
  }

  // --- Valuation: mark dates (optional)
  const markDates = new Map<string, string>();
  if (valWs && asOfDate) {
    const v = new SheetReader(valWs, problems);
    const vh = v.findRow(2, (t) => t === norm(WINDDOWN.valuation.investment), 1, 10);
    if (vh) {
      const dCol = v.findCol(vh, WINDDOWN.valuation.markDate);
      if (dCol) {
        for (let r = vh + 1; r <= valWs.rowCount; r++) {
          const name = v.text(r, 2);
          if (!name) continue;
          const raw = v.cell(r, dCol);
          const t = textOf(raw);
          if (t && norm(t) === norm(WINDDOWN.valuation.currentMonth)) markDates.set(norm(name), asOfDate);
          else {
            const d = dateOf(raw);
            if (typeof d === "string") markDates.set(norm(name), d);
          }
        }
      }
    }
  }
  if (problems.length) throw new ParseError(problems);

  // --- Merge holdings: MTM rows ∪ IRR blocks
  const names = new Map<string, string>();
  for (const [k, m] of mtmByName) names.set(k, mtmWs!.getRow(m.row).getCell(mtm.findCol(mHead!, WINDDOWN.mtm.header)!).text.trim());
  for (const b of blocks) if (!names.has(norm(b.name))) names.set(norm(b.name), b.name);
  const holdings: ParsedRow[] = [];
  let rowSeq = 0;
  for (const [key, name] of names) {
    const m = mtmByName.get(key);
    const b = irrByName.get(key);
    const fields = emptyFields();
    const sources: Record<string, string> = {};
    fields.nav = m ? m.nav : b ? b.value : null;
    if (m) sources.nav = m.navSrc;
    else if (b) sources.nav = b.src;
    fields.cost = m?.cost ?? null;
    if (m) sources.cost = m.costSrc;
    fields.irr = b?.irr ?? m?.irr ?? null;
    fields.moic = b?.moic ?? m?.moic ?? null;
    if (b) sources.irr = sources.moic = b.src;
    else if (m) {
      sources.irr = `${mtm.name} row ${m.row}`;
      sources.moic = sources.irr;
      if (m.irr !== null && m.irr === m.moic) notes.push(`${name}: the ${mtm.name} sheet's IRR column equals its MOIC column (no IRR block on "${SHEETS.irr}"); stored as received.`);
    }
    fields.contributions = b?.contributions ?? null;
    fields.distributions = b?.distributions ?? null;
    if (b) sources.contributions = sources.distributions = b.src;
    const realized = !m && !!b && (b.value === null || b.value === 0);
    const extra: Record<string, ExtraValue> = {};
    if (m?.manager) extra["Manager"] = m.manager;
    if (b) extra["Cash flows"] = b.flows;
    holdings.push({
      sheet: m ? mtm.name : irr.name,
      row: m ? m.row : ++rowSeq,
      externalId: null,
      name,
      fundName: fundName ?? null,
      fundExternalId: null,
      asOfDate: asOfDate!,
      fields,
      valuationDate: markDates.get(key) ?? null,
      holdingStatus: realized ? "Closed" : null,
      realized,
      assetClass: null,
      missingFields: NUMERIC_FIELDS.filter((f) => fields[f] === null),
      extra,
      sources,
    });
  }
  if (holdings.length === 0) problems.push(`No holdings found on "${SHEETS.mtm}" or "${SHEETS.irr}"`);
  if (problems.length) throw new ParseError(problems);

  const called = contrib.value === null ? null : Math.abs(contrib.value);
  const distributions = dist.value === null ? null : Math.abs(dist.value) + (roc.value === null ? 0 : Math.abs(roc.value));
  const redemptions = red.value === null ? null : Math.abs(red.value);
  const classes = {} as Record<ClassKey, Record<MeasureKey, number | null>>;
  for (const k of Object.keys(DASHBOARD.classColumns) as ClassKey[]) classes[k] = { commitments: null, called: null, distributions: null, redemptions: null, nav: null, totalValue: null };
  classes.total = { commitments: null, called, distributions, redemptions, nav: nav.value, totalValue: null };
  if (carry.value !== null) classes.gpCarry.distributions = Math.abs(carry.value);

  const fund: ParsedFund = {
    sheet: tb.name,
    row: 1,
    externalId: null,
    name: fundName!,
    fundName: fundName!,
    fundExternalId: null,
    asOfDate: asOfDate!,
    fields: { cost: mtmTotalCost, contributions: called, distributions, nav: nav.value, irr: null, moic: null },
    valuationDate: null,
    holdingStatus: null,
    realized: false,
    assetClass: null,
    missingFields: [],
    extra: {},
    sources: { cost: `${mtm.name} Total`, contributions: contrib.src, distributions: `${dist.src}${roc.value !== null ? ` + ${roc.src}` : ""}`, nav: nav.src, redemptions: red.src, gpCarryDistributions: carry.src },
    fundFields: { commitments: null, redemptions, totalValue: null, irrGross: null, moicGross: null, irrNet: null, moicNet: null },
    classes,
  };
  fund.missingFields = NUMERIC_FIELDS.filter((f) => fund.fields[f] === null);

  return {
    layout: "winddown",
    asOfDate: asOfDate!,
    funds: [fund],
    investments: holdings,
    portfolioNavTotal: mtmTotalNav,
    mtmTotalCost,
    exposure: null,
    sheetsRead: [tb.name, mtm.name, irr.name, ...(valWs ? [valWs.name] : [])],
    notes,
  };
}

/** Parse a workbook buffer. Throws ParseError listing every problem found. */
export async function parseWorkbook(buffer: Buffer | ArrayBuffer): Promise<ParsedWorkbook> {
  errorCells.length = 0;
  const wb = await loadWorkbook(buffer);
  const dashWs = findSheet(wb, SHEETS.dashboard, true);
  const parsed = dashWs ? await parseDashboardLayout(wb, dashWs) : findSheet(wb, SHEETS.tbRecalc) && findSheet(wb, SHEETS.irr) ? await parseWinddownLayout(wb) : null;
  if (parsed) {
    if (errorCells.length) parsed.notes.push(`Excel error values stored as blank: ${errorCells.join("; ")}`);
    return parsed;
  }
  throw new ParseError([`No "${SHEETS.dashboard}*" sheet and no "${SHEETS.tbRecalc}" + "${SHEETS.irr}" pair found (sheets: ${wb.worksheets.map((w) => `"${w.name}"`).join(", ")})`]);
}
