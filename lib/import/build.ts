// Builds workbooks in accounting's real layout (see ./schema.ts). Used by tests and the demo seed only — never by the import path.
import ExcelJS from "exceljs";

export interface HoldingSpec {
  name: string;
  valuationDate: Date | string | null; // Date for live holdings, a status word ("Closed") for realized
  nav: number | null;
  irr: number | null;
  moic: number | null;
  cost: number | null; // MTM row; null = not on MTM sheet
  type?: string | null;
  assetClass?: string | null;
  flows: { date: Date; cash: number | string }[]; // IRR Detail block; negative = contribution
  onIrrDetail?: boolean; // default true
}

export interface ClassRow {
  nonAffiliate: number | null;
  affiliate: number | null;
  gpCarry: number | null;
  total: number | null;
}

export interface ExposureSpec {
  assetClass: string;
  investmentNav: number | null;
  pct: number | null;
  fundNav: number | null;
}

export interface WorkbookSpec {
  fundName: string;
  asOf: Date | string;
  returns: { gross: [number | null, number | null]; net: [number | null, number | null]; total: [number | null, number | null] }; // [irr, moic]
  measures: Record<"commitments" | "called" | "distributions" | "redemptions" | "nav" | "totalValue", ClassRow>;
  holdings: HoldingSpec[];
  portfolioNavTotal?: number | null | "sum";
  mtmTotalCost?: number | null | "sum";
  /** "Exposure by Asset Class" table (July 2026 onward). Omit to leave it out, as June's file did. */
  exposure?: ExposureSpec[];
  /** Insert a blank spacer row between the last holding and the Total row (FAP VI does this). */
  spacerBeforeTotal?: boolean;
  /** Test hooks to break the layout. */
  mutate?: (wb: ExcelJS.Workbook) => void;
  sheetNames?: Partial<{ dashboard: string; mtm: string; irrDetail: string }>;
  labels?: Partial<Record<string, string>>;
}

export const asOf = new Date(Date.UTC(2026, 5, 30));
const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

export function goodSpec(): WorkbookSpec {
  return {
    fundName: "Demo Advantage Partners I LP",
    asOf,
    returns: { gross: [0.2586, 2.18], net: [0.2152, 1.96], total: [0.2497, 2.13] },
    measures: {
      commitments: { nonAffiliate: 238_500_000, affiliate: 16_592_500, gpCarry: null, total: 255_092_500 },
      called: { nonAffiliate: 238_800_000, affiliate: 17_042_500, gpCarry: null, total: 255_842_500 },
      distributions: { nonAffiliate: 215_378_855.1, affiliate: 16_857_578, gpCarry: 23_296_527.9, total: 255_532_961 },
      redemptions: { nonAffiliate: 621_679.56, affiliate: 325_583.52, gpCarry: 18_825.3, total: 966_088.38 },
      nav: { nonAffiliate: 251_332_687.53, affiliate: 19_950_561.76, gpCarry: 17_014_038.95, total: 288_297_288.24 },
      totalValue: { nonAffiliate: 467_333_222.19, affiliate: 37_133_723.28, gpCarry: 40_329_392.15, total: 544_796_337.62 },
    },
    holdings: [
      { name: "Alpha Energy Fund II, LP", valuationDate: d(2026, 3, 31), nav: 7_760_738.86, irr: 0.1248, moic: (4_677_555.54 + 7_760_738.86) / 8_671_368.39, cost: 8_671_368.39, type: "Other Fund", assetClass: "Energy", flows: [{ date: d(2021, 12, 22), cash: -2_645_019.48 }, { date: d(2022, 3, 31), cash: -6_026_348.91 }, { date: d(2023, 6, 15), cash: 4_677_555.54 }] },
      { name: "Beta Production Partners LP", valuationDate: d(2026, 3, 31), nav: 14_504_492, irr: 0.2236, moic: (12_846_786 + 14_504_492) / 14_757_121, cost: 15_023_087, type: "Other Fund", flows: [{ date: d(2022, 5, 19), cash: -14_757_121 }, { date: d(2024, 1, 9), cash: 12_846_786 }] },
      { name: "Gamma Holdings LLC", valuationDate: "Closed", nav: null, irr: -0.0694, moic: 15_947_822.8 / 18_078_636, cost: null, type: "JV Interest", flows: [{ date: d(2021, 12, 22), cash: -18_078_636 }, { date: d(2025, 3, 25), cash: 15_947_822.8 }] },
    ],
    portfolioNavTotal: "sum",
    mtmTotalCost: "sum",
  };
}

