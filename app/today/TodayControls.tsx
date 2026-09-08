"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function TodayControls({ who, members, format, text, date, isToday, prev, next }: { who: string; members: string[]; format: "card" | "page"; text: string; date: string; isToday: boolean; prev: string; next: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  // d = null means "today" (the server decides which calendar day that is in the team time zone).
  const go = (w: string, f: string, d: string | null = isToday ? null : date) => router.push(`/today?who=${encodeURIComponent(w)}&format=${f}${d ? `&date=${d}` : ""}`);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="lbl">Day</label>
        <div className="inline-flex border border-line rounded-sm overflow-hidden">
          <button type="button" className="px-2.5 py-1.5 text-[12.5px] bg-paper text-ink-2" onClick={() => go(who, format, prev)} aria-label="Previous day">‹</button>
          <button type="button" className={`px-3 py-1.5 text-[12.5px] ${isToday ? "bg-navy text-white" : "bg-paper text-ink-2"}`} onClick={() => go(who, format, null)}>Today</button>
          <button type="button" className="px-2.5 py-1.5 text-[12.5px] bg-paper text-ink-2" onClick={() => go(who, format, next)} aria-label="Next day">›</button>
        </div>
      </div>
      <div>
        <label className="lbl">Whose day</label>
        <div className="inline-flex border border-line rounded-sm overflow-hidden">
          {members.map((m) => (
            <button key={m} type="button" className={`px-3 py-1.5 text-[12.5px] ${who === m ? "bg-navy text-white" : "bg-paper text-ink-2"}`} onClick={() => go(m, format)}>{m}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="lbl">Print size</label>
        <div className="inline-flex border border-line rounded-sm overflow-hidden">
          {([["card", "4×6 note card"], ["page", "One page"]] as const).map(([f, label]) => (
            <button key={f} type="button" className={`px-3 py-1.5 text-[12.5px] ${format === f ? "bg-navy text-white" : "bg-paper text-ink-2"}`} onClick={() => go(who, f)}>{label}</button>
          ))}
        </div>
      </div>
      <button type="button" className="btn" onClick={() => window.print()}>Print</button>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked */
          }
        }}
      >
        {copied ? "Copied" : "Copy as text"}
      </button>
    </div>
  );
}
