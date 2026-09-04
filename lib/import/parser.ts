// Monthly accounting workbook parser. Fails loudly; never coerces; never skips silently.
// Layout assumptions live in ./schema.ts (PROVISIONAL — see TODO there).
import ExcelJS from "exceljs";
import {
  FUND_COLUMNS,
  FUND_REQUIRED,
  INVESTMENT_COLUMNS,
  INVESTMENT_REQUIRED,
  NUMERIC_FIELDS,
  SHEETS,
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

export interface ParsedRow {
  sheet: string;
  row: number;
  externalId: string | null;
  name: string;
  fundName: string | null;
  fundExternalId: string | null;
  asOfDate: string; // ISO yyyy-mm-dd
  fields: Record<NumericField, number | null>;
  /** Names of numeric fields whose cell was blank in this workbook. */
  missingFields: NumericField[];
  /** Any columns beyond the known schema, verbatim. */
  extra: Record<string, ExtraValue>;
}

export interface ParsedWorkbook {
  asOfDate: string; // ISO yyyy-mm-dd
  funds: ParsedRow[];
  investments: ParsedRow[];
  /** Which optional known columns were present, per sheet. */
  columns: { funds: string[]; investments: string[] };
}

type CellValue = ExcelJS.CellValue;

function isBlank(v: CellValue): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (typeof v === "object" && "formula" in v) return isBlank((v as ExcelJS.CellFormulaValue).result as CellValue);
  if (typeof v === "object" && "richText" in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("").trim() === "";
  }
  return false;
}

function describe(v: CellValue): string {
  if (v === null || v === undefined) return "blank";
  if (typeof v === "object" && "formula" in v) return `formula result ${describe((v as ExcelJS.CellFormulaValue).result as CellValue)}`;
  if (typeof v === "object" && "error" in v) return `error ${(v as ExcelJS.CellErrorValue).error}`;
  if (v instanceof Date) return `date ${v.toISOString().slice(0, 10)}`;
  if (typeof v === "object") return `${JSON.stringify(v)}`;
  return `${typeof v} ${JSON.stringify(v)}`;
}

/** Returns a finite number, or throws a descriptive string (caller wraps). */
function asNumber(v: CellValue): number | { bad: string } {
  if (typeof v === "number") return Number.isFinite(v) ? v : { bad: describe(v) };
  if (typeof v === "object" && v !== null && "formula" in v) return asNumber((v as ExcelJS.CellFormulaValue).result as CellValue);
  return { bad: describe(v) };
}

function asText(v: CellValue): string | { bad: string } {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && v !== null) {
    if ("formula" in v) return asText((v as ExcelJS.CellFormulaValue).result as CellValue);
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("").trim();
    if ("text" in v) return String((v as ExcelJS.CellHyperlinkValue).text).trim();
  }
  return { bad: describe(v) };
}

