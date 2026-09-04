// Demo seed. ALL DATA HERE IS FAKE. Run: npm run db:seed   (wipe first: npm run db:wipe)
//
// Financial snapshots are NOT written directly: the seed builds two demo accounting
// workbooks (matching lib/import/schema.ts), writes them to storage/imports/demo/,
// and pushes them through the real parser → resolve → commit path. That keeps the
// seed honest and gives you two files to re-import by hand.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { ingestWorkbook } from "../lib/import/ingest";
import { commitBatch } from "../lib/import/commit";
import { resolveWorkbook, type UserResolutions } from "../lib/import/match";
import type { ParsedWorkbook } from "../lib/import/parser";
import { FUND_COLUMNS, INVESTMENT_COLUMNS } from "../lib/import/schema";
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
const SNAPSHOT_1 = "2026-06-30";
const SNAPSHOT_2 = "2026-07-31";

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
    { name: "Demo Fund I", vintage: 2021, committedCapital: 250_000_000, status: "harvesting", externalId: "DF-I" },
    { name: "Demo Fund II", vintage: 2023, committedCapital: 400_000_000, status: "investing", externalId: "DF-II" },
    { name: "Demo Fund III", vintage: 2025, committedCapital: 500_000_000, status: "investing", externalId: "DF-III" },
    { name: "Demo Fund IV", vintage: 2026, committedCapital: 600_000_000, status: "investing", externalId: null },
  ];
  const funds: Awaited<ReturnType<typeof prisma.fund.create>>[] = [];
  for (const f of fundDefs) {
    funds.push(
      await prisma.fund.create({
        data: { ...f, mgmtFeePct: 2.0, carryPct: 20.0, hurdlePct: 8.0, notes: "Demo data — not a real fund." },
      }),
    );
  }
  // Fund IV has no accounting ID yet → matched by name mapping.
  await prisma.nameMapping.create({ data: { sourceName: "Demo Fund IV", level: "fund", fundId: funds[3].id } });

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
      const withId = !(fi === 0 && k >= 11) && fi !== 3; // a few legacy names + Fund IV rows have no accounting ID
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
          externalId: withId ? `INV-${String(seq).padStart(3, "0")}` : null,
          contacts: `${pick(["Jamie", "Taylor", "Casey", "Riley", "Drew"])} ${pick(["Chen", "Okafor", "Patel", "Nguyen", "Garcia"])} — CEO\n${pick(["Sam", "Alex", "Jordan"])} ${pick(["Kim", "Lopez", "Schmidt"])} — CFO`,
          notes: realized ? "Exited. Demo data." : pick(["Board seat held.", "Add-on pipeline active.", "Refinancing under review.", "Demo data."]),
        },
      });
      if (!withId) await prisma.nameMapping.create({ data: { sourceName: name, level: "investment", investmentId: inv.id } });
      investments.push({ id: inv.id, name, fundIdx: fi, bucket, externalId: inv.externalId, status: inv.status, entryDate, cost, ageYears: Math.max(ageYears, 0.1) });
      seq++;
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

  // ---------- Two months of accounting workbooks → real import path ----------
  // Figures per investment for month 1, drifted for month 2.
  const figures = investments.map((inv) => {
    const contributions = round(inv.cost * between(1.0, 1.08), 0);
    const realized = inv.status === "realized";
    const distributions = realized ? round(inv.cost * between(1.6, 2.6), 0) : inv.ageYears > 2 ? round(inv.cost * between(0, 0.4), 0) : 0;
    const nav = realized ? 0 : round(inv.cost * between(0.85, 1.9), 0);
    const moic = round((distributions + nav) / inv.cost, 2);
    const irr = round(Math.max(-0.3, Math.min(0.6, (moic - 1) / Math.max(inv.ageYears, 0.75))), 4);
    return { inv, m1: { cost: inv.cost, contributions, distributions, nav, irr, moic } };
  });

  type Fig = { cost: number | null; contributions: number | null; distributions: number | null; nav: number | null; irr: number | null; moic: number | null };
  const month2 = figures.map(({ inv, m1 }, idx) => {
    const drift = idx === 4 ? 1.22 : idx === 9 ? 0.78 : between(0.97, 1.05); // two big mark moves to flag in preview
    const nav = m1.nav === 0 ? 0 : round(m1.nav * drift, 0);
    const f: Fig = { ...m1, nav, moic: round((m1.distributions + nav) / m1.cost, 2) };
    if (idx === 7) f.irr = null; // deliberately missing in July → shows "—" with tooltip
    if (idx === 12) f.moic = null;
    return { inv, f };
  });
  // Investment #37 appears for the first time in July (new investment in Fund III).
  const newInv = { name: "Lantern Field Services", fundIdx: 2, externalId: "INV-999", f: { cost: 22_000_000, contributions: 22_000_000, distributions: 0, nav: 22_000_000, irr: null, moic: 1.0 } as Fig };

  async function buildWorkbook(asOf: string, rows: { inv: { name: string; fundIdx: number; externalId: string | null }; f: Fig }[], fundVarianceIdx: number | null) {
    const wb = new ExcelJS.Workbook();
    const asOfDate = new Date(`${asOf}T00:00:00Z`);
    const fundsWs = wb.addWorksheet("Funds");
    fundsWs.addRow(Object.values(FUND_COLUMNS));
    const invWs = wb.addWorksheet("Investments");
    invWs.addRow([...Object.values(INVESTMENT_COLUMNS), "Unrealized Gain"]);
    for (let fi = 0; fi < funds.length; fi++) {
      const mine = rows.filter((r) => r.inv.fundIdx === fi);
      const sum = (k: keyof Fig) => mine.reduce((a, r) => a + (r.f[k] ?? 0), 0);
      const contributions = sum("contributions");
      const distributions = sum("distributions");
      const nav = sum("nav") + (fundVarianceIdx === fi ? 2500 : 0); // deliberate reconciliation variance
      const cost = sum("cost");
      fundsWs.addRow([
        funds[fi].externalId,
        funds[fi].name,
        asOfDate,
        cost,
        contributions,
        distributions,
        nav,
        mine.length ? round((distributions + nav) / Math.max(contributions, 1) - 1, 4) / 2 : null,
        mine.length ? round((distributions + nav) / Math.max(contributions, 1), 2) : null,
      ]);
    }
    for (const r of rows) {
      const fund = funds[r.inv.fundIdx];
      invWs.addRow([
        r.inv.externalId,
        r.inv.name,
        fund.externalId,
        fund.name,
        asOfDate,
        r.f.cost,
        r.f.contributions,
        r.f.distributions,
        r.f.nav,
        r.f.irr,
        r.f.moic,
        r.f.nav !== null && r.f.cost !== null ? r.f.nav - r.f.cost : null,
      ]);
    }
    const dir = path.resolve(process.env.STORAGE_DIR || "./storage", "imports", "demo");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `Demo_Accounting_${asOf}.xlsx`);
    await wb.xlsx.writeFile(file);
    return { file, buffer: Buffer.from(await wb.xlsx.writeBuffer()) };
  }

  async function importFile(asOf: string, rows: { inv: { name: string; fundIdx: number; externalId: string | null }; f: Fig }[], varianceIdx: number | null, extraResolutions?: (parsed: ParsedWorkbook) => UserResolutions) {
    const { file, buffer } = await buildWorkbook(asOf, rows, varianceIdx);
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
    await prisma.importBatch.update({ where: { id: res.batchId }, data: { uploadedAt: addDays(new Date(`${asOf}T00:00:00Z`), 9), committedAt: addDays(new Date(`${asOf}T00:00:00Z`), 9) } });
    console.log(`Imported ${path.basename(file)}: ${out.snapshots} snapshots, ${out.createdInvestments} new investment(s)`);
  }

  // Committed capital (a fund term, not accounting data) sized above what the demo has called.
  for (let fi = 0; fi < funds.length; fi++) {
    const called = figures.filter((f) => f.inv.fundIdx === fi).reduce((a, f) => a + f.m1.contributions, 0) + (fi === 2 ? newInv.f.contributions! : 0);
    const committed = Math.ceil((called * (fi === 0 ? 1.05 : fi === 3 ? 4 : 1.6)) / 25_000_000) * 25_000_000;
    await prisma.fund.update({ where: { id: funds[fi].id }, data: { committedCapital: committed } });
  }

  await importFile(SNAPSHOT_1, figures.map(({ inv, m1 }) => ({ inv, f: m1 })), null);
  await importFile(SNAPSHOT_2, [...month2, { inv: newInv, f: newInv.f }], 1, (parsed) => {
    const idx = parsed.investments.findIndex((r) => r.name === newInv.name);
    return { funds: {}, investments: { [idx]: { createNew: true, bucket: "Energy" } } };
  });

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
