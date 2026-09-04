// Command-line importer for accounting workbooks (one fund per file).
//   npx tsx scripts/import.ts <file-or-folder> [--create-missing] [--by <name>]
// Parses each .xlsx/.xlsm, resolves the fund and holdings by name mapping, and commits.
// Unmatched rows stop the file unless --create-missing is given, in which case the fund
// (vintage from the file name's year if not known) and holdings are created — same as
// clicking "Create fund" / "Create new" in the preview. Nothing is guessed about figures.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { ingestWorkbook } from "../lib/import/ingest";
import { resolveWorkbook, type UserResolutions } from "../lib/import/match";
import { commitBatch } from "../lib/import/commit";
import type { ParsedWorkbook } from "../lib/import/parser";

const prisma = new PrismaClient();

async function importOne(file: string, createMissing: boolean, by: string) {
  const buffer = readFileSync(file);
  const res = await ingestWorkbook(buffer, path.basename(file), by);
  if (res.status !== "pending") {
    console.log(`✗ ${path.basename(file)}: parse failed\n   - ${res.problems?.join("\n   - ")}`);
    return false;
  }
  const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: res.batchId } });
  const parsed = JSON.parse(batch.parsedJson!) as ParsedWorkbook;
  const user: UserResolutions = { funds: {}, investments: {} };
  let resolved = await resolveWorkbook(parsed, user);
  if (resolved.unresolvedCount > 0) {
    if (!createMissing) {
      console.log(`✗ ${path.basename(file)}: ${resolved.unresolvedCount} unmatched row(s). Re-run with --create-missing, or resolve in the app: /import/${res.batchId}`);
      return false;
    }
    const f = resolved.funds[0];
    if (!f.fundId) {
      const name = parsed.funds[0].name;
      const vintage = Number(parsed.asOfDate.slice(0, 4));
      const fund = (await prisma.fund.findUnique({ where: { name } })) ?? (await prisma.fund.create({ data: { name, vintage, status: parsed.layout === "winddown" ? "harvesting" : "investing" } }));
      await prisma.nameMapping.upsert({ where: { sourceName: name }, create: { sourceName: name, level: "fund", fundId: fund.id }, update: { level: "fund", fundId: fund.id, investmentId: null } });
      console.log(`  + created fund "${name}" (vintage ${vintage} — edit on the fund page)`);
      resolved = await resolveWorkbook(parsed, user);
    }
    for (const inv of resolved.investments) {
      if (!inv.investmentId && !inv.createNew) {
        const type = parsed.investments[inv.index].extra["Investment Type"];
        user.investments[inv.index] = { createNew: true, bucket: typeof type === "string" && /energy/i.test(String(parsed.investments[inv.index].name)) ? "Energy" : "Opportunistic" };
      }
    }
    await prisma.importBatch.update({ where: { id: res.batchId }, data: { resolutionsJson: JSON.stringify(user) } });
  }
  try {
    const out = await commitBatch(res.batchId);
    console.log(`✓ ${path.basename(file)}: ${parsed.funds[0].name} as of ${parsed.asOfDate} — ${out.snapshots} snapshots, ${out.createdInvestments} new holding(s)${parsed.notes.length ? `\n   notes: ${parsed.notes.join(" | ").slice(0, 400)}` : ""}`);
    return true;
  } catch (e) {
    console.log(`✗ ${path.basename(file)}: ${(e as Error).message}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) {
    console.log("usage: npx tsx scripts/import.ts <file-or-folder> [--create-missing] [--by <name>]");
    process.exit(1);
  }
  const createMissing = args.includes("--create-missing");
  const by = args[args.indexOf("--by") + 1] && args.includes("--by") ? args[args.indexOf("--by") + 1] : "cli";
  const files = statSync(target).isDirectory()
    ? readdirSync(target).filter((f) => /\.(xlsx|xlsm)$/i.test(f) && !f.startsWith("~$")).sort().map((f) => path.join(target, f))
    : [target];
  let ok = 0;
  for (const f of files) if (await importOne(f, createMissing, by)) ok++;
  console.log(`\n${ok}/${files.length} file(s) committed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