export async function buildWorkbook(spec: WorkbookSpec): Promise<Buffer> {
  const wb = await buildExcel(spec);
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

export async function buildExcel(spec: WorkbookSpec): Promise<ExcelJS.Workbook> {
  const L = { returnBasis: "Return Basis", measure: "Measure", holding: "Holding", asOf: "As-of date (parsed from file name)", total: "Total / Portfolio", ...spec.labels };
  const names = { dashboard: "Dashboard", mtm: "MTM", irrDetail: "IRR Detail", ...spec.sheetNames };
  const wb = new ExcelJS.Workbook();
  const asOfDate = typeof spec.asOf === "string" ? spec.asOf : spec.asOf;

  // ---- Dashboard ----
  const ds = wb.addWorksheet(names.dashboard);
  ds.getCell("B2").value = spec.fundName;
  ds.getCell("B3").value = "Executive Dashboard";
  ds.getCell("B5").value = "Fund Performance (Inception to Date)";
  ds.getCell("B6").value = L.returnBasis;
  ds.getCell("E6").value = "IRR";
  ds.getCell("F6").value = "MOIC";
  ds.getCell("B7").value = "Fund Gross (Affiliate basis, no fees, no carry)";
  ds.getCell("E7").value = spec.returns.gross[0];
  ds.getCell("F7").value = spec.returns.gross[1];
  ds.getCell("B8").value = "Fund Net (LP, net of fees and carry)";
  ds.getCell("E8").value = spec.returns.net[0];
  ds.getCell("F8").value = spec.returns.net[1];
  ds.getCell("B9").value = "Total Fund (all partners, including GP carry)";
  ds.getCell("E9").value = spec.returns.total[0];
  ds.getCell("F9").value = spec.returns.total[1];
  ds.getCell("B10").value = "Gross is measured on the affiliate class…";
  ds.getCell("B12").value = "Capital & Distributions (Inception to Date)";
  ds.getCell("B13").value = L.measure;
  ds.getCell("C13").value = "Non-Affiliate";
  ds.getCell("D13").value = "Affiliate";
  ds.getCell("E13").value = "GP Carry";
  ds.getCell("F13").value = "Fund Total";
  const mrows: [string, keyof WorkbookSpec["measures"]][] = [
    ["Total Commitments", "commitments"],
    ["Called Capital", "called"],
    ["Distributions (income, ROC, tax withheld)", "distributions"],
    ["Redemptions", "redemptions"],
    ["Remaining NAV", "nav"],
    ["Total Value (distributions + redemptions + NAV)", "totalValue"],
  ];
  mrows.forEach(([label, key], i) => {
    const r = 14 + i;
    const m = spec.measures[key];
    ds.getCell(`B${r}`).value = label;
    ds.getCell(`C${r}`).value = m.nonAffiliate;
    ds.getCell(`D${r}`).value = m.affiliate;
    ds.getCell(`E${r}`).value = m.gpCarry;
    ds.getCell(`F${r}`).value = m.total;
  });
  ds.getCell("B22").value = "Remaining NAV by Class";
  ds.getCell("B23").value = "Class";
  ds.getCell("B30").value = "Investment Performance (Inception to Date)";
  ds.getCell("B31").value = L.holding;
  ds.getCell("C31").value = "Valuation Date";
  ds.getCell("D31").value = "NAV";
  ds.getCell("E31").value = "IRR";
  ds.getCell("F31").value = "MOIC";
  let r = 32;
  for (const h of spec.holdings) {
    ds.getCell(`B${r}`).value = h.name;
    ds.getCell(`C${r}`).value = h.valuationDate as ExcelJS.CellValue;
    ds.getCell(`D${r}`).value = h.nav;
    ds.getCell(`E${r}`).value = h.irr;
    ds.getCell(`F${r}`).value = h.moic;
    r++;
  }
  if (spec.spacerBeforeTotal) r++;
  ds.getCell(`B${r}`).value = L.total;
  const navTotal = spec.portfolioNavTotal === "sum" ? spec.holdings.reduce((a, h) => a + (h.nav ?? 0), 0) : spec.portfolioNavTotal ?? null;
  ds.getCell(`D${r}`).value = navTotal;
  ds.getCell(`E${r}`).value = "-";
  ds.getCell(`F${r}`).value = "-";
  if (spec.exposure) {
    r += 2;
    ds.getCell(`B${r}`).value = "Exposure by Asset Class";
    r++;
    ds.getCell(`B${r}`).value = "Asset Class";
    ds.getCell(`C${r}`).value = "Investment NAV";
    ds.getCell(`D${r}`).value = "%";
    ds.getCell(`E${r}`).value = "Fund NAV";
    for (const e of spec.exposure) {
      r++;
      ds.getCell(`B${r}`).value = e.assetClass;
      ds.getCell(`C${r}`).value = e.investmentNav;
      ds.getCell(`D${r}`).value = e.pct;
      ds.getCell(`E${r}`).value = e.fundNav;
    }
    r++;
    ds.getCell(`B${r}`).value = "Total";
    ds.getCell(`C${r}`).value = spec.exposure.reduce((a, e) => a + (e.investmentNav ?? 0), 0);
    ds.getCell(`E${r}`).value = spec.exposure.reduce((a, e) => a + (e.fundNav ?? 0), 0);
  }
  ds.getCell(`B${r + 3}`).value = L.asOf;
  ds.getCell(`E${r + 3}`).value = asOfDate as ExcelJS.CellValue;

  // ---- MTM ----
  const mtm = wb.addWorksheet(names.mtm);
  mtm.getCell("B2").value = `${spec.fundName} - Mark to Market`;
  ["Investment", "Source", "Date of Valuation", "FS Value", "Cost", "MTM", "PY MTM", "CY Unrealized", null, "Admin FMV", "Check", "Admin Unrealized", "Check", null, "Investment Type", "Asset Class"].forEach((h, i) => {
    if (h) mtm.getRow(3).getCell(2 + i).value = h;
  });
  let mr = 4;
  for (const h of spec.holdings) {
    if (h.cost === null && h.valuationDate === "Closed") continue; // disposed holdings not on MTM
    mtm.getCell(`B${mr}`).value = h.name;
    mtm.getCell(`D${mr}`).value = typeof h.valuationDate === "string" ? null : h.valuationDate;
    mtm.getCell(`E${mr}`).value = h.nav;
    mtm.getCell(`F${mr}`).value = h.cost;
    if (h.type) mtm.getCell(`P${mr}`).value = h.type;
    if (h.assetClass) mtm.getCell(`Q${mr}`).value = h.assetClass;
    mr++;
  }
  mr++; // blank row before Total (as in the real file)
  mtm.getCell(`B${mr}`).value = "Total";
  const costTotal = spec.mtmTotalCost === "sum" ? spec.holdings.reduce((a, h) => a + (h.cost ?? 0), 0) : spec.mtmTotalCost ?? null;
  mtm.getCell(`F${mr}`).value = costTotal;

  // ---- IRR Detail ----
  const irr = wb.addWorksheet(names.irrDetail);
  irr.getCell("D2").value = `${spec.fundName} - IRR Detail (cash flows per investment)`;
  irr.getCell("B4").value = asOfDate as ExcelJS.CellValue;
  irr.getCell("B6").value = "Investment Name";
  let col = 4;
  let maxFlows = 0;
  for (const h of spec.holdings) {
    if (h.onIrrDetail === false) continue;
    irr.getRow(4).getCell(col).value = h.name;
    irr.getRow(5).getCell(col).value = "Date";
    irr.getRow(5).getCell(col + 1).value = "Cash";
    h.flows.forEach((f, i) => {
      irr.getRow(6 + i).getCell(col).value = f.date;
      irr.getRow(6 + i).getCell(col + 1).value = f.cash;
    });
    maxFlows = Math.max(maxFlows, h.flows.length);
    col += 3;
  }
  const termRow = 6 + maxFlows + 2;
  irr.getCell(`B${termRow}`).value = "Current Value";
  irr.getCell(`B${termRow + 1}`).value = "XIRR";
  irr.getCell(`B${termRow + 2}`).value = "MOIC";
  col = 4;
  for (const h of spec.holdings) {
    if (h.onIrrDetail === false) continue;
    irr.getRow(termRow).getCell(col).value = asOfDate as ExcelJS.CellValue;
    irr.getRow(termRow).getCell(col + 1).value = h.nav ?? 0;
    col += 3;
  }

  // Extra noise sheets like the real file has.
  wb.addWorksheet("TB Recalc").getCell("B2").value = "noise";
  spec.mutate?.(wb);
  return wb;
}


// ---------------------------------------------------------------------------
// Winddown layout (FAP III style): TB Recalc + MTM + IRR (+ Valuation)
// ---------------------------------------------------------------------------
export interface WinddownHolding {
  name: string;
  onMtm: boolean; // live holding row on MTM
  nav: number | null;
  cost: number | null;
  manager?: string | null;
  markDate?: string | null; // "mm/dd/yyyy" or "CM"
  /** IRR block; omit for holdings with no cash-flow block */
  block?: { flows: { date: Date; cash: number | string }[]; value: number | null | { error: string }; irr: number | null | { error: string }; moic: number | null; contribution: number | null; distribution: number | null };
}

export interface WinddownSpec {
  fundName: string;
  asOf: Date;
  tb: { contributions: number | null; returnOfCapital: number | null; distributions: number | null; redemptions: number | null; nav: number | null; carry?: number | null };
  holdings: WinddownHolding[];
  sheetNames?: Partial<{ tb: string; mtm: string; irr: string; valuation: string }>;
  mutate?: (wb: ExcelJS.Workbook) => void;
}

export function goodWinddownSpec(): WinddownSpec {
  const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));
  return {
    fundName: "Demo Advantage Partners III LP",
    asOf: new Date(Date.UTC(2026, 6, 31)),
    tb: { contributions: -114_271_000, returnOfCapital: 366_450, distributions: 83_391_955, redemptions: 535_401.1, nav: 27_758_600.9 },
    holdings: [
      { name: "CLC Issuer DAC", onMtm: true, nav: 1_347_376.11, cost: 7_608_962.33, manager: "Orchard", markDate: "06/30/2026", block: { flows: [{ date: d(2018, 8, 29), cash: -10_325_854.94 }, { date: d(2019, 2, 28), cash: 495_558.26 }], value: 1_347_376.11, irr: 0.0289, moic: 1.0899, contribution: -20_767_544.99, distribution: 21_286_300.28 } },
      { name: "GCF I LP", onMtm: true, nav: 6_186_604.83, cost: 3_816_020.39, manager: "North Wall", markDate: "CM", block: { flows: [{ date: d(2019, 8, 22), cash: -950_931.5 }, { date: d(2023, 10, 18), cash: 16_879_166.63 }], value: 6_186_604.83, irr: 0.0603, moic: (16_879_166.63 + 6_186_604.83) / 19_896_344.11, contribution: -19_896_344.11, distribution: 16_879_166.63 } },
      { name: "Crescent Energy Cl A", onMtm: true, nav: 2_948_945.7, cost: 6_088_324, block: undefined },
      { name: "Granite Point II LP", onMtm: false, nav: null, cost: null, block: { flows: [{ date: d(2017, 3, 29), cash: -25_305_654.62 }, { date: d(2021, 8, 18), cash: 3_441_189.71 }], value: null, irr: 0.2617, moic: 1.535, contribution: -25_305_654.62, distribution: 38_845_537.05 } },
    ],
  };
}

