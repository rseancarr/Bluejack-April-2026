"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtMoneyM, fmtMultiple, fmtRatioPct, MISSING_LABEL } from "@/lib/format";

export interface InvRow {
  id: string;
  name: string;
  bucket: string;
  assetClass: string | null;
  sector: string | null;
  status: string;
  cost: number | null;
  nav: number | null;
  irr: number | null;
  moic: number | null;
  asOf: string | null;
  valued: string | null;
  lastReport: string | null;
  missing: Record<"cost" | "nav" | "irr" | "moic" | "asOf", string>;
}

export interface FundGroup {
  id: string;
  name: string;
  vintage: number;
  status: string;
  asOf: string | null;
  rows: InvRow[];
  /** Strict subtotals (null if any active holding lacks the figure) with a note. */
  cost: { sum: number | null; note: string };
  nav: { sum: number | null; note: string };
}

const KEY = "investments.collapsed";

function Fig({ value, fmt, missing }: { value: number | null; fmt: (v: number) => string; missing: string }) {
  return value === null ? <span className="missing" title={missing}>{MISSING_LABEL}</span> : <>{fmt(value)}</>;
}

export function GroupedInvestmentsTable({ groups }: { groups: FundGroup[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, []);
  const save = (next: Set<string>) => {
    setCollapsed(next);
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  };
  const toggle = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    save(next);
  };
  const allIds = groups.map((g) => g.id);
  const allCollapsed = allIds.every((id) => collapsed.has(id));

  return (
    <div>
      <div className="flex justify-end gap-1 mb-1">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => save(new Set())} disabled={collapsed.size === 0}>Expand all</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => save(new Set(allIds))} disabled={allCollapsed}>Collapse all</button>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Asset class</th>
              <th>Bucket</th>
              <th>Type</th>
              <th className="num">Cost</th>
              <th className="num">Mark (NAV)</th>
              <th className="num">IRR</th>
              <th className="num">MOIC</th>
              <th>Status</th>
              <th>As of</th>
              <th>Valued</th>
              <th>Last report</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows key={g.id} g={g} open={!collapsed.has(g.id)} onToggle={() => toggle(g.id)} />
            ))}
            {groups.length === 0 && <tr><td colSpan={12} className="muted text-center py-6">No investments match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRows({ g, open, onToggle }: { g: FundGroup; open: boolean; onToggle: () => void }) {
  const live = g.rows.filter((r) => r.status === "active").length;
  return (
    <>
      <tr className="group-row">
        <td colSpan={4}>
          <button type="button" className="inline-flex items-center gap-2 font-medium text-navy-2" onClick={onToggle} aria-expanded={open}>
            <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">▸</span>
            <span className="font-serif text-[14px]">{g.name}</span>
            <span className="badge">{g.rows.length} holding{g.rows.length === 1 ? "" : "s"}{g.rows.length !== live ? ` · ${live} active` : ""}</span>
          </button>
          <Link href={`/funds/${g.id}`} className="link muted ml-3 text-[11.5px]">fund page</Link>
        </td>
        <td className="num font-medium"><Fig value={g.cost.sum} fmt={fmtMoneyM} missing={g.cost.note} /></td>
        <td className="num font-medium"><Fig value={g.nav.sum} fmt={fmtMoneyM} missing={g.nav.note} /></td>
        <td colSpan={3} className="faint">Σ active holdings{g.cost.sum === null || g.nav.sum === null ? " · blank where a holding is missing the figure" : ""}</td>
        <td className="whitespace-nowrap muted">{g.asOf ?? "—"}</td>
        <td colSpan={2} />
      </tr>
      {open &&
        g.rows.map((r) => (
          <tr key={r.id}>
            <td className="pl-7"><Link href={`/investments/${r.id}`} className="link">{r.name}</Link></td>
            <td>{r.assetClass ?? <span className="faint" title="Not in this fund's accounting file (the Asset Class column starts in July 2026)">—</span>}</td>
            <td className="muted">{r.bucket}</td>
            <td className="muted">{r.sector ?? "—"}</td>
            <td className="num"><Fig value={r.cost} fmt={fmtMoneyM} missing={r.missing.cost} /></td>
            <td className="num"><Fig value={r.nav} fmt={fmtMoneyM} missing={r.missing.nav} /></td>
            <td className="num"><Fig value={r.irr} fmt={fmtRatioPct} missing={r.missing.irr} /></td>
            <td className="num"><Fig value={r.moic} fmt={fmtMultiple} missing={r.missing.moic} /></td>
            <td><span className={`badge ${r.status === "realized" ? "badge-warn" : ""}`}>{r.status}</span></td>
            <td className="whitespace-nowrap">{r.asOf ?? <span className="missing" title={r.missing.asOf}>{MISSING_LABEL}</span>}</td>
            <td className="whitespace-nowrap muted">{r.valued ?? "—"}</td>
            <td className="whitespace-nowrap">{r.lastReport ?? <span className="faint" title="No quarterly report uploaded">—</span>}</td>
          </tr>
        ))}
    </>
  );
}
