import ExcelJS from "exceljs";

export type Cell = string | number | Date | null | { formula: string; result: unknown } | { error: string };

export interface SheetDef {
  name: string;
  header: string[];
  rows: Cell[][];
}

export async function buildWorkbook(sheets: SheetDef[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    ws.addRow(s.header);
    for (const r of s.rows) {
      const row = ws.addRow([]);
      r.forEach((v, i) => {
        if (v === null) return;
        row.getCell(i + 1).value = v as ExcelJS.CellValue;
      });
      row.commit();
    }
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

export const FUND_HEADER = ["Fund ID", "Fund Name", "As Of Date", "Contributions", "Distributions", "NAV", "IRR", "MOIC"];
export const INV_HEADER = [
  "Investment ID",
  "Investment Name",
  "Fund ID",
  "Fund Name",
  "As Of Date",
  "Cost",
  "Contributions",
  "Distributions",
  "NAV",
  "IRR",
  "MOIC",
];

export const asOf = new Date(Date.UTC(2026, 6, 31));

export function goodSheets(): SheetDef[] {
  return [
    {
      name: "Funds",
      header: FUND_HEADER,
      rows: [
        ["F1", "Demo Fund I", asOf, 100, 30, 120, 0.15, 1.5],
        ["F2", "Demo Fund II", asOf, 50, 0, 55, 0.08, 1.1],
      ],
    },
    {
      name: "Investments",
      header: INV_HEADER,
      rows: [
        ["I1", "Alpha Co", "F1", "Demo Fund I", asOf, 60, 60, 30, 70, 0.2, 1.67],
        ["I2", "Beta Co", "F1", "Demo Fund I", asOf, 40, 40, 0, 50, 0.1, 1.25],
        ["I3", "Gamma Co", "F2", "Demo Fund II", asOf, 50, 50, 0, 55, 0.08, 1.1],
      ],
    },
  ];
}
