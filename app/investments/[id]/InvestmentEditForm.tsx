"use client";
import { useState, useTransition } from "react";
import type { Investment } from "@prisma/client";
import { updateInvestment } from "@/lib/actions/investments";
import { BUCKETS, INVESTMENT_STATUSES } from "@/lib/constants";
import { toISODate } from "@/lib/format";

export function InvestmentEditForm({ investment: inv }: { investment: Investment }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      action={(fd) =>
        start(async () => {
          const r = await updateInvestment(inv.id, fd);
          setMsg(r.error ?? "Saved");
        })
      }
    >
      <div className="sm:col-span-2"><label className="lbl">Name</label><input name="name" className="input" defaultValue={inv.name} required /></div>
      <div><label className="lbl">Bucket</label>
        <select name="bucket" className="select" defaultValue={inv.bucket}>{BUCKETS.map((b) => <option key={b} value={b}>{b}</option>)}</select></div>
      <div><label className="lbl">Status</label>
        <select name="status" className="select" defaultValue={inv.status}>{INVESTMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
      <div><label className="lbl">Sector</label><input name="sector" className="input" defaultValue={inv.sector ?? ""} /></div>
      <div><label className="lbl">Entry date</label><input name="entryDate" type="date" className="input" defaultValue={toISODate(inv.entryDate)} /></div>
      <div><label className="lbl">Ownership %</label><input name="ownershipPct" className="input num" defaultValue={inv.ownershipPct ?? ""} inputMode="decimal" /></div>
      <div><label className="lbl">Accounting ID</label><input name="externalId" className="input mono" defaultValue={inv.externalId ?? ""} placeholder="as in the workbook" /></div>
      <div className="sm:col-span-2"><label className="lbl">Key contacts</label><textarea name="contacts" className="textarea" defaultValue={inv.contacts ?? ""} placeholder="one per line" /></div>
      <div className="sm:col-span-2"><label className="lbl">Notes</label><textarea name="notes" className="textarea" defaultValue={inv.notes ?? ""} /></div>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button className="btn" disabled={pending}>Save</button>
        {msg && <span className={msg === "Saved" ? "muted" : "text-neg"}>{msg}</span>}
        <span className="faint ml-auto">Financial fields are import-only.</span>
      </div>
    </form>
  );
}
