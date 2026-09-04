"use client";
import { useEffect, useRef } from "react";

const QUICK = ["Valuation", "Fit — outside bucket", "Management", "Lost to competing bid", "Sponsor pulled process", "Leverage", "Size"];

export function PassReasonDialog({ dealName, onConfirm, onCancel }: { dealName: string; onConfirm: (reason: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="modal-wrap fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={onCancel}>
      <form
        className="modal card p-4 w-[420px] max-w-full space-y-3"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          const v = ref.current?.value.trim();
          if (v) onConfirm(v);
        }}
      >
        <h2>Pass on {dealName}</h2>
        <div>
          <label className="lbl">Pass reason (required)</label>
          <input ref={ref} className="input" placeholder="Why are we passing?" required />
        </div>
        <div className="flex flex-wrap gap-1">
          {QUICK.map((q) => (
            <button key={q} type="button" className="btn btn-secondary btn-sm" onClick={() => onConfirm(q)}>{q}</button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn">Mark passed</button>
        </div>
      </form>
    </div>
  );
}
