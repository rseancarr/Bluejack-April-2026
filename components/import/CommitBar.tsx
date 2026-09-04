"use client";
import { useState, useTransition } from "react";
import { commitImport, discardImport } from "@/lib/actions/imports";

export function CommitBar({ batchId, mode, unresolved = 0, blocked = false, flagged = 0 }: { batchId: string; mode: "pending" | "committed"; unresolved?: number; blocked?: boolean; flagged?: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (mode === "committed") {
    return (
      <button className="btn btn-ghost btn-sm text-neg" disabled={pending} onClick={() => { if (confirm("Discard this committed import and delete its snapshots? Use only for a restatement; re-upload afterwards.")) start(() => discardImport(batchId)); }}>Discard (restatement)</button>
    );
  }
  const canCommit = unresolved === 0 && !blocked;
  return (
    <div className="card p-3 flex flex-wrap items-center gap-3 sticky bottom-[calc(64px+env(safe-area-inset-bottom))] md:bottom-3 shadow-sm">
      <button className="btn" disabled={!canCommit || pending} onClick={() => { if (flagged && !confirm(`${flagged} fund(s) have reconciliation variances. Commit anyway? The variance will be recorded on the batch.`)) return; start(async () => { const r = await commitImport(batchId); if (r?.error) setError(r.error); }); }}>
        {pending ? "Committing…" : "Commit as snapshot batch"}
      </button>
      <button className="btn btn-secondary" disabled={pending} onClick={() => { if (confirm("Discard this upload?")) start(() => discardImport(batchId)); }}>Discard</button>
      <span className="muted">{unresolved ? `${unresolved} unmatched row(s) block the commit.` : blocked ? "Blocked: an import for this as-of date is already committed." : "All rows matched. Values will be stored exactly as parsed."}</span>
      {error && <span className="text-neg">{error}</span>}
    </div>
  );
}
