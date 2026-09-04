import { MISSING_LABEL } from "@/lib/format";

/**
 * A financial figure cell. Null renders "—" with a tooltip naming why (which import it
 * was missing from). Never renders 0 for a missing value.
 */
export function Fig({
  value,
  fmt,
  missing,
  className = "",
}: {
  value: number | null | undefined;
  fmt: (v: number | null | undefined) => string;
  missing?: string | null;
  className?: string;
}) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return (
      <span className={`missing ${className}`} title={missing ?? "Not available"}>
        {MISSING_LABEL}
      </span>
    );
  }
  return <span className={className}>{fmt(value)}</span>;
}
