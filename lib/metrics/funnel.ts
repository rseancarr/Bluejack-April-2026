// Pipeline funnel math. See ./README.md for the definitions. Pure functions; no DB.
import { FUNNEL_STAGES, type FunnelStage, type Stage } from "../constants";
import { sumAvailable, type StrictSum } from "./returns";

export interface StageEventLike {
  dealId: string;
  stage: string;
  enteredAt: Date;
}

export interface DealLike {
  id: string;
  estSize: number | null;
  sourceType: string;
  dateSourced: Date;
}

export interface Period {
  start: Date; // inclusive
  end: Date; // inclusive
}

const STAGE_ORDER: Record<FunnelStage, number> = { Sourced: 0, Screening: 1, IC: 2, Closed: 3 };

export function stageOrder(stage: string): number | null {
  return stage in STAGE_ORDER ? STAGE_ORDER[stage as FunnelStage] : null;
}

/** Start of a calendar year, UTC. */
export function yearStart(year: number): Date {
  return new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
}

/** End of a calendar year, UTC (inclusive). */
export function yearEnd(year: number): Date {
  return new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
}

/** Full calendar-year period. */
export function fullYear(year: number): Period {
  return { start: yearStart(year), end: yearEnd(year) };
}

/**
 * Same period: Jan 1 of `year` through the month/day of `through` in that year
 * (end of day, UTC). Feb 29 clamps to Feb 28 when `year` is not a leap year.
 */
export function samePeriod(year: number, through: Date): Period {
  const month = through.getUTCMonth();
  let day = through.getUTCDate();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  if (day > daysInMonth) day = daysInMonth;
  return { start: yearStart(year), end: new Date(Date.UTC(year, month, day, 23, 59, 59, 999)) };
}

function inPeriod(d: Date, p: Period): boolean {
  const t = d.getTime();
  return t >= p.start.getTime() && t <= p.end.getTime();
}

/**
 * For each deal, the earliest timestamp at which it reached each funnel stage.
 * "Reached S" = earliest event at S or any later linear stage. Passed is ignored here.
 */
export function reachTimestamps(events: StageEventLike[]): Map<string, Partial<Record<FunnelStage, Date>>> {
  const byDeal = new Map<string, Partial<Record<FunnelStage, Date>>>();
  for (const ev of events) {
    const order = stageOrder(ev.stage);
    if (order === null) continue;
    const reached = byDeal.get(ev.dealId) ?? {};
    for (const s of FUNNEL_STAGES) {
      if (STAGE_ORDER[s] <= order) {
        const current = reached[s];
        if (!current || ev.enteredAt.getTime() < current.getTime()) reached[s] = ev.enteredAt;
      }
    }
    byDeal.set(ev.dealId, reached);
  }
  return byDeal;
}

/** Earliest Passed event per deal. */
export function passedTimestamps(events: StageEventLike[]): Map<string, Date> {
  const out = new Map<string, Date>();
  for (const ev of events) {
    if (ev.stage !== "Passed") continue;
    const cur = out.get(ev.dealId);
    if (!cur || ev.enteredAt < cur) out.set(ev.dealId, ev.enteredAt);
  }
  return out;
}

export interface FunnelStageResult {
  stage: FunnelStage;
  count: number;
  size: StrictSum;
  dealIds: string[];
  /** conversion INTO this stage from the previous stage; null for Sourced or when previous count is 0 */
  conversionFromPrev: number | null;
}

export interface FunnelResult {
  period: Period;
  stages: FunnelStageResult[];
  passed: { count: number; size: StrictSum; dealIds: string[] };
}

/**
 * Funnel for a period: deals whose reach-timestamp for each stage falls within the period.
 * `deals` supplies estSize; deals with events but not in `deals` are counted with null size.
 */
export function funnel(deals: DealLike[], events: StageEventLike[], period: Period): FunnelResult {
  const dealById = new Map(deals.map((d) => [d.id, d]));
  const reached = reachTimestamps(events);
  const stages: FunnelStageResult[] = [];
  let prevCount: number | null = null;

  for (const s of FUNNEL_STAGES) {
    const ids: string[] = [];
    for (const [dealId, r] of reached) {
      const ts = r[s];
      if (ts && inPeriod(ts, period)) ids.push(dealId);
    }
    const sizes = ids.map((id) => dealById.get(id)?.estSize ?? null);
    const conversionFromPrev = prevCount === null ? null : prevCount === 0 ? null : ids.length / prevCount;
    stages.push({ stage: s, count: ids.length, size: sumAvailable(sizes), dealIds: ids, conversionFromPrev });
    prevCount = ids.length;
  }

  const passedIds: string[] = [];
  for (const [dealId, ts] of passedTimestamps(events)) if (inPeriod(ts, period)) passedIds.push(dealId);
  const passedSizes = passedIds.map((id) => dealById.get(id)?.estSize ?? null);

  return { period, stages, passed: { count: passedIds.length, size: sumAvailable(passedSizes), dealIds: passedIds } };
}

/** Stage-to-stage conversion between two stage counts. Null when `from` is 0. */
export function conversionRate(from: number, to: number): number | null {
  return from === 0 ? null : to / from;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const MS_PER_DAY = 86_400_000;

/**
 * Median days spent in each stage, grouped by the year the stage was entered.
 * A stage visit ends when the deal's next stage event occurs; open visits are excluded.
 */
export function medianDaysInStageByYear(events: StageEventLike[]): Map<number, Partial<Record<Stage, number | null>>> {
  const byDeal = new Map<string, StageEventLike[]>();
  for (const ev of events) {
    const list = byDeal.get(ev.dealId) ?? [];
    list.push(ev);
    byDeal.set(ev.dealId, list);
  }
  const buckets = new Map<number, Map<string, number[]>>();
  for (const list of byDeal.values()) {
    const sorted = [...list].sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      const days = (next.enteredAt.getTime() - cur.enteredAt.getTime()) / MS_PER_DAY;
      const year = cur.enteredAt.getUTCFullYear();
      const yearMap = buckets.get(year) ?? new Map<string, number[]>();
      const arr = yearMap.get(cur.stage) ?? [];
      arr.push(days);
      yearMap.set(cur.stage, arr);
      buckets.set(year, yearMap);
    }
  }
  const out = new Map<number, Partial<Record<Stage, number | null>>>();
  for (const [year, yearMap] of buckets) {
    const rec: Partial<Record<Stage, number | null>> = {};
    for (const [stage, arr] of yearMap) rec[stage as Stage] = median(arr);
    out.set(year, rec);
  }
  return out;
}

/** Count of sourced deals by source type per year of dateSourced (optionally within a same-period window). */
export function sourcedBySourceType(
  deals: DealLike[],
  years: number[],
  through?: Date,
): Map<number, Record<string, number>> {
  const out = new Map<number, Record<string, number>>();
  for (const y of years) {
    const period = through ? samePeriod(y, through) : fullYear(y);
    const rec: Record<string, number> = {};
    for (const d of deals) {
      if (!inPeriod(d.dateSourced, period)) continue;
      rec[d.sourceType] = (rec[d.sourceType] ?? 0) + 1;
    }
    out.set(y, rec);
  }
  return out;
}

/** Number of deals sourced in a period (by dateSourced). */
export function sourcedCount(deals: DealLike[], period: Period): number {
  return deals.filter((d) => inPeriod(d.dateSourced, period)).length;
}
