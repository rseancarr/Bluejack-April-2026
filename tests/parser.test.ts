import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseWorkbook, ParseError } from "@/lib/import/parser";
import { reconcile } from "@/lib/import/reconcile";
import { diffAgainstPrior } from "@/lib/import/diff";
import { buildWorkbook, goodSpec, type WorkbookSpec } from "@/lib/import/build";

async function expectProblems(spec: WorkbookSpec, ...patterns: RegExp[]) {
  const buf = await buildWorkbook(spec);
  let err: unknown;
  try {
    await parseWorkbook(buf);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ParseError);
  const problems = (err as ParseError).problems.join("\n");
  for (const p of patterns) expect(problems).toMatch(p);
  return err as ParseError;
}

describe("parseWorkbook: real layout, happy path", () => {
  it("reads the fund, classes, returns and holdings exactly as received", async () => {
    const parsed = await parseWorkbook(await buildWorkbook(goodSpec()));
    expect(parsed.asOfDate).toBe("2026-06-30");
    expect(parsed.sheetsRead).toEqual(["Dashboard Confessional", "MTM", "IRR Detail"]);
    const f = parsed.funds[0];
    expect(f.name).toBe("Demo Advantage Partners I LP");
    expect(f.fields).toEqual({ cost: 8_671_368.39 + 15_023_087, contributions: 255_842_500, distributions: 255_532_961, nav: 288_297_288.24, irr: 0.2497, moic: 2.13 });
    expect(f.fundFields).toEqual({ commitments: 255_092_500, redemptions: 966_088.38, totalValue: 544_796_337.62, irrGross: 0.2586, moicGross: 2.18, irrNet: 0.2152, moicNet: 1.96 });
    expect(f.classes.gpCarry.commitments).toBeNull(); // blank cell → null, not 0
    expect(f.classes.affiliate.called).toBe(17_042_500);
    expect(f.sources.nav).toBe("Dashboard Confessional!F18");

    expect(parsed.investments).toHaveLength(3);
    const [alpha, , gamma] = parsed.investments;
    expect(alpha.valuationDate).toBe("2026-03-31");
    expect(alpha.holdingStatus).toBeNull();
    expect(alpha.fields.nav).toBe(7_760_738.86);
    expect(alpha.fields.cost).toBe(8_671_368.39);
    expect(alpha.fields.contributions).toBeCloseTo(8_671_368.39, 2);
    expect(alpha.fields.distributions).toBeCloseTo(4_677_555.54, 2);
    expect(alpha.extra).toEqual({ "Investment Type": "Other Fund", "Cash flows": 3 });
    expect(alpha.sources.nav).toBe("Dashboard Confessional!D32");
    expect(alpha.sources.cost).toBe("MTM!F4");
    expect(alpha.missingFields).toEqual([]);

    expect(gamma.holdingStatus).toBe("Closed");
    expect(gamma.valuationDate).toBeNull();
    expect(gamma.fields.nav).toBeNull();
    expect(gamma.fields.cost).toBeNull();
    expect(gamma.missingFields).toEqual(["cost", "nav"]);
    expect(gamma.fields.contributions).toBe(18_078_636);

    expect(parsed.portfolioNavTotal).toBeCloseTo(7_760_738.86 + 14_504_492, 2);
    expect(parsed.mtmTotalCost).toBeCloseTo(8_671_368.39 + 15_023_087, 2);
  });

  it("stores IRR as a fraction and never rounds", async () => {
    const spec = goodSpec();
    spec.holdings[0].irr = 0.123456789;
    spec.holdings[0].nav = 1234567.891;
    const parsed = await parseWorkbook(await buildWorkbook(spec));
    expect(parsed.investments[0].fields.irr).toBe(0.123456789);
    expect(parsed.investments[0].fields.nav).toBe(1234567.891);
  });

  it("finds labels even when rows move, and matches headers case-insensitively", async () => {
    const spec = goodSpec();
    spec.mutate = (wb) => {
      const ds = wb.getWorksheet("Dashboard Confessional")!;
      ds.spliceRows(11, 0, [], []); // push everything below the return table down two rows
      ds.getCell("B6").value = "return basis";
      ds.getCell("E6").value = "irr";
    };
    const parsed = await parseWorkbook(await buildWorkbook(spec));
    expect(parsed.funds[0].fields.nav).toBe(288_297_288.24);
    expect(parsed.investments[0].sources.nav).toBe("Dashboard Confessional!D34");
  });

  it("a holding missing from MTM or IRR Detail gets nulls, not zeros", async () => {
    const spec = goodSpec();
    spec.holdings[1].onIrrDetail = false;
    const parsed = await parseWorkbook(await buildWorkbook(spec));
    const beta = parsed.investments[1];
    expect(beta.fields.contributions).toBeNull();
    expect(beta.fields.distributions).toBeNull();
    expect(beta.missingFields).toEqual(["contributions", "distributions"]);
  });
});

