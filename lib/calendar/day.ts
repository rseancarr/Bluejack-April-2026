// Day boundaries and time formatting in the team's time zone (no date library needed).

export function teamTimeZone(): string {
  return process.env.TEAM_TIMEZONE?.trim() || "America/Los_Angeles";
}

const partsFmt = new Map<string, Intl.DateTimeFormat>();
function fmtFor(tz: string) {
  let f = partsFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    partsFmt.set(tz, f);
  }
  return f;
}

/** The wall-clock parts of an instant in a zone. */
function zoned(d: Date, tz: string) {
  const p = Object.fromEntries(fmtFor(tz).formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

/** Calendar date (yyyy-mm-dd) of an instant in a zone. */
export function dateKey(d: Date, tz: string): string {
  const z = zoned(d, tz);
  return `${z.y}-${String(z.m).padStart(2, "0")}-${String(z.d).padStart(2, "0")}`;
}

/** UTC instant of local midnight at the start of `yyyy-mm-dd` in `tz`. */
export function zonedMidnight(dateStr: string, tz: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  let guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  for (let i = 0; i < 2; i++) {
    const z = zoned(new Date(guess), tz);
    const asUtc = Date.UTC(z.y, z.m - 1, z.d, z.h, z.mi, z.s);
    guess -= asUtc - Date.UTC(y, m - 1, d, 0, 0, 0);
  }
  return new Date(guess);
}

/** [start, end) of a calendar day in a zone. */
export function dayBounds(dateStr: string, tz: string): { start: Date; end: Date } {
  const start = zonedMidnight(dateStr, tz);
  const next = new Date(Date.UTC(...(dateStr.split("-").map(Number) as [number, number, number]).map((v, i) => (i === 1 ? v - 1 : v)) as [number, number, number]) + 86_400_000);
  return { start, end: zonedMidnight(dateKey(next, "UTC"), tz) };
}

export function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return dateKey(new Date(Date.UTC(y, m - 1, d + days, 12)), "UTC");
}

export function fmtTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d).replace(" ", " ").toLowerCase();
}

export function fmtDayLong(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function isValidDateKey(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}
