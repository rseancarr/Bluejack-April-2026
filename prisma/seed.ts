// Demo seed. ALL DATA HERE IS FAKE. Run: npm run db:seed   (wipe first: npm run db:wipe)
//
// Financial snapshots are NOT written directly: the seed builds two demo accounting
// workbooks (matching lib/import/schema.ts), writes them to storage/imports/demo/,
// and pushes them through the real parser → resolve → commit path. That keeps the
// seed honest and gives you two files to re-import by hand.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { ingestWorkbook } from "../lib/import/ingest";
import { commitBatch } from "../lib/import/commit";
import { resolveWorkbook, type UserResolutions } from "../lib/import/match";
import type { ParsedWorkbook } from "../lib/import/parser";
import { buildExcel, type HoldingSpec, type WorkbookSpec } from "../lib/import/build";
import { planInitialEvents } from "../lib/pipeline/stageEvents";

const prisma = new PrismaClient();

// Deterministic PRNG so the seed is reproducible.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260904);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

const TEAM = (process.env.TEAM_MEMBERS ?? "Sean,Avery,Morgan").split(",").map((s) => s.trim()).filter(Boolean);
const TODAY = new Date();
const SNAPSHOT_1 = "2026-05-31";
const SNAPSHOT_2 = "2026-06-30";

const SECTORS: Record<string, string[]> = {
  Energy: ["Midstream", "Oilfield services", "Power generation", "Renewables", "Minerals & royalties"],
  "LMM PE": ["Industrial services", "Specialty manufacturing", "Healthcare services", "Business services", "Distribution"],
  Opportunistic: ["Real assets", "Special situations", "Structured credit", "Secondaries"],
};
const NAME_A = ["Redwood", "Granite", "Harbor", "Summit", "Cedar", "Ironwood", "Bluewater", "Pioneer", "Northgate", "Silverline", "Keystone", "Oakridge", "Cascade", "Meridian", "Copperfield", "Lakeside", "Highland", "Brookstone", "Westfield", "Stonebridge", "Riverbend", "Timberline", "Clearwater", "Ridgeway", "Evergreen", "Sandstone", "Foxglove", "Marlow", "Tidewater", "Alder", "Basalt", "Cobalt", "Driftwood", "Elmhurst", "Falcon", "Glacier", "Juniper", "Lantern", "Magnolia", "Nimbus", "Orchard", "Prairie", "Quarry", "Saddleback", "Thornfield"];
const NAME_B: Record<string, string[]> = {
  Energy: ["Midstream", "Energy Partners", "Power", "Resources", "Royalties", "Field Services"],
  "LMM PE": ["Industries", "Holdings", "Group", "Services", "Manufacturing", "Logistics"],
  Opportunistic: ["Capital", "Partners", "Ventures", "Assets", "Credit"],
};

