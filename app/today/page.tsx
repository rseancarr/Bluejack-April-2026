import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { teamMembers } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { actionItemInclude, linkOf, sortByUrgency, startOfDay, taskForDialog, type ActionItemRow } from "@/lib/queries/actionItems";
import { TaskLink } from "@/components/actionItems/TaskLink";
import { DoneToggle } from "@/components/actionItems/DoneToggle";
import { PinToggle } from "@/components/actionItems/PinToggle";
import { TodayControls } from "./TodayControls";
import { CalendarSetup } from "./CalendarSetup";
import { meetingsForDay, type Meeting } from "@/lib/calendar/outlook";
import { dateKey, dayBounds, fmtDayLong, fmtTime, isValidDateKey, shiftDate, teamTimeZone } from "@/lib/calendar/day";

export const dynamic = "force-dynamic";

type Format = "card" | "page";

function meetingLine(m: Meeting, tz: string): string {
  const when = m.allDay ? "All day" : `${fmtTime(m.start, tz)}–${fmtTime(m.end, tz)}`;
  const where = [m.video, m.location].filter(Boolean).join(" · ");
  return `${when}  ${m.title}${where ? ` (${where})` : ""}`;
}

function cardText(who: string, date: string, groups: { title: string; items: ActionItemRow[] }[], meetings: Meeting[], tz: string): string {
  const lines = [`${who} — ${date}`, ""];
  if (meetings.length) {
    lines.push("MEETINGS");
    for (const m of meetings) {
      lines.push(meetingLine(m, tz));
      if (m.agenda) lines.push(`    ${m.agenda.split("\n")[0].slice(0, 140)}`);
    }
    lines.push("");
  }
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

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ who?: string; format?: string; date?: string }> }) {
  const sp = await searchParams;
  const me = await currentUser();
  const members = teamMembers();
  const who = sp.who && members.includes(sp.who) ? sp.who : me;
  const format: Format = sp.format === "page" ? "page" : "card";
  const now = new Date();
  const tz = teamTimeZone();
  const todayKey = dateKey(now, tz);
  const date = isValidDateKey(sp.date) ? sp.date : todayKey;
  const isToday = date === todayKey;
  const today = startOfDay(now);

  // Meetings from the person's published Outlook calendar, if one is on file.
  const calRow = await prisma.teamCalendar.findUnique({ where: { owner: who } });
  const { start: dayStart, end: dayEnd } = dayBounds(date, tz);
  const cal = calRow ? await meetingsForDay(calRow.url, dayStart, dayEnd) : null;
  const meetings = cal?.ok ? cal.meetings : [];
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const weekEnd = new Date(today.getTime() + 7 * 86_400_000);

  const open = sortByUrgency(await prisma.actionItem.findMany({ where: { owner: who, status: "open" }, include: actionItemInclude }));
  const pinned = open.filter((i) => i.pinned);
  const rest = open.filter((i) => !i.pinned);
  const overdue = rest.filter((i) => i.dueDate && i.dueDate < today);
  const dueToday = rest.filter((i) => i.dueDate && i.dueDate >= today && i.dueDate < tomorrow);
  const thisWeek = rest.filter((i) => i.dueDate && i.dueDate >= tomorrow && i.dueDate < weekEnd);
  const later = rest.filter((i) => !i.dueDate || i.dueDate >= weekEnd);
  // The card holds a limited number of lines; the page holds everything. Meetings use up card lines first.
  const meetingLines = meetings.reduce((a, m) => a + 1 + (m.agenda ? 1 : 0), 0);
  const cap = format === "card" ? Math.max(4, 10 - meetingLines) : 60;
  const noteLines = format === "card" && meetingLines > 0 ? 2 : 4;
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
  const dateLabel = fmtDayLong(date);
  const text = cardText(who, dateLabel, shown, meetings, tz);
  const agendaChars = format === "card" ? 160 : 600;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>My day</h1>
          <div className="muted mt-0.5">Pick a name, star the must-dos, print the card and put it on the desk. Ticking a box here updates the list for everyone.</div>
        </div>
        <TodayControls who={who} members={members} format={format} text={text} date={date} isToday={isToday} prev={shiftDate(date, -1)} next={shiftDate(date, 1)} />
      </div>
      <div className="no-print flex flex-wrap items-start gap-3">
        <CalendarSetup who={who} hasLink={!!calRow} error={cal && !cal.ok ? `Could not read ${who}'s calendar: ${cal.error}` : null} />
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

        {calRow && (
          <section className="daycard-group daycard-meetings">
            <h3>Meetings{meetings.length ? ` · ${meetings.length}` : ""}</h3>
            {cal && !cal.ok ? (
              <div className="faint text-[12px]">Calendar not available right now.</div>
            ) : meetings.length === 0 ? (
              <div className="faint text-[12px]">No meetings on the calendar{isToday ? " today" : ""}.</div>
            ) : (
              <ul>
                {meetings.map((m) => (
                  <li key={m.id} className="daycard-meeting">
                    <span className="daycard-when">{m.allDay ? "All day" : <>{fmtTime(m.start, tz)}<span className="faint">–{fmtTime(m.end, tz)}</span></>}</span>
                    <span className="daycard-text">
                      <span className="daycard-title">{m.title}{m.recurring && <span className="faint text-[10.5px] ml-1" title="Recurring">↻</span>}</span>
                      <span className="daycard-meta">
                        {m.video && <span>{m.video}</span>}
                        {m.location && <span>{m.location}</span>}
                        {m.attendees.length > 0 && (
                          <span title={m.attendees.join(", ")}>
                            {m.attendees.slice(0, 4).map((a) => a.split(" ")[0]).join(", ")}{m.attendees.length > 4 ? ` +${m.attendees.length - 4}` : ""}
                          </span>
                        )}
                      </span>
                      {m.agenda && (
                        <span className="daycard-agenda">{m.agenda.length > agendaChars ? `${m.agenda.slice(0, agendaChars).trimEnd()}…` : m.agenda}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

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
                        <span className="daycard-title"><TaskLink task={taskForDialog(it)} /></span>
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
            {Array.from({ length: noteLines }, (_, i) => <div key={i} />)}
          </div>
        </section>
      </div>
    </div>
  );
}
