"use client";
import { useRef, useState, useTransition } from "react";
import { createDeal } from "@/lib/actions/deals";
import { BUCKETS, SOURCE_TYPES, STAGES } from "@/lib/constants";

/** Required: name, fund, stage, owner. Everything else is behind "More". */
export function AddDealForm({ funds, members, defaultOwner, defaultFundId }: { funds: { id: string; name: string }[]; members: string[]; defaultOwner: string; defaultFundId: string }) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [stage, setStage] = useState("Sourced");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  if (!open) return <button className="btn" onClick={() => setOpen(true)}>+ Add deal</button>;

  return (
    <div className="modal-wrap fixed inset-0 z-50 bg-black/20 flex items-start justify-center pt-20" onClick={() => setOpen(false)}>
      <form
        ref={formRef}
        className="modal card p-4 w-[560px] max-w-full space-y-3"
        onClick={(e) => e.stopPropagation()}
        action={(fd) =>
          start(async () => {
            const r = await createDeal(fd);
            if (r.error) setError(r.error);
            else {
              setError(null);
              setOpen(false);
              setMore(false);
            }
          })
        }
      >
        <h2>Add deal</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label className="lbl">Name *</label><input name="name" className="input" autoFocus required placeholder="Company / opportunity" /></div>
          <div><label className="lbl">Fund *</label>
            <select name="fundIds" className="select" defaultValue={defaultFundId} required>{funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
          <div><label className="lbl">Owner *</label>
            <select name="owner" className="select" defaultValue={defaultOwner}>{members.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
          <div><label className="lbl">Stage *</label>
            <select name="stage" className="select" value={stage} onChange={(e) => setStage(e.target.value)}>{STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <div><label className="lbl">Date sourced</label><input name="dateSourced" type="date" className="input" defaultValue={today} /></div>
          {stage === "Passed" && <div className="sm:col-span-2"><label className="lbl">Pass reason *</label><input name="passReason" className="input" required /></div>}
        </div>
        {more ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-line-2">
            <div><label className="lbl">Sponsor / source</label><input name="sponsor" className="input" /></div>
            <div><label className="lbl">Source type</label>
              <select name="sourceType" className="select" defaultValue="other">{SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><label className="lbl">Strategy bucket</label>
              <select name="bucket" className="select" defaultValue=""><option value="">—</option>{BUCKETS.map((b) => <option key={b} value={b}>{b}</option>)}</select></div>
            <div><label className="lbl">Sector</label><input name="sector" className="input" /></div>
            <div><label className="lbl">Est. size ($)</label><input name="estSize" className="input num" inputMode="decimal" placeholder="e.g. 45000000" /></div>
            <div><label className="lbl">Next step</label><input name="nextStep" className="input" /></div>
            <div className="sm:col-span-2"><label className="lbl">Fit notes</label><textarea name="fitNotes" className="textarea" /></div>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMore(true)}>More fields (sponsor, size, sector…)</button>
        )}
        {error && <p className="text-neg">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
          <button type="submit" className="btn" disabled={pending}>{pending ? "Adding…" : "Add deal"}</button>
        </div>
      </form>
    </div>
  );
}
