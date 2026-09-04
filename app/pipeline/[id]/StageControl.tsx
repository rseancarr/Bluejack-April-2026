"use client";
import { useState, useTransition } from "react";
import { moveDeal } from "@/lib/actions/deals";
import { STAGES } from "@/lib/constants";
import { PassReasonDialog } from "@/components/pipeline/PassReasonDialog";

export function StageControl({ dealId, stage, passReason }: { dealId: string; stage: string; passReason: string | null }) {
  const [pending, start] = useTransition();
  const [askPass, setAskPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const move = (s: string, reason?: string) => start(async () => {
    const r = await moveDeal(dealId, s, reason);
    setError(r.error ?? null);
  });
  return (
    <div className="flex items-center gap-2">
      <label className="lbl mb-0">Stage</label>
      <select className="select w-36" value={stage} disabled={pending} onChange={(e) => (e.target.value === "Passed" ? setAskPass(true) : move(e.target.value))}>
        {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      {stage === "Passed" && passReason && <span className="text-neg">{passReason}</span>}
      {error && <span className="text-neg">{error}</span>}
      {askPass && <PassReasonDialog dealName="this deal" onCancel={() => setAskPass(false)} onConfirm={(r) => { setAskPass(false); move("Passed", r); }} />}
    </div>
  );
}
