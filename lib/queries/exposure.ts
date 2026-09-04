import type { SnapshotWithBatch } from "./snapshots";
import type { ExposureSlice } from "@/components/charts/ExposurePie";

export interface ExposureRowStored {
  assetClass: string;
  investmentNav: number | null;
  pct: number | null;
  fundNav: number | null;
}

/** Fund-basis exposure slices from a fund snapshot; null when the import had no exposure table. */
export function fundExposure(snap: SnapshotWithBatch | undefined): ExposureSlice[] | null {
  if (!snap?.exposureJson) return null;
  const rows = JSON.parse(snap.exposureJson) as ExposureRowStored[];
  return rows.filter((r) => r.fundNav !== null && r.fundNav !== 0).map((r) => ({ assetClass: r.assetClass, value: r.fundNav as number }));
}

/**
 * Aggregate exposure across funds: Σ fund NAV per asset class over funds that report it.
 * Returns the slices plus the funds that had to be left out (no exposure table in their file).
 */
export function aggregateExposure(entries: { fundName: string; snap: SnapshotWithBatch | undefined }[]): { slices: ExposureSlice[]; excluded: string[]; included: number } {
  const totals = new Map<string, number>();
  const excluded: string[] = [];
  let included = 0;
  for (const e of entries) {
    const slices = fundExposure(e.snap);
    if (!slices) {
      excluded.push(e.fundName);
      continue;
    }
    included++;
    for (const s of slices) totals.set(s.assetClass, (totals.get(s.assetClass) ?? 0) + s.value);
  }
  const order = ["Private Equity", "Energy", "Structured Credit", "Insurance", "Other"];
  const slices = [...totals.entries()].map(([assetClass, value]) => ({ assetClass, value })).sort((a, b) => (order.indexOf(a.assetClass) === -1 ? 99 : order.indexOf(a.assetClass)) - (order.indexOf(b.assetClass) === -1 ? 99 : order.indexOf(b.assetClass)));
  return { slices, excluded, included };
}