describe("parseWorkbook: fails loudly", () => {
  it("rejects a non-xlsx file", async () => {
    await expect(parseWorkbook(Buffer.from("not a workbook"))).rejects.toThrow(/not a readable/);
  });

  it("missing dashboard sheet lists the sheets it found", async () => {
    const spec = goodSpec();
    spec.sheetNames = { dashboard: "Dashboard" };
    await expectProblems(spec, /Missing sheet "Dashboard Confessional"/, /"Dashboard"/);
  });

  it("missing MTM and IRR Detail sheets", async () => {
    const spec = goodSpec();
    spec.sheetNames = { mtm: "Marks", irrDetail: "Cash" };
    await expectProblems(spec, /Missing sheet "MTM"/, /Missing sheet "IRR Detail"/);
  });

  it("renamed dashboard labels", async () => {
    const spec = goodSpec();
    spec.labels = { measure: "Metric", holding: "Investment" };
    await expectProblems(spec, /no "Measure" header row/, /no "Holding" header row/);
  });

  it("missing measure row and missing class column", async () => {
    const spec = goodSpec();
    spec.mutate = (wb) => {
      const ds = wb.getWorksheet("Dashboard Confessional")!;
      ds.getCell("B15").value = "Capital Called"; // was "Called Capital"
      ds.getCell("E13").value = "GP"; // was "GP Carry"
    };
    await expectProblems(spec, /missing column header "GP Carry"/);
    const spec2 = goodSpec();
    spec2.mutate = (wb) => {
      wb.getWorksheet("Dashboard Confessional")!.getCell("B15").value = "Capital Called";
    };
    await expectProblems(spec2, /no row "Called Capital"/);
  });

  it("text where a number is expected names the cell", async () => {
    const spec = goodSpec();
    spec.holdings[0].nav = "n/a" as unknown as number;
    spec.measures.nav.total = "TBD" as unknown as number;
    spec.portfolioNavTotal = 14_504_492;
    const err = await expectProblems(spec, /Dashboard Confessional!D32 \(Alpha Energy Fund II, LP NAV\) must be numeric, got string "n\/a"/, /Dashboard Confessional!F18 \(Remaining NAV \/ Fund Total\) must be numeric, got string "TBD"/);
    expect(err.problems).toHaveLength(2);
  });

  it("valuation date that is neither a date nor a status word", async () => {
    const spec = goodSpec();
    spec.holdings[0].valuationDate = "3/31/26?";
    await expectProblems(spec, /C32 \(valuation date\) must be a date or a status word/);
  });

  it("blank fund name and missing as-of date", async () => {
    const spec = goodSpec();
    spec.mutate = (wb) => {
      const ds = wb.getWorksheet("Dashboard Confessional")!;
      ds.getCell("B2").value = null;
      ds.getCell("E38").value = "June 2026";
    };
    await expectProblems(spec, /B2 \(fund name\) is blank/, /as-of date is string "June 2026"/);
  });

  it("holdings table without a Total row, and a blank name inside it", async () => {
    const spec = goodSpec();
    spec.labels = { total: "" };
    await expectProblems(spec, /blank holding name before the "Total" row/);
  });

  it("duplicate holding", async () => {
    const spec = goodSpec();
    spec.holdings[1].name = spec.holdings[0].name;
    await expectProblems(spec, /duplicate holding "Alpha Energy Fund II, LP" on rows 32 and 33/);
  });

  it("MTM without a Cost column; IRR Detail without a Current Value row", async () => {
    const spec = goodSpec();
    spec.mutate = (wb) => {
      wb.getWorksheet("MTM")!.getCell("F3").value = "Basis";
      const irr = wb.getWorksheet("IRR Detail")!;
      irr.eachRow((row) => {
        if (row.getCell(2).value === "Current Value") row.getCell(2).value = "Ending Value";
      });
    };
    await expectProblems(spec, /MTM row 3: missing column header "Cost"/, /no "Current Value" row/);
  });

  it("text in a cash-flow cell", async () => {
    const spec = goodSpec();
    spec.holdings[0].flows[1].cash = "pending";
    await expectProblems(spec, /IRR Detail!E7 \(Alpha Energy Fund II, LP cash flow\) must be numeric, got string "pending"/);
  });
});

