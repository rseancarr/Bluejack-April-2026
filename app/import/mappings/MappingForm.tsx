"use client";
import { useRef, useState, useTransition } from "react";
import { deleteMapping, upsertMapping } from "@/lib/actions/imports";

export function MappingForm({ funds, investments }: { funds: { id: string; name: string }[]; investments: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} className="flex items-end gap-2" action={(fd) => start(async () => { const r = await upsertMapping(fd); setError(r.error ?? null); if (!r.error) ref.current?.reset(); })}>
      <div className="flex-1"><label className="lbl">Name exactly as in the workbook</label><input name="sourceName" className="input" required /></div>
      <div className="w-72"><label className="lbl">Maps to</label>
        <select name="target" className="select" defaultValue="">
          <option value="">—</option>
          <optgroup label="Investments">{investments.map((i) => <option key={i.id} value={`investment:${i.id}`}>{i.name}</option>)}</optgroup>
          <optgroup label="Funds">{funds.map((f) => <option key={f.id} value={`fund:${f.id}`}>{f.name}</option>)}</optgroup>
        </select></div>
      <button className="btn" disabled={pending}>Save</button>
      {error && <span className="text-neg">{error}</span>}
    </form>
  );
}

export function DeleteMappingButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => { if (confirm("Delete mapping?")) start(() => deleteMapping(id)); }}>Delete</button>;
}
