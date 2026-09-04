// Display-time formatting only. Values are never rounded before storage.

const MISSING = "—";

/** $M with one decimal, e.g. 12.3 → "$12.3M". Null → "—". */
export function fmtMoneyM(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return MISSING;
  const m = value / 1_000_000;
  const abs = Math.abs(m).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${m < 0 ? "-" : ""}$${abs}M`;
}

/** Full dollars with thousands separators, no decimals. */
export function fmtMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return MISSING;
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** Multiples: 1.00x */
export function fmtMultiple(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return MISSING;
  return `${value.toFixed(2)}x`;
}

/** Percent with one decimal. Input is already a percentage figure (12.3 → "12.3%"). */
export function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return MISSING;
  return `${value.toFixed(1)}%`;
}

/** Ratio (0.123) shown as percent with one decimal. */
export function fmtRatioPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return MISSING;
  return `${(value * 100).toFixed(1)}%`;
}

export function fmtInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return MISSING;
  return value.toLocaleString("en-US");
}

export function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return MISSING;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return MISSING;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function fmtMonth(value: Date | string | null | undefined): string {
  if (!value) return MISSING;
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", timeZone: "UTC" });
}

/** yyyy-mm-dd for <input type="date"> and URLs. */
export function toISODate(value: Date | null | undefined): string {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

export function fmtDays(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return MISSING;
  return `${Math.round(value)}d`;
}

export const MISSING_LABEL = MISSING;