async function main() {
  const counts = await prisma.fund.count();
  if (counts > 0) {
    console.error("Database is not empty. Run `npm run db:wipe` first.");
    process.exit(1);
  }

  // ---------- Funds ----------
  const fundDefs = [
    { name: "Demo Advantage Partners I LP", vintage: 2021, committedCapital: 250_000_000, status: "harvesting", externalId: null },
    { name: "Demo Advantage Partners II LP", vintage: 2023, committedCapital: 400_000_000, status: "investing", externalId: null },
    { name: "Demo Advantage Partners III LP", vintage: 2025, committedCapital: 500_000_000, status: "investing", externalId: null },
    { name: "Demo Advantage Partners IV LP", vintage: 2026, committedCapital: 600_000_000, status: "investing", externalId: null },
  ];
  const funds: Awaited<ReturnType<typeof prisma.fund.create>>[] = [];
  for (const f of fundDefs) {
    funds.push(
      await prisma.fund.create({
        data: { ...f, mgmtFeePct: 2.0, carryPct: 20.0, hurdlePct: 8.0, notes: "Demo data — not a real fund." },
      }),
    );
  }
  // Accounting's workbook identifies the fund by name → one mapping per fund.
  for (const f of funds) await prisma.nameMapping.create({ data: { sourceName: f.name, level: "fund", fundId: f.id } });

  // ---------- Investments (36 now; #37 arrives in the July import) ----------
  const perFund = [14, 12, 8, 2];
  const usedNames = new Set<string>();
  const investments: { id: string; name: string; fundIdx: number; bucket: string; externalId: string | null; status: string; entryDate: Date; cost: number; ageYears: number }[] = [];
  let seq = 1;
  for (let fi = 0; fi < funds.length; fi++) {
    const fund = funds[fi];
    for (let k = 0; k < perFund[fi]; k++) {
      const bucket = pick(["Energy", "LMM PE", "Opportunistic"] as const);
      let name = "";
      do name = `${pick(NAME_A)} ${pick(NAME_B[bucket])}`;
      while (usedNames.has(name));
      usedNames.add(name);
      const entryYear = fund.vintage + (fi === 3 ? 0 : Math.floor(rand() * 2.5));
      const entryDate = utc(Math.min(entryYear, 2026), Math.ceil(between(1, fi === 3 ? 8 : 12)), Math.ceil(between(1, 28)));
      const ageYears = (utc(2026, 7, 31).getTime() - entryDate.getTime()) / (365.25 * 86_400_000);
      const realized = fi === 0 && k < 3;
      const withId = false; // accounting's workbook carries no IDs; holdings match by name mapping
      const cost = round(between(8, 55) * 1_000_000, 0);
      const inv = await prisma.investment.create({
        data: {
          fundId: fund.id,
          name,
          bucket,
          sector: pick(SECTORS[bucket]),
          entryDate,
          ownershipPct: round(between(15, 85), 1),
          status: realized ? "realized" : "active",
          externalId: null,
          contacts: `${pick(["Jamie", "Taylor", "Casey", "Riley", "Drew"])} ${pick(["Chen", "Okafor", "Patel", "Nguyen", "Garcia"])} — CEO\n${pick(["Sam", "Alex", "Jordan"])} ${pick(["Kim", "Lopez", "Schmidt"])} — CFO`,
          notes: realized ? "Exited. Demo data." : pick(["Board seat held.", "Add-on pipeline active.", "Refinancing under review.", "Demo data."]),
        },
      });
      await prisma.nameMapping.create({ data: { sourceName: name, level: "investment", investmentId: inv.id } });
      investments.push({ id: inv.id, name, fundIdx: fi, bucket, externalId: inv.externalId, status: inv.status, entryDate, cost, ageYears: Math.max(ageYears, 0.1) });
      seq++;
      void withId;
    }
  }

  // ---------- Pipeline deals with exact stage history ----------
  const SOURCE_TYPES = ["banker", "sponsor", "proprietary", "other"] as const;
  const SPONSORS = ["Harbor Street Advisors", "Piedmont Partners", "Lakeshore Capital", "Founder-owned", "Blue Ridge Bankers", "Westbrook & Co.", "Direct outreach", "Industry contact"];
  const PASS_REASONS = ["Valuation", "Fit — outside bucket", "Management concerns", "Lost to competing bid", "Sponsor pulled process", "Leverage too high", "Cyclicality"];
  let dealCount = 0;
  const closedNames: string[] = [];
  for (let i = 0; i < 44; i++) {
    const year = pick([2024, 2024, 2025, 2025, 2025, 2026, 2026, 2026, 2026, 2026, 2026] as const);
    const maxMonth = year === 2026 ? TODAY.getUTCMonth() + 1 : 12;
    const sourced = utc(year, Math.ceil(between(1, maxMonth)), Math.ceil(between(1, 28)));
    if (sourced > TODAY) continue;
    const bucket = pick(["Energy", "LMM PE", "Opportunistic"] as const);
    const name = `${pick(NAME_A)} ${pick(NAME_B[bucket])} (${year})`;
    const targetFunds = year <= 2024 ? [funds[1]] : year === 2025 ? [pick([funds[1], funds[2]])] : [pick([funds[2], funds[3]])];
    const owner = pick(TEAM);
    const sourceType = pick(SOURCE_TYPES);

    // Stage path: Sourced → Screening → IC → Closed, with a pass chance at each step.
    const path: { stage: string; at: Date }[] = [{ stage: "Sourced", at: sourced }];
    let cursor = sourced;
    let terminal = false;
    const ageDays = (TODAY.getTime() - sourced.getTime()) / 86_400_000;
    for (const [next, minD, maxD, passP, stallP] of [["Screening", 5, 30, 0.25, 0.2], ["IC", 20, 75, 0.3, 0.25], ["Closed", 30, 90, 0.3, 0.3]] as const) {
      const at = addDays(cursor, Math.round(between(minD, maxD)));
      if (at > TODAY) break;
      if (rand() < stallP) break; // deal is still sitting in its current stage
      if (rand() < passP) {
        path.push({ stage: "Passed", at });
        terminal = true;
        break;
      }
      path.push({ stage: next, at });
      cursor = at;
    }
    // Old deals that never progressed get passed eventually.
    if (!terminal && path[path.length - 1].stage !== "Closed" && ageDays > 300 && rand() < 0.6) {
      const at = addDays(cursor, Math.round(between(20, 90)));
      if (at <= TODAY) path.push({ stage: "Passed", at });
    }
    const last = path[path.length - 1];
    const passReason = last.stage === "Passed" ? pick(PASS_REASONS) : null;
    if (last.stage === "Closed") closedNames.push(name);

    const deal = await prisma.deal.create({
      data: {
        name,
        sponsor: pick(SPONSORS),
        sourceType,
        sector: pick(SECTORS[bucket]),
        bucket,
        estSize: rand() < 0.85 ? round(between(10, 120) * 1_000_000, 0) : null,
        stage: last.stage,
        owner,
        nextStep: last.stage === "Passed" || last.stage === "Closed" ? null : pick(["Intro call", "Request CIM", "Management meeting", "Draft IC memo", "Site visit", "QoE scoping"]),
        fitNotes: pick(["Strong bucket fit.", "Size at top of range.", "Needs co-invest.", "Sponsor relationship is new.", null, null]),
        dateSourced: sourced,
        passReason,
        createdAt: sourced,
        funds: { create: targetFunds.map((f) => ({ fundId: f.id })) },
      },
    });
    // First event goes through the same planner the app uses; later events are the exact history.
    const first = planInitialEvents(path[0].stage, path[0].at)[0];
    await prisma.dealStageEvent.create({ data: { dealId: deal.id, stage: first.stage, enteredAt: first.enteredAt, changedBy: owner } });
    for (const step of path.slice(1)) {
      await prisma.dealStageEvent.create({ data: { dealId: deal.id, stage: step.stage, enteredAt: step.at, changedBy: owner, note: step.stage === "Passed" ? passReason : null } });
    }
    dealCount++;
  }

  // ---------- Action items ----------
  const someDeals = await prisma.deal.findMany({ where: { stage: { in: ["Screening", "IC"] } }, take: 6 });
  const items: { title: string; owner: string; due: number; status?: string; investmentId?: string; dealId?: string; fundId?: string; meeting?: Date }[] = [
    { title: "Send Q2 board deck comments", owner: TEAM[0], due: -5, investmentId: investments[3].id },
    { title: "Follow up on refinancing term sheet", owner: TEAM[0], due: -2, investmentId: investments[5].id },
    { title: "Schedule management meeting", owner: TEAM[1], due: 1, dealId: someDeals[0]?.id },
    { title: "Request CIM and data room access", owner: TEAM[1], due: 2, dealId: someDeals[1]?.id },
    { title: "Draft IC memo v1", owner: TEAM[2], due: 3, dealId: someDeals[2]?.id },
    { title: "Confirm capital call timing with accounting", owner: TEAM[0], due: 4, fundId: funds[2].id },
    { title: "Review K-1 package", owner: TEAM[2], due: 6, fundId: funds[0].id },
    { title: "Reference calls on CEO", owner: TEAM[1], due: 8, dealId: someDeals[3]?.id },
    { title: "Update ownership table after add-on", owner: TEAM[2], due: 10, investmentId: investments[16].id },
    { title: "Check covenant compliance certificate", owner: TEAM[0], due: 14, investmentId: investments[20].id },
    { title: "LP update paragraph on exits", owner: TEAM[1], due: 20, fundId: funds[0].id },
    { title: "QoE scoping call", owner: TEAM[2], due: 12, dealId: someDeals[4]?.id },
    { title: "Circulate pipeline summary", owner: TEAM[0], due: -9, status: "done" },
    { title: "Book site visit", owner: TEAM[1], due: -12, status: "done", dealId: someDeals[5]?.id },
    { title: "Annual meeting agenda draft", owner: TEAM[2], due: 30, fundId: funds[1].id, meeting: addDays(TODAY, -3) },
  ];
  for (const it of items) {
    await prisma.actionItem.create({
      data: {
        title: it.title,
        owner: it.owner,
        dueDate: addDays(TODAY, it.due),
        status: it.status ?? "open",
        completedAt: it.status === "done" ? addDays(TODAY, it.due) : null,
        createdFrom: it.meeting ? "meeting" : "manual",
        meetingDate: it.meeting ?? null,
        investmentId: it.investmentId,
        dealId: it.dealId,
        fundId: it.fundId,
      },
    });
  }

  // ---------- Two months of accounting workbooks (one per fund) → real import path ----------
  // Per-holding figures for month 1, then drifted for month 2. Everything is internally
  // consistent the way accounting's file is: MOIC = (distributions + NAV) / contributions.
  type Fig = { cost: number | null; contributions: number; distributions: number; nav: number | null; irr: number | null; moic: number | null; closed: boolean };
  const figures = investments.map((inv) => {
    const realized = inv.status === "realized";
    const contributions = round(inv.cost * between(1.0, 1.08), 0);
    const distributions = realized ? round(inv.cost * between(1.6, 2.6), 0) : inv.ageYears > 2 ? round(inv.cost * between(0, 0.4), 0) : 0;
    const nav = realized ? null : round(inv.cost * between(0.85, 1.9), 0);
    const moic = round((distributions + (nav ?? 0)) / contributions, 4);
    const irr = round(Math.max(-0.3, Math.min(0.6, (moic - 1) / Math.max(inv.ageYears, 0.75))), 4);
    return { inv, m1: { cost: realized ? null : inv.cost, contributions, distributions, nav, irr, moic, closed: realized } as Fig };
  });
  const month2 = figures.map(({ inv, m1 }, idx) => {
    const drift = idx === 4 ? 1.22 : idx === 9 ? 0.78 : between(0.97, 1.05); // two big mark moves to flag in preview
    const nav = m1.nav === null ? null : round(m1.nav * drift, 0);
    const f: Fig = { ...m1, nav, moic: round((m1.distributions + (nav ?? 0)) / m1.contributions, 4) };
    if (idx === 7) f.irr = null; // deliberately blank in July → shows "—" with tooltip
    if (idx === 12) f.moic = null;
    return { inv, f };
  });
  // Holding #37 appears for the first time in July (new holding in Fund III).
  const newInv = { name: "Lantern Field Services", fundIdx: 2, entryDate: utc(2026, 7, 15), f: { cost: 22_000_000, contributions: 22_000_000, distributions: 0, nav: 22_000_000, irr: null, moic: 1.0, closed: false } as Fig };

  function holdingSpec(name: string, entryDate: Date, f: Fig, asOf: Date): HoldingSpec {
    // Contributions as 1–3 negative flows after entry; distributions as positive flows.
    const n = f.contributions > 30_000_000 ? 3 : f.contributions > 12_000_000 ? 2 : 1;
    const flows: HoldingSpec["flows"] = [];
    let remaining = f.contributions;
    for (let i = 0; i < n; i++) {
      const amt = i === n - 1 ? remaining : round(f.contributions / n, 2);
      remaining = round(remaining - amt, 2);
      flows.push({ date: addDays(entryDate, i * 90), cash: -amt });
    }
    if (f.distributions > 0) {
      const half = round(f.distributions / 2, 2);
      flows.push({ date: addDays(entryDate, 400), cash: half }, { date: addDays(entryDate, 700), cash: round(f.distributions - half, 2) });
    }
    return {
      name,
      valuationDate: f.closed ? "Closed" : new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - (rand() < 0.5 ? 0 : 3) + 1, 0)),
      nav: f.closed ? null : f.nav,
      irr: f.irr,
      moic: f.moic,
      cost: f.cost,
      type: pick(["JV Interest", "Other Fund", "Direct"]),
      flows,
    };
  }

  function fundSpec(fi: number, asOf: string, rows: { inv: { name: string; fundIdx: number; entryDate: Date }; f: Fig }[], calledVariance: number): WorkbookSpec {
    const asOfDate = new Date(`${asOf}T00:00:00Z`);
    const mine = rows.filter((r) => r.inv.fundIdx === fi);
    const holdings = mine.map((r) => holdingSpec(r.inv.name, r.inv.entryDate, r.f, asOfDate));
    const sum = (k: "contributions" | "distributions") => mine.reduce((a, r) => a + r.f[k], 0);
    const navSum = mine.reduce((a, r) => a + (r.f.nav ?? 0), 0);
    const called = round(sum("contributions") * 1.04, 0); // fund calls a little more than it invests (fees, expenses)
    const distributions = round(sum("distributions") * 0.97, 0); // after carry / expenses
    const nav = round(navSum + called * 0.02, 0); // plus cash held at the fund
    const redemptions = round(called * 0.002, 0);
    const commitments = funds[fi].committedCapital!;
    const split = (v: number, gp = 0): { nonAffiliate: number; affiliate: number; gpCarry: number | null; total: number } => {
      const gpPart = round(v * gp, 0);
      const na = round((v - gpPart) * 0.93, 0);
      return { nonAffiliate: na, affiliate: v - gpPart - na, gpCarry: gp ? gpPart : null, total: v };
    };
    const totalValue = distributions + redemptions + nav;
    const tvpi = called ? totalValue / called : null;
    const measures: WorkbookSpec["measures"] = {
      commitments: split(commitments),
      called: { ...split(called), total: called + calledVariance }, // calledVariance ≠ 0 → classes don't add up (flagged)
      distributions: split(distributions, 0.08),
      redemptions: split(redemptions, 0.02),
      nav: split(nav, 0.06),
      totalValue: split(totalValue, 0.07),
    };
    const age = Math.max((asOfDate.getTime() - utc(funds[fi].vintage, 6, 1).getTime()) / (365.25 * 86_400_000), 0.75);
    const irrOf = (m: number | null) => (m === null ? null : round(Math.max(-0.3, Math.min(0.6, (m - 1) / age)), 4));
    return {
      fundName: funds[fi].name,
      asOf: asOfDate,
      returns: {
        gross: [irrOf(tvpi === null ? null : tvpi * 1.08), tvpi === null ? null : round(tvpi * 1.08, 4)],
        net: [irrOf(tvpi === null ? null : tvpi * 0.92), tvpi === null ? null : round(tvpi * 0.92, 4)],
        total: [irrOf(tvpi), tvpi === null ? null : round(tvpi, 4)],
      },
      measures,
      holdings,
      portfolioNavTotal: "sum",
      mtmTotalCost: "sum",
    };
  }

  async function importFund(fi: number, asOf: string, rows: { inv: { name: string; fundIdx: number; entryDate: Date }; f: Fig }[], calledVariance: number, extraResolutions?: (parsed: ParsedWorkbook) => UserResolutions) {
    const spec = fundSpec(fi, asOf, rows, calledVariance);
    if (spec.holdings.length === 0) return;
    const wb = await buildExcel(spec);
    const dir = path.resolve(process.env.STORAGE_DIR || "./storage", "imports", "demo");
    await mkdir(dir, { recursive: true });
    const short = ["I", "II", "III", "IV"][fi];
    const file = path.join(dir, `${asOf.replace(/-/g, "")}_DAP${short}_TB_Analysis.xlsx`);
    await wb.xlsx.writeFile(file);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await ingestWorkbook(buffer, path.basename(file), "seed");
    if (res.status !== "pending") throw new Error(`Seed workbook failed to parse:\n${res.problems?.join("\n")}`);
    if (extraResolutions) {
      const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: res.batchId } });
      const parsed = JSON.parse(batch.parsedJson!) as ParsedWorkbook;
      const user = extraResolutions(parsed);
      await prisma.importBatch.update({ where: { id: res.batchId }, data: { resolutionsJson: JSON.stringify(user) } });
      const resolved = await resolveWorkbook(parsed, user);
      if (resolved.unresolvedCount) throw new Error(`Seed: ${resolved.unresolvedCount} unresolved rows`);
    }
    const out = await commitBatch(res.batchId);
    // Backdate the log entries so the history reads naturally.
    const stamp = addDays(new Date(`${asOf}T00:00:00Z`), 9 + fi);
    await prisma.importBatch.update({ where: { id: res.batchId }, data: { uploadedAt: stamp, committedAt: stamp } });
    console.log(`Imported ${path.basename(file)}: ${out.snapshots} snapshots, ${out.createdInvestments} new investment(s)`);
  }

  // Committed capital (a fund term) sized above what the demo has called.
  for (let fi = 0; fi < funds.length; fi++) {
    const called = figures.filter((f) => f.inv.fundIdx === fi).reduce((a, f) => a + f.m1.contributions, 0) + (fi === 2 ? newInv.f.contributions : 0);
    const committed = Math.ceil((called * (fi === 0 ? 1.05 : fi === 3 ? 4 : 1.6)) / 25_000_000) * 25_000_000;
    funds[fi] = await prisma.fund.update({ where: { id: funds[fi].id }, data: { committedCapital: committed } });
  }

  const m1rows = figures.map(({ inv, m1 }) => ({ inv, f: m1 }));
  const m2rows = [...month2, { inv: newInv, f: newInv.f }];
  for (let fi = 0; fi < funds.length; fi++) await importFund(fi, SNAPSHOT_1, m1rows, 0);
  for (let fi = 0; fi < funds.length; fi++) {
    await importFund(fi, SNAPSHOT_2, m2rows, fi === 1 ? 2_500 : 0, fi === 2 ? (parsed) => {
      const idx = parsed.investments.findIndex((r) => r.name === newInv.name);
      return { funds: {}, investments: { [idx]: { createNew: true, bucket: "Energy" } } };
    } : undefined);
  }

  const totals = {
    funds: await prisma.fund.count(),
    investments: await prisma.investment.count(),
    deals: dealCount,
    stageEvents: await prisma.dealStageEvent.count(),
    actionItems: await prisma.actionItem.count(),
    snapshots: await prisma.financialSnapshot.count(),
    imports: await prisma.importBatch.count(),
  };
  console.log("Seeded demo data:", totals);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
