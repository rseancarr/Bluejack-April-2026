"use client";
import { useState, useTransition } from "react";
import type { Fund } from "@prisma/client";
import { updateFund } from "@/lib/actions/funds";
import { FUND_STATUSES } from "@/lib/constants";

export function FundEditForm({ fund }: { fund: Fund }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      action={(fd) =>
        start(async () => {
          const r = await updateFund(fund.id, fd);
          setMsg(r.error ?? "Saved");
        })
      }
    >
      <div><label className="lbl">Status</label>
        <select name="status" className="select" defaultValue={fund.status}>{FUND_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
      <div><label className="lbl">Accounting fund ID</label><input name="externalId" className="input" defaultValue={fund.externalId ?? ""} placeholder="as in the workbook" /></div>
      <div><label className="lbl">Committed capital ($)</label><input name="committedCapital" className="input num" defaultValue={fund.committedCapital ?? ""} inputMode="decimal" /></div>
      <div><label className="lbl">Mgmt fee %</label><input name="mgmtFeePct" className="input num" defaultValue={fund.mgmtFeePct ?? ""} inputMode="decimal" /></div>
      <div><label className="lbl">Carry %</label><input name="carryPct" className="input num" defaultValue={fund.carryPct ?? ""} inputMode="decimal" /></div>
      <div><label className="lbl">Hurdle %</label><input name="hurdlePct" className="input num" defaultValue={fund.hurdlePct ?? ""} inputMode="decimal" /></div>
      <div className="sm:col-span-2"><label className="lbl">Notes</label><textarea name="notes" className="textarea" defaultValue={fund.notes ?? ""} /></div>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button className="btn" disabled={pending}>Save</button>
        {msg && <span className={msg === "Saved" ? "muted" : "text-neg"}>{msg}</span>}
      </div>
    </form>
  );
}
