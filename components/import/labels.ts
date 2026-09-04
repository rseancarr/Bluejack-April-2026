const LABELS: Record<string, string> = { cost: "Cost", contributions: "Contributions", distributions: "Distributions", nav: "NAV", irr: "IRR", moic: "MOIC" };
export function fieldLabel(f: string): string {
  return LABELS[f] ?? f;
}
