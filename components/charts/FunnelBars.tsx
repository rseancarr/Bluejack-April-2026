"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface FunnelBarRow {
  stage: string;
  current: number;
  prior: number;
}

/**
 * Deals reaching each stage: this year (to date) vs the same period last year.
 * Two fixed hues (navy = this year, steel = last year); legend + direct values.
 */
export function FunnelBars({ rows, currentLabel, priorLabel, height = 240 }: { rows: FunnelBarRow[]; currentLabel: string; priorLabel: string; height?: number }) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 16, right: 12, left: 0, bottom: 0 }} barCategoryGap="28%" barGap={2}>
          <CartesianGrid stroke="#ddd5c9" vertical={false} />
          <XAxis dataKey="stage" tick={{ fontSize: 12, fill: "#3a3a3a" }} tickLine={false} axisLine={{ stroke: "#ddd5c9" }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#6b6560" }} tickLine={false} axisLine={false} width={28} />
          <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #ddd5c9", borderRadius: 3 }} cursor={{ fill: "#f2ede7" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
          <Bar dataKey="current" name={currentLabel} fill="#080e3e" radius={[4, 4, 0, 0]} isAnimationActive={false} label={{ position: "top", fontSize: 11, fill: "#212121" }} />
          <Bar dataKey="prior" name={priorLabel} fill="#7394b2" radius={[4, 4, 0, 0]} isAnimationActive={false} label={{ position: "top", fontSize: 11, fill: "#6b6560" }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
