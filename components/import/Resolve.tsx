"use client";
import { useState, useTransition } from "react";
import { clearResolution, mapRow, markCreateNew } from "@/lib/actions/imports";
import { BUCKETS } from "@/lib/constants";

export function ResolveFund({ batchId, index, sourceName, hasExternalId, funds, suggestion }: { batchId: string; index: number; sourceName: string; hasExternalId: boolean; funds: { id: string; name: string }[]; suggestion: { id: string; name: string } | null }) {
  const [target, setTarget] = useState(suggestion?.id ?? "");
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-1">
      <select className="select w-44" value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">— map to fund —</option>
        {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
      <button className="btn btn-sm" disabled={!target || pending} onClick={() => start(() => mapRow(batchId, "fund", index, sourceName, hasExternalId, target))}>Map</button>
      {suggestion && <span className="faint">name matches {suggestion.name}</span>}
    </span>
  );
}

export function ResolveInvestment({ batchId, index, sourceName, hasExternalId, investments, suggestion, canCreate, clearOnly = false }: { batchId: string; index: number; sourceName: string; hasExternalId: boolean; investments: { id: string; name: string }[]; suggestion: { id: string; name: string } | null; canCreate: boolean; clearOnly?: boolean }) {
  const [target, setTarget] = useState(suggestion?.id ?? "");
  const [bucket, setBucket] = useState<string>("LMM PE");
  const [pending, start] = useTransition();
  if (clearOnly) return <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(() => clearResolution(batchId, "investment", index))}>undo</button>;
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <select className="select w-48" value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">— map to existing —</option>
        {investments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
      <button className="btn btn-sm" disabled={!target || pending} onClick={() => start(() => mapRow(batchId, "investment", index, sourceName, hasExternalId, target))}>Map</button>
      <span className="faint">or</span>
      <select className="select w-32" value={bucket} onChange={(e) => setBucket(e.target.value)}>{BUCKETS.map((b) => <option key={b} value={b}>{b}</option>)}</select>
      <button className="btn btn-secondary btn-sm" disabled={!canCreate || pending} title={canCreate ? "Create a new investment record for this row" : "Map the fund first"} onClick={() => start(() => markCreateNew(batchId, index, bucket))}>Create new</button>
      {suggestion && <span className="faint">name matches “{suggestion.name}”</span>}
    </span>
  );
}
