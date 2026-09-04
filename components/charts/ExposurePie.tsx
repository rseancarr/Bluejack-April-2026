"use client";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface ExposureSlice {
  assetClass: string;
  value: number; // fund NAV in USD
}

/**
 * Categorical hues assigned in a FIXED order by asset class (never cycled), validated for
 * colour-vision separation on the light surface (see brand/tokens.md). Unknown classes take
 * the next unused hue; more than five distinct classes fold into "Other".
 */
export const ASSET_CLASS_COLORS: Record<string, string> = {
  "Private Equity": "#1f5fa8",
  Energy: "#d9814e",
  "Structured Credit": "#7a4fb0",
  Insurance: "#9a2d00",
  Other: "#a98a24",
};
const SPARE = ["#a98a24", "#7a4fb0", "#9a2d00", "#1f5fa8", "#d9814e"];

export function colorFor(assetClass: string, index: number): string {
  return ASSET_CLASS_COLORS[assetClass] ?? SPARE[index % SPARE.length];
}

const fmtM = (v: number) => `$${(v / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;

/** Donut of asset-class exposure. Legend + values live in the accompanying table (colour is never the only cue). */
export function ExposurePie({ slices, size = 180, thickness = 0.62, showLabels = true }: { slices: ExposureSlice[]; size?: number; thickness?: number; showLabels?: boolean }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (!slices.length || total <= 0) return <div className="muted text-center py-6">No exposure data.</div>;
  const data = slices.map((s, i) => ({ ...s, fill: colorFor(s.assetClass, i), pct: s.value / total }));
  return (
    <div style={{ width: size, height: size }} className="mx-auto">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="assetClass"
            innerRadius={`${Math.round(thickness * 100)}%`}
            outerRadius="98%"
            paddingAngle={2}
            stroke="#ffffff"
            strokeWidth={2}
            isAnimationActive={false}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            label={showLabels ? (((p: any) => ((p.percent ?? 0) >= 0.08 ? `${Math.round((p.percent ?? 0) * 100)}%` : "")) as any) : false}
            labelLine={false}
          >
            {data.map((d) => (
              <Cell key={d.assetClass} fill={d.fill} />
            ))}
          </Pie>
          <Tooltip formatter={(v: unknown, name: unknown) => [typeof v === "number" ? `${fmtM(v)} (${((v / total) * 100).toFixed(1)}%)` : "—", String(name)]} contentStyle={{ fontSize: 12, border: "1px solid #ddd5c9", borderRadius: 3 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ExposureLegend({ slices }: { slices: ExposureSlice[] }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  return (
    <table className="w-full text-[12px]">
      <tbody>
        {slices.map((s, i) => (
          <tr key={s.assetClass}>
            <td className="py-0.5"><span className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle" style={{ background: colorFor(s.assetClass, i) }} />{s.assetClass}</td>
            <td className="num tnum">{fmtM(s.value)}</td>
            <td className="num tnum muted w-14">{total > 0 ? `${((s.value / total) * 100).toFixed(1)}%` : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
