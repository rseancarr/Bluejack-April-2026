"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface HistoryPoint {
  asOf: string; // yyyy-mm-dd
  nav: number | null;
  cost: number | null;
  distributions: number | null;
  contributions: number | null;
}

const M = 1_000_000;
const fmtM = (v: number) => `$${(v / M).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;

/**
 * Mark / cash-flow history. Null points are gaps (connectNulls is off on purpose:
 * a missing month must never be drawn as if it were interpolated).
 */
export function HistoryChart({ data, height = 220, series = ["nav", "cost", "distributions"] }: { data: HistoryPoint[]; height?: number; series?: (keyof Omit<HistoryPoint, "asOf">)[] }) {
  if (data.length === 0) return <div className="muted py-8 text-center">No snapshots yet.</div>;
  const colors: Record<string, string> = { nav: "#080e3e", cost: "#9a938a", distributions: "#d9814e", contributions: "#7394b2" };
  const labels: Record<string, string> = { nav: "NAV", cost: "Cost", distributions: "Distributions", contributions: "Contributions" };
  return (
    <div>
      <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="#ddd5c9" vertical={false} />
          <XAxis dataKey="asOf" tick={{ fontSize: 11, fill: "#6b6b6b" }} tickLine={false} axisLine={{ stroke: "#ddd5c9" }} />
          <YAxis tickFormatter={fmtM} tick={{ fontSize: 11, fill: "#6b6b6b" }} tickLine={false} axisLine={false} width={64} />
          <Tooltip
            formatter={(v: unknown, name: unknown) => [typeof v === "number" ? fmtM(v) : "—", labels[String(name)] ?? String(name)]}
            contentStyle={{ fontSize: 12, border: "1px solid #ddd5c9", borderRadius: 3 }}
          />
          {series.map((s) => (
            <Line key={s} type="linear" dataKey={s} name={s} stroke={colors[s]} strokeWidth={s === "nav" ? 2 : 1.25} dot={{ r: 2.5 }} connectNulls={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      </div>
      <div className="flex gap-4 text-[11px] muted mt-1">
        {series.map((s) => (
          <span key={s} className="inline-flex items-center gap-1"><span className="inline-block w-3 h-0.5" style={{ background: colors[s] }} />{labels[s]}</span>
        ))}
      </div>
    </div>
  );
}
