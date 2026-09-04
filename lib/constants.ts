// Enumerated values stored as strings in the DB (see prisma/schema.prisma for why).

export const BUCKETS = ["Energy", "LMM PE", "Opportunistic"] as const;
export type Bucket = (typeof BUCKETS)[number];

export const INVESTMENT_STATUSES = ["active", "realized"] as const;
export const FUND_STATUSES = ["investing", "harvesting", "closed"] as const;

export const SOURCE_TYPES = ["banker", "sponsor", "proprietary", "other"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** Linear funnel order. "Passed" is terminal and can be entered from any stage. */
export const FUNNEL_STAGES = ["Sourced", "Screening", "IC", "Closed"] as const;
export const STAGES = [...FUNNEL_STAGES, "Passed"] as const;
export type Stage = (typeof STAGES)[number];
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const ACTION_STATUSES = ["open", "done"] as const;
export const CREATED_FROM = ["manual", "meeting"] as const;

export const DOCUMENT_TYPES = [
  "quarterly_report",
  "capital_call",
  "distribution_notice",
  "k1",
  "other",
] as const;
export const DOCUMENT_TYPE_LABELS: Record<(typeof DOCUMENT_TYPES)[number], string> = {
  quarterly_report: "Quarterly report",
  capital_call: "Capital call",
  distribution_notice: "Distribution notice",
  k1: "K-1",
  other: "Other",
};

/** Mark (NAV) change vs. prior snapshot that gets flagged in import preview. */
export const MARK_CHANGE_FLAG_PCT = 10;

/** Reconciliation tolerance in dollars: |sum(investments) - fund figure| above this is flagged. */
export const RECONCILIATION_TOLERANCE_USD = 1;

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}
export function isBucket(value: string): value is Bucket {
  return (BUCKETS as readonly string[]).includes(value);
}
export function isSourceType(value: string): value is SourceType {
  return (SOURCE_TYPES as readonly string[]).includes(value);
}

export function teamMembers(): string[] {
  const raw = process.env.TEAM_MEMBERS ?? "";
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : ["Sean", "Avery", "Morgan"];
}
