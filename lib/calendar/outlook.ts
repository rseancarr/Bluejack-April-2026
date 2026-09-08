// Read a published Outlook calendar (.ics link) and list one day's meetings.
// Nothing here is a financial figure; it is a convenience view of the invite text as Outlook publishes it.
import ical, { type VEvent, type ParameterValue } from "node-ical";

export interface Meeting {
  id: string;
  start: Date;
  end: Date;
  allDay: boolean;
  title: string;
  location: string | null;
  /** "Teams" / "Zoom" / "Google Meet" when a video link is present. */
  video: string | null;
  organizer: string | null;
  attendees: string[];
  /** Invite body with meeting-link boilerplate removed; empty when there is none. */
  agenda: string;
  cancelled: boolean;
  recurring: boolean;
}

const val = (p: ParameterValue | undefined): string => (p === undefined || p === null ? "" : typeof p === "string" ? p : String(p.val ?? ""));
const param = (p: ParameterValue<string, Record<string, string>> | undefined, k: string): string | undefined => (p && typeof p !== "string" ? p.params?.[k] : undefined);

function personName(p: ParameterValue<string, Record<string, string>> | undefined): string | null {
  if (!p) return null;
  const cn = param(p, "CN")?.trim();
  if (cn) return cn.replace(/^"|"$/g, "");
  const v = val(p).replace(/^mailto:/i, "").trim();
  return v || null;
}

const VIDEO: [RegExp, string][] = [
  [/teams\.microsoft\.com|teams\.live\.com/i, "Teams"],
  [/zoom\.us\//i, "Zoom"],
  [/meet\.google\.com/i, "Google Meet"],
  [/webex\.com/i, "Webex"],
];

/** Strip the "Microsoft Teams meeting / Join on your computer…" block and bare links from an invite body. */
export function cleanAgenda(text: string | undefined | null): string {
  if (!text) return "";
  let t = text.replace(/\r\n?/g, "\n");
  // Everything from the Teams/Zoom boilerplate divider onward is not agenda.
  const cut = t.search(/_{10,}|Microsoft Teams (meeting|Need help\?)|Join (on your computer|Zoom Meeting|the meeting now)|Meeting ID:|Click here to join/i);
  if (cut >= 0) t = t.slice(0, cut);
  t = t
    .replace(/<https?:\/\/[^>]+>/g, "") // "Click here<https://…>"
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t;
}

const PLACEHOLDER: [RegExp, string][] = [
  [/^(microsoft\s+)?teams(\s+meeting)?$/i, "Teams"],
  [/^zoom(\s+meeting)?$/i, "Zoom"],
  [/^google\s+meet$/i, "Google Meet"],
  [/^webex(\s+meeting)?$/i, "Webex"],
];

function toMeeting(ev: VEvent, start: Date, end: Date, recurring: boolean, idSuffix: string): Meeting {
  const description = val(ev.description as ParameterValue | undefined);
  const location = val(ev.location as ParameterValue | undefined).trim() || null;
  const haystack = `${location ?? ""}\n${description}\n${String((ev as unknown as Record<string, unknown>)["x-microsoft-skypeteamsmeetingurl"] ?? "")}`;
  // Outlook often puts "Microsoft Teams Meeting" (or "Zoom Meeting") in the location field: a placeholder, not a room.
  const placeholder = location ? PLACEHOLDER.find(([re]) => re.test(location))?.[1] ?? null : null;
  const video = placeholder ?? VIDEO.find(([re]) => re.test(haystack))?.[1] ?? null;
  const attendeesRaw = ev.attendee ? (Array.isArray(ev.attendee) ? ev.attendee : [ev.attendee]) : [];
  const attendees = attendeesRaw.map((a) => personName(a as ParameterValue<string, Record<string, string>>)).filter((x): x is string => !!x);
  return {
    id: `${ev.uid ?? ev.summary}${idSuffix}`,
    start,
    end,
    allDay: ev.datetype === "date",
    title: val(ev.summary as ParameterValue | undefined).trim() || "(no title)",
    location: location && (placeholder || VIDEO.some(([re]) => re.test(location))) ? null : location,
    video,
    organizer: personName(ev.organizer as ParameterValue<string, Record<string, string>> | undefined),
    attendees,
    agenda: cleanAgenda(description),
    cancelled: String(ev.status ?? "").toUpperCase() === "CANCELLED",
    recurring,
  };
}

/** Every meeting that overlaps [from, to), from parsed ICS text. Recurring series are expanded; cancelled instances dropped. */
export function meetingsBetween(icsText: string, from: Date, to: Date): Meeting[] {
  const data = ical.sync.parseICS(icsText);
  const out: Meeting[] = [];
  for (const item of Object.values(data)) {
    if (!item || (item as { type?: string }).type !== "VEVENT") continue;
    const ev = item as VEvent;
    if (ev.rrule) {
      for (const inst of ical.expandRecurringEvent(ev, { from, to, expandOngoing: true })) {
        const m = toMeeting(inst.event as VEvent, inst.start, inst.end, true, `@${inst.start.toISOString()}`);
        if (m.start < to && m.end > from) out.push(m);
      }
      continue;
    }
    if (!ev.start) continue;
    const start = ev.start as Date;
    const end = (ev.end as Date | undefined) ?? (ev.datetype === "date" ? new Date(start.getTime() + 86_400_000) : new Date(start.getTime() + 30 * 60_000));
    if (start < to && end > from) out.push(toMeeting(ev, start, end, false, ""));
  }
  return out.filter((m) => !m.cancelled).sort((a, b) => (a.allDay === b.allDay ? a.start.getTime() - b.start.getTime() : a.allDay ? -1 : 1));
}

// ---- fetching, with a short in-memory cache so every page view does not hit Outlook ----
const cache = new Map<string, { at: number; text: string }>();
const TTL_MS = 5 * 60_000;

export function isAcceptableCalendarUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return "That is not a web address.";
  }
  if (u.protocol !== "https:") return "The link must start with https://";
  return null;
}

export async function fetchCalendarText(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.text;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "text/calendar, */*" }, cache: "no-store" });
    if (!res.ok) throw new Error(`Outlook answered ${res.status} ${res.statusText}`);
    const text = await res.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("The link did not return a calendar (.ics) file. Use the ICS link, not the HTML one.");
    cache.set(url, { at: Date.now(), text });
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export type DayCalendar = { ok: true; meetings: Meeting[]; fetchedAt: Date } | { ok: false; error: string };

export async function meetingsForDay(url: string, from: Date, to: Date): Promise<DayCalendar> {
  try {
    const text = await fetchCalendarText(url);
    return { ok: true, meetings: meetingsBetween(text, from, to), fetchedAt: new Date(cache.get(url)?.at ?? Date.now()) };
  } catch (e) {
    return { ok: false, error: (e as Error).name === "AbortError" ? "Outlook took too long to answer." : (e as Error).message };
  }
}
