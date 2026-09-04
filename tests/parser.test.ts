import { describe, expect, it } from "vitest";
import { parseWorkbook, ParseError } from "@/lib/import/parser";
import { reconcile } from "@/lib/import/reconcile";
import { diffAgainstPrior } from "@/lib/import/diff";
import { buildWorkbook, goodSheets, asOf, FUND_HEADER, INV_HEADER } from "./helpers/workbook";

async function expectProblems(sheets: Parameters<typeof buildWorkbook>[0], ...patterns: RegExp[]) {
  const buf = await buildWorkbook(sheets);
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

describe("parseWorkbook: happy path", () => {
  it("parses funds and investments exactly as received", async () => {
    const parsed = await parseWorkbook(await buildWorkbook(goodSheets()));
    expect(parsed.asOfDate).toBe("2026-07-31");
    expect(parsed.funds).toHaveLength(2);
    expect(parsed.investments).toHaveLength(3);
    const alpha = parsed.investments[0];
    expect(alpha.externalId).toBe("I1");
    expect(alpha.name).toBe("Alpha Co");
    expect(alpha.fundExternalId).toBe("F1");
    expect(alpha.fundName).toBe("Demo Fund I");
    expect(alpha.fields).toEqual({ cost: 60, contributions: 60, distributions: 30, nav: 70, irr: 0.2, moic: 1.67 });
    expect(alpha.missingFields).toEqual([]);
    expect(alpha.row).toBe(2);
    const f1 = parsed.funds[0];
    expect(f1.fields.cost).toBeNull(); // no Cost column on Funds sheet
    expect(f1.missingFields).toContain("cost");
  });

  it("does not round, flip signs, or coerce", async () => {
    const s = goodSheets();
    s[1].rows[0][5] = 1234567.891; // cost
    s[1].rows[0][7] = -30; // distributions negative — stored as-is
    const parsed = await parseWorkbook(await buildWorkbook(s));
    expect(parsed.investments[0].fields.cost).toBe(1234567.891);
    expect(parsed.investments[0].fields.distributions).toBe(-30);
  });

  it("stores blank numeric cells as null and lists them as missing", async () => {
    const s = goodSheets();
    s[1].rows[1][8] = null; // NAV blank for Beta
    s[1].rows[1][9] = null; // IRR blank
    const parsed = await parseWorkbook(await buildWorkbook(s));
    const beta = parsed.investments[1];
    expect(beta.fields.nav).toBeNull();
    expect(beta.fields.irr).toBeNull();
    expect(beta.missingFields).toEqual(["nav", "irr"]);
  });

  it("keeps unknown columns verbatim in extra", async () => {
    const s = goodSheets();
    s[1].header = [...INV_HEADER, "Unrealized Gain", "Comment"];
    s[1].rows = s[1].rows.map((r) => [...r, 10, "ok"]);
    const parsed = await parseWorkbook(await buildWorkbook(s));
    expect(parsed.investments[0].extra).toEqual({ "Unrealized Gain": 10, Comment: "ok" });
  });

  it("uses formula results and accepts case-insensitive headers", async () => {
    const s = goodSheets();
    s[1].header = INV_HEADER.map((h) => h.toUpperCase());
    s[1].rows[0][8] = { formula: "70", result: 70 };
    const parsed = await parseWorkbook(await buildWorkbook(s));
    expect(parsed.investments[0].fields.nav).toBe(70);
  });

  it("accepts yyyy-mm-dd text dates and tolerates trailing blank rows", async () => {
    const s = goodSheets();
    s[0].rows = s[0].rows.map((r) => r.map((c, i) => (i === 2 ? "2026-07-31" : c)));
    s[1].rows.push([null, null, null, null, null, null, null, null, null, null, null]);
    const parsed = await parseWorkbook(await buildWorkbook(s));
    expect(parsed.asOfDate).toBe("2026-07-31");
    expect(parsed.investments).toHaveLength(3);
  });

  it("optional ID columns may be absent", async () => {
    const s = goodSheets();
    s[1].header = INV_HEADER.filter((h) => h !== "Investment ID" && h !== "Fund ID");
    s[1].rows = s[1].rows.map((r) => r.filter((_, i) => i !== 0 && i !== 2));
    const parsed = await parseWorkbook(await buildWorkbook(s));
    expect(parsed.investments[0].externalId).toBeNull();
    expect(parsed.investments[0].fundExternalId).toBeNull();
    expect(parsed.columns.investments).not.toContain("externalId");
  });
});

describe("parseWorkbook: fails loudly", () => {
  it("rejects a non-xlsx file", async () => {
    await expect(parseWorkbook(Buffer.from("not a workbook"))).rejects.toThrow(/not a readable/);
  });

  it("missing sheet", async () => {
    const s = goodSheets();
    s[1].name = "Portfolio";
    await expectProblems(s, /Missing sheet "Investments"/, /"Portfolio"/);
  });

  it("missing required column names the column", async () => {
    const s = goodSheets();
    s[1].header = INV_HEADER.filter((h) => h !== "NAV");
    s[1].rows = s[1].rows.map((r) => r.filter((_, i) => i !== 8));
    await expectProblems(s, /Sheet "Investments": missing required column "NAV"/);
  });

  it("non-numeric cell in a numeric column names sheet, row, column, and value", async () => {
    const s = goodSheets();
    s[1].rows[1][8] = "n/a";
    s[1].rows[2][5] = "1,234";
    const err = await expectProblems(s, /Sheet "Investments" row 3: "NAV" must be numeric, got string "n\/a"/, /row 4: "Cost" must be numeric, got string "1,234"/);
    expect(err.problems).toHaveLength(2);
  });

  it("formula errors are rejected", async () => {
    const s = goodSheets();
    s[1].rows[0][8] = { formula: "1/0", result: { error: "#DIV/0!" } };
    await expectProblems(s, /"NAV" must be numeric/);
  });

  it("blank name", async () => {
    const s = goodSheets();
    s[1].rows[1][1] = null;
    await expectProblems(s, /row 3: "Investment Name" is blank/);
  });

  it("invalid as-of date", async () => {
    const s = goodSheets();
    s[1].rows[0][4] = "July 2026";
    await expectProblems(s, /"As Of Date" must be a date cell/);
  });

  it("inconsistent as-of dates across rows", async () => {
    const s = goodSheets();
    s[0].rows[1][2] = new Date(Date.UTC(2026, 5, 30));
    await expectProblems(s, /must be the same on every row/, /2026-06-30, 2026-07-31/);
  });

  it("blank row inside the data block", async () => {
    const s = goodSheets();
    s[1].rows.splice(1, 0, [null, null, null, null, null, null, null, null, null, null, null]);
    await expectProblems(s, /blank row 3 inside the data block/);
  });

  it("duplicate headers", async () => {
    const s = goodSheets();
    s[0].header = [...FUND_HEADER, "NAV"];
    await expectProblems(s, /duplicate header "NAV"/);
  });

  it("duplicate IDs / names", async () => {
    const s = goodSheets();
    s[1].rows[1][0] = "I1";
    await expectProblems(s, /duplicate ID "I1" on rows 2 and 3/);
    const t = goodSheets();
    t[1].rows[1][0] = null;
    t[1].rows[0][0] = null;
    t[1].rows[1][1] = "Alpha Co";
    await expectProblems(t, /duplicate name "Alpha Co"/);
  });

  it("empty sheet below header", async () => {
    const s = goodSheets();
    s[0].rows = [];
    await expectProblems(s, /Sheet "Funds": no data rows/);
  });

  it("reports all problems across both sheets in one go", async () => {
    const s = goodSheets();
    s[0].rows[0][5] = "abc";
    s[1].rows[0][6] = "xyz";
    const err = await expectProblems(s, /Sheet "Funds" row 2/, /Sheet "Investments" row 2/);
    expect(err.problems).toHaveLength(2);
  });
});

describe("reconcile", () => {
  it("compares investment sums to fund rows and flags variances", async () => {
    const parsed = await parseWorkbook(await buildWorkbook(goodSheets()));
    const rec = reconcile(parsed.funds, parsed.investments);
    const f1 = rec.find((r) => r.fundName === "Demo Fund I")!;
    expect(f1.investmentCount).toBe(2);
    const nav = f1.fields.find((f) => f.field === "nav")!;
    expect(nav).toMatchObject({ fundValue: 120, investmentSum: 120, variance: 0, flagged: false });
    const cost = f1.fields.find((f) => f.field === "cost")!;
    expect(cost.fundValue).toBeNull(); // Funds sheet has no Cost → cannot reconcile, not flagged
    expect(cost.investmentSum).toBe(100);
    expect(cost.variance).toBeNull();
    expect(f1.flagged).toBe(false);
  });

  it("flags a mismatch above tolerance and records the variance", async () => {
    const s = goodSheets();
    s[0].rows[0][5] = 125; // fund NAV 125 vs investments 120
    const parsed = await parseWorkbook(await buildWorkbook(s));
    const f1 = reconcile(parsed.funds, parsed.investments).find((r) => r.fundName === "Demo Fund I")!;
    const nav = f1.fields.find((f) => f.field === "nav")!;
    expect(nav.variance).toBe(5);
    expect(nav.flagged).toBe(true);
    expect(f1.flagged).toBe(true);
  });

  it("does not sum partially when an investment is missing the field", async () => {
    const s = goodSheets();
    s[1].rows[1][8] = null;
    const parsed = await parseWorkbook(await buildWorkbook(s));
    const f1 = reconcile(parsed.funds, parsed.investments).find((r) => r.fundName === "Demo Fund I")!;
    const nav = f1.fields.find((f) => f.field === "nav")!;
    expect(nav.investmentSum).toBeNull();
    expect(nav.missing).toBe(1);
    expect(nav.variance).toBeNull();
  });

  it("reports orphans on either side", async () => {
    const s = goodSheets();
    s[1].rows[2][2] = "F9";
    s[1].rows[2][3] = "Demo Fund IX";
    const parsed = await parseWorkbook(await buildWorkbook(s));
    const rec = reconcile(parsed.funds, parsed.investments);
    expect(rec.find((r) => r.fundName === "Demo Fund II")?.orphan).toBe("no-investments");
    expect(rec.find((r) => r.fundName === "Demo Fund IX")?.orphan).toBe("no-fund-row");
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
      { investmentId: "a", asOfDate: "2026-06-30", nav: 100, cost: 1, distributions: 0, contributions: 1 },
      { investmentId: "b", asOfDate: "2026-06-30", nav: 100, cost: 1, distributions: 0, contributions: 1 },
      { investmentId: "gone", asOfDate: "2026-06-30", nav: 9, cost: 1, distributions: 0, contributions: 1 },
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
    const d = diffAgainstPrior(rows, [{ index: 0, investmentId: "a", createNew: false }], [
      { investmentId: "a", asOfDate: "2026-06-30", nav: null, cost: 1, distributions: 0, contributions: 1 },
    ]);
    expect(d.entries[0].navChangePct).toBeNull();
    expect(d.entries[0].flagged).toBe(false);
  });
});
