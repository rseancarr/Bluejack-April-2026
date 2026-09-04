"use client";
import { useRef, useState, useTransition } from "react";
import type { Document } from "@prisma/client";
import { deleteDocument, uploadDocument } from "@/lib/actions/documents";
import { fmtDate } from "@/lib/format";

export function DocumentsPanel({ investmentId, documents, typeLabels }: { investmentId: string; documents: Document[]; typeLabels: Record<string, string> }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <section className="space-y-2">
      <h2>Documents</h2>
      <form
        ref={formRef}
        className="flex items-end gap-2 flex-wrap"
        action={(fd) =>
          start(async () => {
            const r = await uploadDocument(investmentId, fd);
            setError(r.error ?? null);
            if (!r.error) formRef.current?.reset();
          })
        }
      >
        <div className="flex-1 min-w-[180px]"><label className="lbl">File</label><input name="file" type="file" className="input" required /></div>
        <div><label className="lbl">Type</label>
          <select name="type" className="select w-44" defaultValue="quarterly_report">
            {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div><label className="lbl">Date</label><input name="date" type="date" className="input w-36" defaultValue={today} /></div>
        <button className="btn" disabled={pending}>Upload</button>
        {error && <span className="text-neg">{error}</span>}
      </form>
      {documents.length === 0 ? (
        <div className="muted py-4 text-center">No documents yet.</div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl compact">
            <thead><tr><th>Date</th><th>Type</th><th>File</th><th></th></tr></thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td className="whitespace-nowrap">{fmtDate(d.date)}</td>
                  <td>{typeLabels[d.type] ?? d.type}</td>
                  <td><a href={`/documents/${d.id}`} className="link">{d.fileName}</a></td>
                  <td className="text-right">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (confirm(`Delete ${d.fileName}?`)) start(() => deleteDocument(d.id)); }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
