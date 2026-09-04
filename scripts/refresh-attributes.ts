// Refresh holding attributes (asset class, and the bucket default where it was never changed)
// from accounting workbooks that are ALREADY imported — no snapshots are written.
//   npx tsx scripts/refresh-attributes.ts <file-or-folder>
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseWorkbook } from "../lib/import/parser";
import { resolveWorkbook } from "../lib/import/match";
import { bucketForAssetClass } from "../lib/constants";

const prisma = new PrismaClient();

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.log("usage: npx tsx scripts/refresh-attributes.ts <file-or-folder>");
    process.exit(1);
  }
  const files = statSync(target).isDirectory()
    ? readdirSync(target).filter((f) => /\.(xlsx|xlsm)$/i.test(f) && !f.startsWith("~$")).sort().map((f) => path.join(target, f))
    : [target];
  let updated = 0;
  for (const file of files) {
    let parsed;
    try {
      parsed = await parseWorkbook(readFileSync(file));
    } catch (e) {
      console.log(`✗ ${path.basename(file)}: ${(e as Error).message.split("\n")[0]}`);
      continue;
    }
    const resolved = await resolveWorkbook(parsed);
    let n = 0;
    for (const r of resolved.investments) {
      const row = parsed.investments[r.index];
      if (!r.investmentId || !row.assetClass) continue;
      const inv = await prisma.investment.findUnique({ where: { id: r.investmentId } });
      if (!inv) continue;
      const data: { assetClass: string; bucket?: string } = { assetClass: row.assetClass };
      // Only replace the bucket if it is still the import default (never touched by a person).
      if (inv.bucket === "Opportunistic" && bucketForAssetClass(row.assetClass) !== "Opportunistic") data.bucket = bucketForAssetClass(row.assetClass);
      await prisma.investment.update({ where: { id: r.investmentId }, data });
      n++;
    }
    updated += n;
    console.log(`✓ ${path.basename(file)}: ${parsed.funds[0].name} — ${n} holding(s) refreshed${parsed.notes.some((x) => x.includes("Asset Class")) ? " (no Asset Class column in this file)" : ""}`);
  }
  console.log(`\n${updated} holding(s) updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
