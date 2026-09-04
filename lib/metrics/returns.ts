import { isNum, withAll, type Maybe } from "./null";

export function dpi(distributions: Maybe, contributions: Maybe): number | null {
  return withAll([distributions, contributions], (d, c) => (c === 0 ? null : d / c));
}

export function rvpi(nav: Maybe, contributions: Maybe): number | null {
  return withAll([nav, contributions], (n, c) => (c === 0 ? null : n / c));
}

export function tvpi(distributions: Maybe, nav: Maybe, contributions: Maybe): number | null {
  return withAll([distributions, nav, contributions], (d, n, c) => (c === 0 ? null : (d + n) / c));
}

export function moicComputed(distributions: Maybe, nav: Maybe, cost: Maybe): number | null {
  return withAll([distributions, nav, cost], (d, n, k) => (k === 0 ? null : (d + n) / k));
}

export function uncalled(committedCapital: Maybe, contributions: Maybe): number | null {
  return withAll([committedCapital, contributions], (cc, c) => cc - c);
}

export function pctCalled(committedCapital: Maybe, contributions: Maybe): number | null {
  return withAll([committedCapital, contributions], (cc, c) => (cc === 0 ? null : c / cc));
}

export function unrealizedGain(nav: Maybe, cost: Maybe): number | null {
  return withAll([nav, cost], (n, k) => n - k);
}

export interface StrictSum {
  sum: number | null;
  missing: number;
  count: number;
}

/** Sum that is null if any input is null. Empty input → null. */
export function sumStrict(values: Maybe[]): StrictSum {
  let missing = 0;
  let sum = 0;
  for (const v of values) {
    if (isNum(v)) sum += v;
    else missing += 1;
  }
  if (values.length === 0 || missing > 0) return { sum: null, missing, count: values.length };
  return { sum, missing: 0, count: values.length };
}

/** Sum over available values, reporting how many were missing. For pipeline estimates only. */
export function sumAvailable(values: Maybe[]): StrictSum {
  let missing = 0;
  let sum = 0;
  for (const v of values) {
    if (isNum(v)) sum += v;
    else missing += 1;
  }
  return { sum: values.length - missing > 0 ? sum : null, missing, count: values.length };
}

/** Percent change from prior to current; null if either is null or prior is 0. */
export function pctChange(prior: Maybe, current: Maybe): number | null {
  return withAll([prior, current], (p, c) => (p === 0 ? null : ((c - p) / Math.abs(p)) * 100));
}
