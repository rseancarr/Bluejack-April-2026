import { describe, expect, it } from "vitest";
import {
  funnel,
  samePeriod,
  fullYear,
  reachTimestamps,
  medianDaysInStageByYear,
  median,
  sourcedBySourceType,
  conversionRate,
  sourcedCount,
} from "@/lib/metrics/funnel";

const d = (s: string) => new Date(`${s}T12:00:00Z`);

const deals = [
  { id: "a", estSize: 10, sourceType: "banker", dateSourced: d("2025-02-01") },
  { id: "b", estSize: null, sourceType: "sponsor", dateSourced: d("2025-03-01") },
  { id: "c", estSize: 30, sourceType: "banker", dateSourced: d("2024-06-01") },
  { id: "d", estSize: 5, sourceType: "proprietary", dateSourced: d("2025-05-01") },
];

const events = [
  { dealId: "a", stage: "Sourced", enteredAt: d("2025-02-01") },
  { dealId: "a", stage: "Screening", enteredAt: d("2025-02-15") },
  { dealId: "a", stage: "IC", enteredAt: d("2025-04-01") },
  { dealId: "b", stage: "Sourced", enteredAt: d("2025-03-01") },
  { dealId: "b", stage: "Passed", enteredAt: d("2025-03-20") },
  { dealId: "c", stage: "Sourced", enteredAt: d("2024-06-01") },
  { dealId: "c", stage: "IC", enteredAt: d("2024-09-01") }, // skipped Screening
  { dealId: "c", stage: "Closed", enteredAt: d("2025-01-10") },
  { dealId: "d", stage: "Sourced", enteredAt: d("2025-05-01") },
];

describe("period helpers", () => {
  it("fullYear covers Jan 1 to Dec 31 inclusive", () => {
    const p = fullYear(2025);
    expect(p.start.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(p.end.toISOString()).toBe("2025-12-31T23:59:59.999Z");
  });
  it("samePeriod maps today's month/day into a prior year", () => {
    const p = samePeriod(2024, d("2025-09-04"));
    expect(p.start.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(p.end.toISOString()).toBe("2024-09-04T23:59:59.999Z");
  });
  it("samePeriod clamps Feb 29 in non-leap years", () => {
    const p = samePeriod(2025, d("2024-02-29"));
    expect(p.end.toISOString()).toBe("2025-02-28T23:59:59.999Z");
    const leap = samePeriod(2028, d("2024-02-29"));
    expect(leap.end.toISOString()).toBe("2028-02-29T23:59:59.999Z");
  });
});

describe("reachTimestamps", () => {
  it("a later stage implies earlier stages at the same timestamp", () => {
    const r = reachTimestamps(events).get("c")!;
    expect(r.Sourced?.toISOString()).toBe(d("2024-06-01").toISOString());
    expect(r.Screening?.toISOString()).toBe(d("2024-09-01").toISOString());
    expect(r.IC?.toISOString()).toBe(d("2024-09-01").toISOString());
    expect(r.Closed?.toISOString()).toBe(d("2025-01-10").toISOString());
  });
  it("Passed is not a funnel stage", () => {
    const r = reachTimestamps(events).get("b")!;
    expect(r.Sourced).toBeDefined();
    expect(r.Screening).toBeUndefined();
  });
});

describe("funnel", () => {
  it("counts deals that reached each stage in the period, with conversion rates", () => {
    const f = funnel(deals, events, fullYear(2025));
    const by = Object.fromEntries(f.stages.map((s) => [s.stage, s]));
    expect(by.Sourced.count).toBe(3); // a, b, d
    expect(by.Screening.count).toBe(1); // a
    expect(by.IC.count).toBe(1); // a
    expect(by.Closed.count).toBe(1); // c closed in 2025
    expect(by.Sourced.conversionFromPrev).toBeNull();
    expect(by.Screening.conversionFromPrev).toBeCloseTo(1 / 3);
    expect(by.IC.conversionFromPrev).toBe(1);
    expect(f.passed.count).toBe(1);
  });
  it("sums est. size over available values and reports missing", () => {
    const f = funnel(deals, events, fullYear(2025));
    const sourced = f.stages[0];
    expect(sourced.size).toEqual({ sum: 15, missing: 1, count: 3 });
  });
  it("same-period YTD excludes later events", () => {
    const f = funnel(deals, events, samePeriod(2025, d("2025-03-10")));
    const by = Object.fromEntries(f.stages.map((s) => [s.stage, s]));
    expect(by.Sourced.count).toBe(2); // a, b (d is May)
    expect(by.IC.count).toBe(0); // a reached IC in April
    expect(f.passed.count).toBe(0); // b passed Mar 20
  });
  it("empty inputs give zero counts and null conversions", () => {
    const f = funnel([], [], fullYear(2025));
    expect(f.stages.every((s) => s.count === 0)).toBe(true);
    expect(f.stages.every((s) => s.conversionFromPrev === null)).toBe(true);
    expect(f.stages[0].size.sum).toBeNull();
  });
  it("ignores unknown stage names", () => {
    const f = funnel(deals, [{ dealId: "z", stage: "Bogus", enteredAt: d("2025-01-01") }], fullYear(2025));
    expect(f.stages[0].count).toBe(0);
  });
  it("conversionRate handles zero denominator", () => {
    expect(conversionRate(0, 0)).toBeNull();
    expect(conversionRate(4, 1)).toBe(0.25);
  });
});

describe("median days in stage", () => {
  it("median of empty set is null; odd/even handled", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("median days precise", () => {
  it("computes per-stage medians", () => {
    const m = medianDaysInStageByYear(events);
    // 2025 Sourced: a=14, b=19, d open (excluded) → median 16.5
    expect(m.get(2025)?.Sourced).toBe(16.5);
    // 2025 Screening: a=45 (Feb 15 → Apr 1)
    expect(m.get(2025)?.Screening).toBe(45);
    // 2024 Sourced: c=92 (Jun 1 → Sep 1); 2024 IC: c=131 (Sep 1 → Jan 10)
    expect(m.get(2024)?.Sourced).toBe(92);
    expect(m.get(2024)?.IC).toBe(131);
    // a is currently in IC (open) → no IC entry for 2025
    expect(m.get(2025)?.IC).toBeUndefined();
  });
});

describe("source type breakdown", () => {
  it("counts sourced deals by type per year", () => {
    const s = sourcedBySourceType(deals, [2024, 2025]);
    expect(s.get(2024)).toEqual({ banker: 1 });
    expect(s.get(2025)).toEqual({ banker: 1, sponsor: 1, proprietary: 1 });
  });
  it("respects same-period window", () => {
    const s = sourcedBySourceType(deals, [2025], d("2025-03-15"));
    expect(s.get(2025)).toEqual({ banker: 1, sponsor: 1 });
    expect(sourcedCount(deals, samePeriod(2025, d("2025-03-15")))).toBe(2);
  });
});
