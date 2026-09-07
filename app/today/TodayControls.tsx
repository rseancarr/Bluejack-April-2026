"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function TodayControls({ who, members, format, text }: { who: string; members: string[]; format: "card" | "page"; text: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const go = (w: string, f: string) => router.push(`/today?who=${encodeURIComponent(w)}&format=${f}`);
  return (
    <div className="flex flex-wrap items-end gap-2">
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
