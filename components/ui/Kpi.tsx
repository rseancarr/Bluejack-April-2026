export function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card kpi">
      <div className="kpi-l">{label}</div>
      <div className="kpi-v">{value}</div>
      {sub && <div className="kpi-s">{sub}</div>}
    </div>
  );
}