function asISODate(v: CellValue): string | { bad: string } {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? { bad: describe(v) } : v.toISOString().slice(0, 10);
  if (typeof v === "object" && v !== null && "formula" in v) return asISODate((v as ExcelJS.CellFormulaValue).result as CellValue);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
    const d = new Date(`${v.trim()}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? { bad: describe(v) } : v.trim();
  }
  return { bad: describe(v) };
}

function extraValue(v: CellValue): ExtraValue {
  if (isBlank(v)) return null;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  const t = asText(v);
  if (typeof t === "string") return t;
  const n = asNumber(v);
  return typeof n === "number" ? n : describe(v);
}

interface SheetSpec {
  sheetName: string;
  columns: Record<string, string>;
  required: readonly string[];
}

function readSheet(wb: ExcelJS.Workbook, spec: SheetSpec, problems: string[]): { rows: ParsedRow[]; present: string[] } {
  const ws = wb.getWorksheet(spec.sheetName);
  if (!ws) {
    problems.push(`Missing sheet "${spec.sheetName}" (sheets found: ${wb.worksheets.map((w) => `"${w.name}"`).join(", ") || "none"})`);
    return { rows: [], present: [] };
  }

  // Header row → column index map (1-based), case-insensitive.
  const headerRow = ws.getRow(1);
  const headerIndex = new Map<string, number>();
  const seen = new Map<string, string>();
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    const t = asText(cell.value);
    if (typeof t !== "string" || t === "") return;
    const key = t.toLowerCase();
    if (seen.has(key)) {
      problems.push(`Sheet "${spec.sheetName}": duplicate header "${t}" (columns ${seen.get(key)} and ${cell.address})`);
      return;
    }
    seen.set(key, cell.address);
    headerIndex.set(key, col);
  });
  if (headerIndex.size === 0) {
    problems.push(`Sheet "${spec.sheetName}": header row 1 is empty`);
    return { rows: [], present: [] };
  }

  const fieldCol: Record<string, number | undefined> = {};
  for (const [field, header] of Object.entries(spec.columns)) fieldCol[field] = headerIndex.get(header.toLowerCase());
  const problemsBeforeHeaderCheck = problems.length;
  for (const field of spec.required) {
    if (!fieldCol[field]) problems.push(`Sheet "${spec.sheetName}": missing required column "${spec.columns[field]}"`);
  }
  if (problems.length > problemsBeforeHeaderCheck) return { rows: [], present: [] };

  const knownCols = new Set(Object.values(fieldCol).filter((c): c is number => !!c));
  const extraHeaders: { col: number; header: string }[] = [];
  for (const [key, col] of headerIndex) if (!knownCols.has(col)) extraHeaders.push({ col, header: headerRow.getCell(col).text.trim() || key });

  const rows: ParsedRow[] = [];
  const lastRow = ws.actualRowCount || ws.rowCount;
  let sawBlankAt: number | null = null;

  for (let r = 2; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const allBlank = [...headerIndex.values()].every((c) => isBlank(row.getCell(c).value));
    if (allBlank) {
      if (sawBlankAt === null) sawBlankAt = r;
      continue;
    }
    if (sawBlankAt !== null) {
      problems.push(`Sheet "${spec.sheetName}": blank row ${sawBlankAt} inside the data block (data resumes at row ${r}). Remove blank rows or the total block.`);
      return { rows: [], present: [] };
    }

    const get = (field: string): CellValue => (fieldCol[field] ? row.getCell(fieldCol[field]!).value : null);

    const nameV = asText(get("name"));
    if (typeof nameV !== "string" || nameV === "") {
      problems.push(`Sheet "${spec.sheetName}" row ${r}: "${spec.columns.name}" is ${typeof nameV === "string" ? "blank" : nameV.bad}`);
      continue;
    }

    const asOf = asISODate(get("asOfDate"));
    if (typeof asOf !== "string") {
      problems.push(`Sheet "${spec.sheetName}" row ${r}: "${spec.columns.asOfDate}" must be a date cell or yyyy-mm-dd text, got ${asOf.bad}`);
    }

    const fields = {} as Record<NumericField, number | null>;
    const missing: NumericField[] = [];
    for (const f of NUMERIC_FIELDS) {
      if (!fieldCol[f]) {
        fields[f] = null; // column not in this workbook
        missing.push(f);
        continue;
      }
      const v = get(f);
      if (isBlank(v)) {
        fields[f] = null;
        missing.push(f);
        continue;
      }
      const n = asNumber(v);
      if (typeof n === "number") fields[f] = n;
      else {
        fields[f] = null;
        problems.push(`Sheet "${spec.sheetName}" row ${r}: "${spec.columns[f]}" must be numeric, got ${n.bad}`);
      }
    }

    const optText = (field: string): string | null => {
      if (!fieldCol[field]) return null;
      const v = get(field);
      if (isBlank(v)) return null;
      const t = asText(v);
      if (typeof t === "string") return t;
      problems.push(`Sheet "${spec.sheetName}" row ${r}: "${spec.columns[field]}" must be text, got ${t.bad}`);
      return null;
    };

    const extra: Record<string, ExtraValue> = {};
    for (const { col, header } of extraHeaders) extra[header] = extraValue(row.getCell(col).value);

    rows.push({
      sheet: spec.sheetName,
      row: r,
      externalId: optText("externalId"),
      name: nameV,
      fundName: fieldCol.fundName ? optText("fundName") : null,
      fundExternalId: fieldCol.fundExternalId ? optText("fundExternalId") : null,
      asOfDate: typeof asOf === "string" ? asOf : "",
      fields,
      missingFields: missing,
      extra,
    });
  }

  if (rows.length === 0 && problems.length === problemsBeforeHeaderCheck) problems.push(`Sheet "${spec.sheetName}": no data rows found below the header`);
  const present = Object.entries(fieldCol).filter(([, c]) => !!c).map(([f]) => f);
  return { rows, present };
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
  const funds = readSheet(wb, { sheetName: SHEETS.funds, columns: FUND_COLUMNS, required: FUND_REQUIRED }, problems);
  const investments = readSheet(
    wb,
    { sheetName: SHEETS.investments, columns: INVESTMENT_COLUMNS, required: INVESTMENT_REQUIRED },
    problems,
  );
  if (problems.length) throw new ParseError(problems);

  const dates = new Set([...funds.rows, ...investments.rows].map((r) => r.asOfDate));
  if (dates.size !== 1) {
    throw new ParseError([`"As Of Date" must be the same on every row of every sheet; found ${[...dates].sort().join(", ")}`]);
  }
  const asOfDate = [...dates][0];

  // Duplicate names within a sheet are ambiguous for matching → abort.
  for (const [label, rows] of [["Funds", funds.rows], ["Investments", investments.rows]] as const) {
    const byKey = new Map<string, number>();
    for (const r of rows) {
      const key = (r.externalId ? `id:${r.externalId}` : `name:${r.name}`) + (label === "Investments" ? `|${r.fundName ?? ""}` : "");
      const prev = byKey.get(key);
      if (prev) problems.push(`Sheet "${label}": duplicate ${r.externalId ? "ID" : "name"} "${r.externalId ?? r.name}" on rows ${prev} and ${r.row}`);
      byKey.set(key, r.row);
    }
  }
  if (problems.length) throw new ParseError(problems);

  return { asOfDate, funds: funds.rows, investments: investments.rows, columns: { funds: funds.present, investments: investments.present } };
}