describe("reconcile", () => {
  it("passes on a consistent workbook and reports the fund-vs-portfolio gap as info", async () => {
    const parsed = await parseWorkbook(await buildWorkbook(goodSpec()));
    const [rec] = reconcile(parsed);
    expect(rec.flagged).toBe(false);
    const byKey = Object.fromEntries(rec.checks.map((c) => [c.key, c]));
    expect(byKey["portfolio-nav"]).toMatchObject({ variance: 0, flagged: false, note: "1 holding(s) have no NAV (realized)" });
    expect(byKey["fund-vs-portfolio"].kind).toBe("info");
    expect(byKey["fund-vs-portfolio"].variance).toBeCloseTo(288_297_288.24 - (7_760_738.86 + 14_504_492), 2);
    expect(byKey["fund-vs-portfolio"].flagged).toBe(false);
    expect(byKey["class-commitments"]).toMatchObject({ variance: 0, flagged: false, note: "1 class cell(s) blank" });
    expect(byKey["total-value"].flagged).toBe(false);
    expect(rec.holdingChecks.every((h) => !h.flagged)).toBe(true);
    expect(rec.holdingChecks[2].note).toMatch(/NAV blank treated as 0/);
  });

  it("flags class rows that do not add up, a portfolio total mismatch, and a MOIC that disagrees with the cash flows", async () => {
    const spec = goodSpec();
    spec.measures.called.total = 255_842_500 + 2_500;
    spec.portfolioNavTotal = 7_760_738.86 + 14_504_492 + 100;
    spec.holdings[1].moic = 1.5; // cash flows imply 1.853
    const parsed = await parseWorkbook(await buildWorkbook(spec));
    const [rec] = reconcile(parsed);
    expect(rec.flagged).toBe(true);
    const byKey = Object.fromEntries(rec.checks.map((c) => [c.key, c]));
    expect(byKey["class-called"]).toMatchObject({ variance: -2_500, flagged: true });
    expect(byKey["portfolio-nav"]).toMatchObject({ variance: -100, flagged: true });
    expect(rec.holdingChecks[1].flagged).toBe(true);
    expect(rec.holdingChecks[1].computedMoic).toBeCloseTo(1.853, 3);
  });

  it("does not flag what it cannot check", async () => {
    const spec = goodSpec();
    spec.holdings[0].onIrrDetail = false;
    spec.mtmTotalCost = null;
    const parsed = await parseWorkbook(await buildWorkbook(spec));
    const [rec] = reconcile(parsed);
    expect(rec.holdingChecks[0]).toMatchObject({ computedMoic: null, flagged: false });
    expect(rec.checks.find((c) => c.key === "mtm-cost")).toMatchObject({ variance: null, flagged: false });
  });
});

