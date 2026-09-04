export type Maybe = number | null | undefined;

export function isNum(v: Maybe): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Apply fn only when every input is a finite number; otherwise null. */
export function withAll<T extends Maybe[]>(inputs: [...T], fn: (...nums: number[]) => number | null): number | null {
  for (const v of inputs) if (!isNum(v)) return null;
  return fn(...(inputs as number[]));
}
