// Wipes ALL data (demo or real) and stored files. Run: npm run db:wipe
import { rm, readdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function clearDir(dir: string) {
  try {
    for (const entry of await readdir(dir)) {
      if (entry === ".gitkeep") continue;
      await rm(path.join(dir, entry), { recursive: true, force: true });
    }
  } catch {
    /* dir may not exist */
  }
}

async function main() {
  // Order respects foreign keys.
  await prisma.actionItem.deleteMany();
  await prisma.document.deleteMany();
  await prisma.dealStageEvent.deleteMany();
  await prisma.dealFund.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.financialSnapshot.deleteMany();
  await prisma.nameMapping.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.investment.deleteMany();
  await prisma.fund.deleteMany();

  const root = path.resolve(process.env.STORAGE_DIR || "./storage");
  await clearDir(path.join(root, "documents"));
  await clearDir(path.join(root, "imports"));
  console.log("All data wiped (database tables + storage/documents + storage/imports).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
