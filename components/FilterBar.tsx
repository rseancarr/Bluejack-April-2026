"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  /** Label for the "no filter" option. Defaults to "All". */
  emptyLabel?: string;
}

/** URL-backed filter selects. Changing one updates the query string and re-renders the server page. */
export function FilterBar({ filters, current, basePath }: { filters: FilterDef[]; current: Record<string, string | undefined>; basePath?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${basePath ?? pathname}?${next.toString()}`);
  };
  const any = filters.some((f) => current[f.key]);
  return (
    <div className="flex items-end gap-2 flex-wrap">
      {filters.map((f) => (
        <div key={f.key}>
          <label className="lbl">{f.label}</label>
          <select className="select w-44" value={current[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">{f.emptyLabel ?? "All"}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      ))}
      {any && (
        <button className="btn btn-ghost btn-sm" onClick={() => router.push(basePath ?? pathname)} type="button">Clear</button>
      )}
    </div>
  );
}
