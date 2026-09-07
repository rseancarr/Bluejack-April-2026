// Refresh holding attributes (asset class, and the bucket default where it was never changed)
// and the fund-level extra fields (e.g. the LP Capital Roll GP row) from accounting workbooks
// that are ALREADY imported — no financial figures on snapshots are changed.
//   npx tsx scripts/refresh-attributes.ts <file-or-folder>
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseWorkbook } from "../lib/import/parser";
import { resolveWorkbook } from "../lib/import/match";
import { bucketForAssetClass } from "../lib/constants";
import { GP_ROLL_KEYS } from "../lib/import/schema";

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
    // Fund-level extras (as-of matched, committed batch of the same fund): merge in the GP row figures.
    const fundRes = resolved.funds[0];
    const fund = parsed.funds[0];
    let extraNote = "";
    if (fundRes?.fundId && GP_ROLL_KEYS.carriedInterest in fund.extra) {
      const snap = await prisma.financialSnapshot.findFirst({ where: { fundId: fundRes.fundId, level: "fund", asOfDate: new Date(`${fund.asOfDate}T00:00:00Z`), batch: { status: "committed" } }, orderBy: { batch: { committedAt: "desc" } } });
      if (snap) {
        const extra = { ...(snap.extraJson ? (JSON.parse(snap.extraJson) as Record<string, unknown>) : {}) };
        for (const k of Object.values(GP_ROLL_KEYS)) extra[k] = fund.extra[k] ?? null;
        await prisma.financialSnapshot.update({ where: { id: snap.id }, data: { extraJson: JSON.stringify(extra) } });
        extraNote = "; GP row from LP Capital Roll stored";
      }
    }
    console.log(`✓ ${path.basename(file)}: ${parsed.funds[0].name} — ${n} holding(s) refreshed${parsed.notes.some((x) => x.includes("Asset Class")) ? " (no Asset Class column in this file)" : ""}${extraNote}`);
  }
  console.log(`\n${updated} holding(s) updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