describe("diffAgainstPrior", () => {
  it("classifies rows and flags mark changes over threshold", () => {
    const rows = [
      { fields: { cost: 1, contributions: 1, distributions: 0, nav: 130, irr: null, moic: null }, missingFields: [] as never[] },
      { fields: { cost: 1, contributions: 1, distributions: 0, nav: 101, irr: null, moic: null }, missingFields: [] as never[] },
      { fields: { cost: 1, contributions: 1, distributions: 0, nav: 5, irr: null, moic: null }, missingFields: [] as never[] },
      { fields: { cost: 1, contributions: 1, distributions: 0, nav: 5, irr: null, moic: null }, missingFields: [] as never[] },
    ];
    const resolutions = [
      { index: 0, investmentId: "a", createNew: false },
      { index: 1, investmentId: "b", createNew: false },
      { index: 2, investmentId: null, createNew: false },
      { index: 3, investmentId: null, createNew: true },
    ];
    const prior = [
      { investmentId: "a", asOfDate: "2026-05-31", nav: 100, cost: 1, distributions: 0, contributions: 1 },
      { investmentId: "b", asOfDate: "2026-05-31", nav: 100, cost: 1, distributions: 0, contributions: 1 },
      { investmentId: "gone", asOfDate: "2026-05-31", nav: 9, cost: 1, distributions: 0, contributions: 1 },
    ];
    const d = diffAgainstPrior(rows, resolutions, prior);
    expect(d.entries[0]).toMatchObject({ status: "existing", navChangePct: 30, flagged: true });
    expect(d.entries[1]).toMatchObject({ status: "existing", navChangePct: 1, flagged: false });
    expect(d.entries[2].status).toBe("unmatched");
    expect(d.entries[3].status).toBe("new");
    expect(d.disappeared).toEqual(["gone"]);
    expect(d.counts).toEqual({ new: 1, unmatched: 1, flagged: 1, existing: 2, disappeared: 1 });
  });

  it("null prior NAV yields null change, never a fake percentage", () => {
    const rows = [{ fields: { cost: 1, contributions: 1, distributions: 0, nav: 100, irr: null, moic: null }, missingFields: [] as never[] }];
    const d = diffAgainstPrior(rows, [{ index: 0, investmentId: "a", createNew: false }], [{ investmentId: "a", asOfDate: "2026-05-31", nav: null, cost: 1, distributions: 0, contributions: 1 }]);
    expect(d.entries[0].navChangePct).toBeNull();
    expect(d.entries[0].flagged).toBe(false);
  });
});

// Runs only when accounting's real file is present locally (it is not committed to git).
const SAMPLE = path.resolve(__dirname, "../samples/20260630_FAPIV_TB_Analysis_JC.xlsx");
describe.skipIf(!existsSync(SAMPLE))("parseWorkbook against the real accounting sample", () => {
  it("parses Freestone Advantage Partners IV as of 2026-06-30", async () => {
    const parsed = await parseWorkbook(readFileSync(SAMPLE));
    expect(parsed.asOfDate).toBe("2026-06-30");
    const f = parsed.funds[0];
    expect(f.name).toBe("Freestone Advantage Partners IV LP");
    expect(f.fundFields.commitments).toBe(255_092_500);
    expect(f.fields.nav).toBeCloseTo(288_297_288.24, 2);
    expect(f.fields.irr).toBeCloseTo(0.2497, 4);
    expect(f.fundFields.irrGross).toBeCloseTo(0.2586, 4);
    expect(f.fundFields.moicNet).toBeCloseTo(1.957, 3);
    expect(parsed.investments).toHaveLength(11);
    const troubadour = parsed.investments.find((h) => h.name.startsWith("Troubadour"))!;
    expect(troubadour.valuationDate).toBe("2026-06-30");
    expect(troubadour.fields.nav).toBe(90_311_334);
    expect(troubadour.fields.cost).toBe(86_794_000);
    const closed = parsed.investments.filter((h) => h.holdingStatus === "Closed");
    expect(closed).toHaveLength(5);
    expect(closed.every((h) => h.fields.nav === null)).toBe(true);
    const [rec] = reconcile(parsed);
    // Every holding's reported MOIC is reproduced from its cash flows.
    expect(rec.holdingChecks.filter((h) => h.computedMoic !== null).every((h) => !h.flagged)).toBe(true);
    expect(rec.checks.find((c) => c.key === "portfolio-nav")!.flagged).toBe(false);
    expect(rec.checks.find((c) => c.key === "class-nav")!.flagged).toBe(false);
  });
});
