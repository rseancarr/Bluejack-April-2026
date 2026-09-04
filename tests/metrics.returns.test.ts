import { describe, expect, it } from "vitest";
import { dpi, tvpi, moicComputed, uncalled, pctCalled, sumStrict, sumAvailable, pctChange, unrealizedGain, rvpi } from "@/lib/metrics/returns";

describe("return metrics: null in → null out", () => {
  it("dpi", () => {
    expect(dpi(50, 100)).toBe(0.5);
    expect(dpi(null, 100)).toBeNull();
    expect(dpi(50, null)).toBeNull();
    expect(dpi(50, 0)).toBeNull();
    expect(dpi(undefined, 100)).toBeNull();
    expect(dpi(NaN, 100)).toBeNull();
  });
  it("rvpi / tvpi", () => {
    expect(rvpi(80, 100)).toBe(0.8);
    expect(tvpi(50, 80, 100)).toBeCloseTo(1.3);
    expect(tvpi(50, null, 100)).toBeNull();
    expect(tvpi(null, 80, 100)).toBeNull();
    expect(tvpi(50, 80, 0)).toBeNull();
  });
  it("moicComputed", () => {
    expect(moicComputed(20, 100, 60)).toBeCloseTo(2);
    expect(moicComputed(20, 100, null)).toBeNull();
    expect(moicComputed(20, 100, 0)).toBeNull();
  });
  it("uncalled / pctCalled", () => {
    expect(uncalled(100, 40)).toBe(60);
    expect(uncalled(null, 40)).toBeNull();
    expect(uncalled(100, null)).toBeNull();
    expect(pctCalled(100, 40)).toBe(0.4);
    expect(pctCalled(0, 40)).toBeNull();
  });
  it("unrealizedGain", () => {
    expect(unrealizedGain(120, 100)).toBe(20);
    expect(unrealizedGain(null, 100)).toBeNull();
  });
  it("pctChange", () => {
    expect(pctChange(100, 110)).toBeCloseTo(10);
    expect(pctChange(-100, -50)).toBeCloseTo(50);
    expect(pctChange(0, 10)).toBeNull();
    expect(pctChange(null, 10)).toBeNull();
  });
});

describe("roll-ups", () => {
  it("sumStrict is null if any input is null, never partial", () => {
    expect(sumStrict([1, 2, 3])).toEqual({ sum: 6, missing: 0, count: 3 });
    expect(sumStrict([1, null, 3])).toEqual({ sum: null, missing: 1, count: 3 });
    expect(sumStrict([undefined, 3])).toEqual({ sum: null, missing: 1, count: 2 });
    expect(sumStrict([])).toEqual({ sum: null, missing: 0, count: 0 });
  });
  it("sumAvailable reports how many were skipped (pipeline estimates only)", () => {
    expect(sumAvailable([1, null, 3])).toEqual({ sum: 4, missing: 1, count: 3 });
    expect(sumAvailable([null])).toEqual({ sum: null, missing: 1, count: 1 });
    expect(sumAvailable([])).toEqual({ sum: null, missing: 0, count: 0 });
  });
});