export async function buildWinddownWorkbook(spec: WinddownSpec): Promise<Buffer> {
  const names = { tb: "TB Recalc", mtm: "MTM", irr: "IRR", valuation: "Valuation", ...spec.sheetNames };
  const wb = new ExcelJS.Workbook();
  // TB Recalc
  const tb = wb.addWorksheet(names.tb);
  tb.getCell("B1").value = spec.fundName;
  tb.getCell("B3").value = "Trial Balance RC";
  tb.getCell("D3").value = "SS&C";
  tb.getCell("E3").value = "Freestone";
  const rows: [string, number | null][] = [
    ["Cash - BMO", 4_768_990.95],
    ["Investments - Cost", 81_742_863.61],
    ["Partner's Capital - Contributions", spec.tb.contributions],
    ["Partner's Capital - Return of Capital", spec.tb.returnOfCapital],
    ["Partner's Capital - Distributions", spec.tb.distributions],
    ["Partner's Capital - Redemptions", spec.tb.redemptions],
    ["Distributions - Carried Interest", spec.tb.carry ?? null],
    ["NAV", spec.tb.nav],
  ];
  rows.forEach(([label, v], i) => {
    tb.getCell(`B${5 + i}`).value = label;
    tb.getCell(`D${5 + i}`).value = v;
    tb.getCell(`E${5 + i}`).value = v;
  });
  // MTM
  const mtm = wb.addWorksheet(names.mtm);
  ["Code", "Manager", "Investment", "FS Value", "Cost", "IRR", "MOIC", "MTM"].forEach((h, i) => (mtm.getRow(3).getCell(2 + i).value = h));
  let r = 5;
  for (const h of spec.holdings) {
    if (!h.onMtm) continue;
    mtm.getCell(`C${r}`).value = h.manager ?? null;
    mtm.getCell(`D${r}`).value = h.name;
    mtm.getCell(`E${r}`).value = h.nav;
    mtm.getCell(`F${r}`).value = h.cost;
    mtm.getCell(`G${r}`).value = h.block?.moic ?? null; // the real file's MTM "IRR" column repeats MOIC
    mtm.getCell(`H${r}`).value = h.block?.moic ?? null;
    r++;
  }
  r += 2;
  mtm.getCell(`D${r}`).value = "Total";
  mtm.getCell(`E${r}`).value = spec.holdings.filter((h) => h.onMtm).reduce((a, h) => a + (h.nav ?? 0), 0);
  mtm.getCell(`F${r}`).value = spec.holdings.filter((h) => h.onMtm).reduce((a, h) => a + (h.cost ?? 0), 0);
  // IRR
  const irr = wb.addWorksheet(names.irr);
  irr.getCell("A1").value = spec.asOf;
  let col = 3;
  let maxFlows = 0;
  const blocks = spec.holdings.filter((h) => h.block);
  for (const h of blocks) {
    irr.getRow(2).getCell(col + 1).value = h.name;
    irr.getRow(3).getCell(col).value = "Cash Date";
    irr.getRow(3).getCell(col + 1).value = "Amount";
    irr.getRow(3).getCell(col + 2).value = "Description";
    h.block!.flows.forEach((f, i) => {
      irr.getRow(4 + i).getCell(col).value = f.date;
      irr.getRow(4 + i).getCell(col + 1).value = f.cash as ExcelJS.CellValue;
    });
    maxFlows = Math.max(maxFlows, h.block!.flows.length);
    col += 4;
  }
  const valueRow = 4 + maxFlows + 2;
  col = 3;
  for (const h of blocks) {
    const b = h.block!;
    const put = (rr: number, v: unknown, label: string) => {
      irr.getRow(rr).getCell(col + 1).value = v as ExcelJS.CellValue;
      irr.getRow(rr).getCell(col + 2).value = label;
    };
    irr.getRow(valueRow).getCell(col).value = spec.asOf;
    put(valueRow, b.value, "Value");
    put(valueRow + 1, b.irr, "IRR");
    put(valueRow + 2, b.moic, "MOIC");
    put(valueRow + 3, b.contribution, "Contribution");
    put(valueRow + 4, b.distribution, "Distribution");
    col += 4;
  }
  // Valuation
  const val = wb.addWorksheet(names.valuation);
  ["Manager", "Investment", "FS Value", "Audit/ Valuation Type", "Valuation Frequency", "Shares", "Price", "Mark date"].forEach((h, i) => (val.getRow(3).getCell(1 + i).value = h));
  let vr = 5;
  for (const h of spec.holdings) {
    if (!h.onMtm) continue;
    val.getCell(`A${vr}`).value = h.manager ?? null;
    val.getCell(`B${vr}`).value = h.name;
    val.getCell(`H${vr}`).value = h.markDate ?? null;
    vr++;
  }
  spec.mutate?.(wb);
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
