// Diff of a parsed workbook against the prior committed snapshots (pure).
import { MARK_CHANGE_FLAG_PCT } from "../constants";
import { pctChange } from "../metrics/returns";
import type { NumericField } from "./schema";

export interface PriorSnapshotLike {
  investmentId: string;
  asOfDate: string;
  nav: number | null;
  cost: number | null;
  distributions: number | null;
  contributions: number | null;
}

export interface RowResolution {
  /** index into ParsedWorkbook.investments */
  index: number;
  investmentId: string | null; // null = unmatched / to be created
  createNew: boolean;
}

export interface DiffEntry {
  index: number;
  investmentId: string | null;
  status: "new" | "unmatched" | "existing";
  navPrior: number | null;
  navNow: number | null;
  navChangePct: number | null;
  flagged: boolean;
  missingFields: NumericField[];
}

export interface WorkbookDiff {
  entries: DiffEntry[];
  /** investment IDs present in prior snapshots but absent from this workbook */
  disappeared: string[];
  counts: { new: number; unmatched: number; flagged: number; existing: number; disappeared: number };
}

export function diffAgainstPrior(
  rows: { fields: Record<NumericField, number | null>; missingFields: NumericField[] }[],
  resolutions: RowResolution[],
  prior: PriorSnapshotLike[],
  flagPct = MARK_CHANGE_FLAG_PCT,
): WorkbookDiff {
  const priorById = new Map(prior.map((p) => [p.investmentId, p]));
  const resolvedById = new Map(resolutions.map((r) => [r.index, r]));
  const entries: DiffEntry[] = rows.map((row, index) => {
    const res = resolvedById.get(index);
    const investmentId = res?.investmentId ?? null;
    const p = investmentId ? priorById.get(investmentId) : undefined;
    const status: DiffEntry["status"] = res?.createNew ? "new" : !investmentId ? "unmatched" : p ? "existing" : "new";
    const navPrior = p?.nav ?? null;
    const navNow = row.fields.nav;
    const navChangePct = status === "existing" ? pctChange(navPrior, navNow) : null;
    const flagged = navChangePct !== null && Math.abs(navChangePct) > flagPct;
    return { index, investmentId, status, navPrior, navNow, navChangePct, flagged, missingFields: row.missingFields };
  });
  const presentIds = new Set(entries.map((e) => e.investmentId).filter((x): x is string => !!x));
  const disappeared = prior.map((p) => p.investmentId).filter((id) => !presentIds.has(id));
  return {
    entries,
    disappeared,
    counts: {
      new: entries.filter((e) => e.status === "new").length,
      unmatched: entries.filter((e) => e.status === "unmatched").length,
      flagged: entries.filter((e) => e.flagged).length,
      existing: entries.filter((e) => e.status === "existing").length,
      disappeared: disappeared.length,
    },
  };
}
