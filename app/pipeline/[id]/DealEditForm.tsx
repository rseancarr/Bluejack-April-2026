"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Deal } from "@prisma/client";
import { deleteDeal, updateDeal } from "@/lib/actions/deals";
import { BUCKETS, SOURCE_TYPES } from "@/lib/constants";
import { toISODate } from "@/lib/format";

export function DealEditForm({ deal, fundIds, funds, members }: { deal: Deal; fundIds: string[]; funds: { id: string; name: string }[]; members: string[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <form
      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      action={(fd) => start(async () => { const r = await updateDeal(deal.id, fd); setMsg(r.error ?? "Saved"); })}
    >
      <div className="sm:col-span-2"><label className="lbl">Name</label><input name="name" className="input" defaultValue={deal.name} required /></div>
      <div><label className="lbl">Funds targeted</label>
        <select name="fundIds" className="select h-20" multiple defaultValue={fundIds}>{funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
      <div className="space-y-3">
        <div><label className="lbl">Owner</label><select name="owner" className="select" defaultValue={deal.owner}>{members.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
        <div><label className="lbl">Date sourced</label><input name="dateSourced" type="date" className="input" defaultValue={toISODate(deal.dateSourced)} /></div>
      </div>
      <div><label className="lbl">Sponsor / source</label><input name="sponsor" className="input" defaultValue={deal.sponsor ?? ""} /></div>
      <div><label className="lbl">Source type</label><select name="sourceType" className="select" defaultValue={deal.sourceType}>{SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
      <div><label className="lbl">Strategy bucket</label><select name="bucket" className="select" defaultValue={deal.bucket ?? ""}><option value="">—</option>{BUCKETS.map((b) => <option key={b} value={b}>{b}</option>)}</select></div>
      <div><label className="lbl">Sector</label><input name="sector" className="input" defaultValue={deal.sector ?? ""} /></div>
      <div><label className="lbl">Est. size ($)</label><input name="estSize" className="input num" defaultValue={deal.estSize ?? ""} inputMode="decimal" /></div>
      <div><label className="lbl">Next step</label><input name="nextStep" className="input" defaultValue={deal.nextStep ?? ""} /></div>
      {deal.stage === "Passed" && <div className="sm:col-span-2"><label className="lbl">Pass reason</label><input name="passReason" className="input" defaultValue={deal.passReason ?? ""} /></div>}
      <div className="sm:col-span-2"><label className="lbl">Fit notes</label><textarea name="fitNotes" className="textarea" defaultValue={deal.fitNotes ?? ""} /></div>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button className="btn" disabled={pending}>Save</button>
        {msg && <span className={msg === "Saved" ? "muted" : "text-neg"}>{msg}</span>}
        <button type="button" className="btn btn-ghost btn-sm ml-auto text-neg" onClick={() => { if (confirm("Delete this deal and its stage history?")) start(async () => { await deleteDeal(deal.id); router.push("/pipeline"); }); }}>Delete deal</button>
      </div>
    </form>
  );
}
