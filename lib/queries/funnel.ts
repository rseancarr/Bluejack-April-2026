// Shared funnel computation for the page and the CSV export. Filters → plain data.
import { prisma } from "@/lib/db";
import { FUNNEL_STAGES, STAGES } from "@/lib/constants";
import { fullYear, funnel, medianDaysInStageByYear, samePeriod, sourcedBySourceType, type FunnelResult } from "@/lib/metrics/funnel";

export interface FunnelFilters {
  fund?: string;
  bucket?: string;
  sourceType?: string;
  owner?: string;
  view?: "full" | "same";
}

export interface FunnelData {
  years: number[];
  view: "full" | "same";
  through: Date;
  byYear: Record<number, FunnelResult>;
  sourceTypes: Record<number, Record<string, number>>;
  sourceTypeKeys: string[];
  medianDays: Record<number, Partial<Record<(typeof STAGES)[number], number | null>>>;
  dealCount: number;
}

export async function computeFunnel(filters: FunnelFilters, now = new Date()): Promise<FunnelData> {
  const deals = await prisma.deal.findMany({
    where: {
      funds: filters.fund ? { some: { fundId: filters.fund } } : undefined,
      bucket: filters.bucket || undefined,
      sourceType: filters.sourceType || undefined,
      owner: filters.owner || undefined,
    },
    select: { id: true, estSize: true, sourceType: true, dateSourced: true },
  });
  const ids = deals.map((d) => d.id);
  const events = ids.length ? await prisma.dealStageEvent.findMany({ where: { dealId: { in: ids } }, select: { dealId: true, stage: true, enteredAt: true } }) : [];

  const thisYear = now.getUTCFullYear();
  const minYear = Math.min(thisYear, ...deals.map((d) => d.dateSourced.getUTCFullYear()), ...events.map((e) => e.enteredAt.getUTCFullYear()));
  const years: number[] = [];
  for (let y = thisYear; y >= Math.max(minYear, thisYear - 5); y--) years.push(y);
  const view = filters.view === "same" ? "same" : "full";

  const byYear: Record<number, FunnelResult> = {};
  for (const y of years) byYear[y] = funnel(deals, events, view === "same" || y === thisYear ? samePeriod(y, now) : fullYear(y));

  const st = sourcedBySourceType(deals, years, view === "same" ? now : undefined);
  const sourceTypes: Record<number, Record<string, number>> = {};
  const keys = new Set<string>();
  for (const y of years) {
    sourceTypes[y] = st.get(y) ?? {};
    for (const k of Object.keys(sourceTypes[y])) keys.add(k);
  }
  const md = medianDaysInStageByYear(events);
  const medianDays: FunnelData["medianDays"] = {};
  for (const y of years) medianDays[y] = md.get(y) ?? {};

  return { years, view, through: now, byYear, sourceTypes, sourceTypeKeys: ["banker", "sponsor", "proprietary", "other"].filter((k) => keys.has(k) || true), medianDays, dealCount: deals.length };
}

export function funnelToCsv(data: FunnelData): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: (string | number)[][] = [];
  const periodLabel = (y: number) => (data.view === "same" || y === data.through.getUTCFullYear() ? `${y} through ${data.through.toISOString().slice(5, 10)}` : `${y} full year`);
  lines.push(["Funnel", data.view === "same" ? `same period through ${data.through.toISOString().slice(0, 10)}` : "full calendar years"]);
  lines.push(["Stage", ...data.years.flatMap((y) => [`${periodLabel(y)} count`, `${periodLabel(y)} est. size USD`, `${periodLabel(y)} missing size`, `${periodLabel(y)} conversion from prev`])]);
  for (const s of FUNNEL_STAGES) {
    lines.push([s, ...data.years.flatMap((y) => {
      const r = data.byYear[y].stages.find((x) => x.stage === s)!;
      return [r.count, r.size.sum ?? "", r.size.missing, r.conversionFromPrev ?? ""];
    })]);
  }
  lines.push(["Passed", ...data.years.flatMap((y) => [data.byYear[y].passed.count, data.byYear[y].passed.size.sum ?? "", data.byYear[y].passed.size.missing, ""])]);
  lines.push([]);
  lines.push(["Sourced by source type", ...data.years.map((y) => periodLabel(y))]);
  for (const k of data.sourceTypeKeys) lines.push([k, ...data.years.map((y) => data.sourceTypes[y][k] ?? 0)]);
  lines.push([]);
  lines.push(["Median days in stage (by year entered)", ...data.years.map(String)]);
  for (const s of STAGES) lines.push([s, ...data.years.map((y) => data.medianDays[y][s] ?? "")]);
  return lines.map((l) => l.map(esc).join(",")).join("\n");
}
