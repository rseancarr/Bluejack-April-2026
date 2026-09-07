// Move every action item and deal from one owner name to another.
//   npm run rename-owner -- "Avery" "AJ"
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const [from, to] = process.argv.slice(2);
  if (!from || !to) {
    console.log('usage: npm run rename-owner -- "Old Name" "New Name"');
    process.exit(1);
  }
  const [a, d] = await Promise.all([
    prisma.actionItem.updateMany({ where: { owner: from }, data: { owner: to } }),
    prisma.deal.updateMany({ where: { owner: from }, data: { owner: to } }),
  ]);
  console.log(`${from} → ${to}: ${a.count} action item(s), ${d.count} deal(s) reassigned.`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
