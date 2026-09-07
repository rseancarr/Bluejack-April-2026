import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { teamMembers } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { actionItemInclude, linkOf, sortByUrgency, startOfDay, type ActionItemRow } from "@/lib/queries/actionItems";
import { DoneToggle } from "@/components/actionItems/DoneToggle";
import { PinToggle } from "@/components/actionItems/PinToggle";
import { TodayControls } from "./TodayControls";

export const dynamic = "force-dynamic";

type Format = "card" | "page";

function cardText(who: string, date: string, groups: { title: string; items: ActionItemRow[] }[]): string {
  const lines = [`${who} — ${date}`, ""];
  for (const g of groups) {
    if (!g.items.length) continue;
    lines.push(g.title.toUpperCase());
    for (const it of g.items) {
      const link = linkOf(it);
      lines.push(`[ ] ${it.title}${link ? ` (${link.label})` : ""}${it.dueDate ? ` — due ${fmtDate(it.dueDate)}` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ who?: string; format?: string }> }) {
  const sp = await searchParams;
  const me = await currentUser();
  const members = teamMembers();
  const who = sp.who && members.includes(sp.who) ? sp.who : me;
  const format: Format = sp.format === "page" ? "page" : "card";
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const weekEnd = new Date(today.getTime() + 7 * 86_400_000);

  const open = sortByUrgency(await prisma.actionItem.findMany({ where: { owner: who, status: "open" }, include: actionItemInclude }));
  const pinned = open.filter((i) => i.pinned);
  const rest = open.filter((i) => !i.pinned);
  const overdue = rest.filter((i) => i.dueDate && i.dueDate < today);
  const dueToday = rest.filter((i) => i.dueDate && i.dueDate >= today && i.dueDate < tomorrow);
  const thisWeek = rest.filter((i) => i.dueDate && i.dueDate >= tomorrow && i.dueDate < weekEnd);
  const later = rest.filter((i) => !i.dueDate || i.dueDate >= weekEnd);
  // The card holds a limited number of lines; the page holds everything.
  const cap = format === "card" ? 10 : 60;
  const groups: { title: string; items: ActionItemRow[]; tone?: string }[] = [
    { title: "Must do", items: pinned },
    { title: "Overdue", items: overdue, tone: "overdue" },
    { title: "Due today", items: dueToday },
    { title: "This week", items: thisWeek },
    { title: "Also in your court", items: later },
  ];
  let budget = cap;
  const shown = groups.map((g) => {
    const take = g.items.slice(0, Math.max(0, budget));
    budget -= take.length;
    return { ...g, items: take, hidden: g.items.length - take.length };
  });
  const hiddenTotal = shown.reduce((a, g) => a + g.hidden, 0);
  const dateLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const text = cardText(who, dateLabel, shown);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>My day</h1>
          <div className="muted mt-0.5">Pick a name, star the must-dos, print the card and put it on the desk. Ticking a box here updates the list for everyone.</div>
        </div>
        <TodayControls who={who} members={members} format={format} text={text} />
      </div>

      <style>{`@media print { @page { size: ${format === "card" ? "4in 6in" : "letter"}; margin: ${format === "card" ? "0.3in" : "0.5in"}; } }`}</style>
      <div className={`daycard daycard-${format}`}>
        <div className="daycard-head">
          <div>
            <div className="daycard-name">{who}</div>
            <div className="daycard-date">{dateLabel}</div>
          </div>
          <div className="daycard-count">{open.length} open{overdue.length ? ` · ${overdue.length} overdue` : ""}</div>
        </div>

        {open.length === 0 && <div className="muted py-6 text-center">Nothing open. Enjoy it.</div>}

        {shown.map((g) =>
          g.items.length ? (
            <section key={g.title} className="daycard-group">
              <h3 className={g.tone === "overdue" ? "text-rust" : ""}>{g.title}</h3>
              <ul>
                {g.items.map((it) => {
                  const link = linkOf(it);
                  return (
                    <li key={it.id} className="daycard-item">
                      <span className="daycard-box no-print"><DoneToggle id={it.id} done={false} /></span>
                      <span className="daycard-box print-only" aria-hidden="true" />
                      <span className="daycard-text">
                        <span className="daycard-title">{it.title}</span>
                        <span className="daycard-meta">
                          {link && <Link href={link.href} className="daycard-link">{link.label}</Link>}
                          {it.dueDate && <span className={g.tone === "overdue" ? "text-rust" : ""}>due {fmtDate(it.dueDate)}</span>}
                        </span>
                      </span>
                      <PinToggle id={it.id} pinned={it.pinned} />
                    </li>
                  );
                })}
              </ul>
              {g.hidden > 0 && <div className="faint text-[11px]">+{g.hidden} more in the app</div>}
            </section>
          ) : null,
        )}

        {hiddenTotal > 0 && format === "card" && <div className="faint text-[11px] no-print">The note card shows the top {cap}. Switch to “One page” for all {open.length}.</div>}

        <section className="daycard-notes print-only" aria-hidden="true">
          <h3>New items / notes</h3>
          <div className="daycard-lines">
            <div /><div /><div /><div />
          </div>
        </section>
      </div>
    </div>
  );
}
