// Real starting point (no demo data): the team's weekly action items from prisma/real/action-items.json.
// Funds and holdings arrive through the Import page from accounting's workbooks.
// Run: npm run db:real   (wipe first with npm run db:wipe, or use npm run db:reset:real)
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface Item {
  entity: string;
  title: string;
  owner: string;
  ownerNote?: string;
  due?: string; // yyyy-mm-dd, optional
}

async function main() {
  const file = path.join(__dirname, "real", "action-items.json");
  const items = JSON.parse(readFileSync(file, "utf8")) as Item[];
  const team = (process.env.TEAM_MEMBERS ?? "Sean,AJ,Teddy").split(",").map((s) => s.trim());
  const meetingDate = new Date(); // this week's meeting; edit `due` in the JSON to add deadlines
  let created = 0;
  for (const it of items) {
    if (!team.includes(it.owner)) throw new Error(`Owner "${it.owner}" is not in TEAM_MEMBERS (${team.join(", ")})`);
    const title = `${it.entity} — ${it.title}`;
    const exists = await prisma.actionItem.findFirst({ where: { title } });
    if (exists) continue;
    await prisma.actionItem.create({
      data: {
        title,
        owner: it.owner,
        dueDate: it.due ? new Date(`${it.due}T12:00:00Z`) : null,
        status: "open",
        createdFrom: "meeting",
        meetingDate,
      },
    });
    created++;
  }
  console.log(`Loaded ${created} action item(s) from ${path.relative(process.cwd(), file)} (${items.length - created} already present).`);
  const flagged = items.filter((i) => i.ownerNote);
  if (flagged.length) console.log(`Owner assumed for: ${flagged.map((i) => i.entity).join(", ")} — reassign in the app if needed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
