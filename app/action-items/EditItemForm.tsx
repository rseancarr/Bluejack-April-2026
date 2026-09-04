"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteActionItem, updateActionItem } from "@/lib/actions/actionItems";
import type { ActionItemRow, LinkOptions } from "@/lib/queries/actionItems";
import { LinkSelect } from "@/components/actionItems/LinkSelect";
import { toISODate } from "@/lib/format";

export function EditItemForm({ item, options, members }: { item: ActionItemRow; options: LinkOptions; members: string[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const link = item.investmentId ? `investment:${item.investmentId}` : item.dealId ? `deal:${item.dealId}` : item.fundId ? `fund:${item.fundId}` : "";
  const close = () => router.push("/action-items");
  return (
    <form
      className="card p-3 flex items-end gap-2 flex-wrap"
      action={(fd) => start(async () => { const r = await updateActionItem(item.id, fd); if (r.error) setError(r.error); else close(); })}
    >
      <div className="flex-1 min-w-[240px]"><label className="lbl">Edit item</label><input name="title" className="input" defaultValue={item.title} required autoFocus /></div>
      <div><label className="lbl">Owner</label><select name="owner" className="select w-28" defaultValue={item.owner}>{members.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
      <div><label className="lbl">Due</label><input name="dueDate" type="date" className="input w-36" defaultValue={toISODate(item.dueDate)} /></div>
      <div><label className="lbl">Link</label><LinkSelect options={options} defaultValue={link} className="select w-52" /></div>
      <button className="btn" disabled={pending}>Save</button>
      <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
      <button type="button" className="btn btn-ghost text-neg" onClick={() => { if (confirm("Delete this item?")) start(async () => { await deleteActionItem(item.id); close(); }); }}>Delete</button>
      {error && <span className="text-neg">{error}</span>}
    </form>
  );
}
