"use client";
import { useState, useTransition } from "react";
import { uploadWorkbook } from "@/lib/actions/imports";

export function UploadForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="flex flex-wrap items-end gap-3" action={(fd) => start(async () => { const r = await uploadWorkbook(fd); if (r?.error) setError(r.error); })}>
      <div className="flex-1"><label className="lbl">Workbook (.xlsx or .xlsm)</label><input name="file" type="file" accept=".xlsx,.xlsm" className="input" required /></div>
      <button className="btn" disabled={pending}>{pending ? "Parsing…" : "Upload & preview"}</button>
      {error && <span className="text-neg">{error}</span>}
    </form>
  );
}
