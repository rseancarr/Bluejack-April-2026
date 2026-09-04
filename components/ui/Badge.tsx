export function Badge({ children, tone = "" }: { children: React.ReactNode; tone?: "" | "pos" | "neg" | "warn" | "ink" }) {
  return <span className={`badge ${tone ? `badge-${tone}` : ""}`}>{children}</span>;
}

export function StageBadge({ stage }: { stage: string }) {
  const tone = stage === "Closed" ? "pos" : stage === "Passed" ? "neg" : stage === "IC" ? "ink" : "";
  return <Badge tone={tone}>{stage}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={status === "active" || status === "investing" || status === "open" ? "" : status === "done" ? "pos" : "warn"}>{status}</Badge>;
}
