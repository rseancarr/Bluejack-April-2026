"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createActionItem } from "@/lib/actions/actionItems";
import { createDeal } from "@/lib/actions/deals";
import { STAGES } from "@/lib/constants";
import type { LinkOptions } from "@/lib/queries/actionItems";
import { LinkSelect } from "./actionItems/LinkSelect";

function plusDays(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * One "+" button, everywhere: a task (title, owner, due, link) or a pipeline opportunity
 * (name, fund, stage, owner). Two dropdowns and a box each; Enter submits.
 */
export function QuickAddButton({ members, me, funds, options, defaultFundId, variant = "header" }: { members: string[]; me: string; funds: { id: string; name: string }[]; options: LinkOptions; defaultFundId: string; variant?: "header" | "tab" }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"task" | "deal">("task");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const first = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) setTimeout(() => first.current?.focus(), 50);
  }, [open, mode]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = (fd: FormData) =>
    start(async () => {
      const r = mode === "task" ? await createActionItem(fd) : await createDeal(fd);
      if (r.error) {
        setError(r.error);
        return;
      }
      setError(null);
      setDone(mode === "task" ? "Task added" : "Deal added to the board");
      router.refresh();
      setTimeout(() => {
        setDone(null);
        setOpen(false);
      }, 700);
    });

  const button =
    variant === "tab" ? (
      <button type="button" onClick={() => setOpen(true)} aria-label="Quick add">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-navy text-white text-xl leading-none -mt-1">+</span>
        <span>Add</span>
      </button>
    ) : (
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)} title="Quick add (⌘K / Ctrl+K)">
        + Add
      </button>
    );

  return (
    <>
      {button}
      {open && (
        <div className="modal-wrap fixed inset-0 z-50 bg-black/25 flex items-start justify-center pt-16" onClick={() => setOpen(false)}>
          <form className="modal card p-4 w-[520px] max-w-full space-y-3" onClick={(e) => e.stopPropagation()} action={submit}>
            <div className="flex items-center gap-2">
              <div className="inline-flex border border-line rounded-sm overflow-hidden">
                {(["task", "deal"] as const).map((m) => (
                  <button key={m} type="button" className={`px-3 py-1.5 text-[12.5px] ${mode === m ? "bg-navy text-white" : "bg-paper text-ink-2"}`} onClick={() => setMode(m)}>
                    {m === "task" ? "Task" : "Pipeline deal"}
                  </button>
                ))}
              </div>
              <span className="faint ml-auto">Esc to close · ⌘K opens</span>
            </div>

            {mode === "task" ? (
              <>
                <input ref={first} name="title" className="input" placeholder="What needs doing? (Enter to add)" required autoComplete="off" />
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="lbl">Owner</label><select name="owner" className="select" defaultValue={me}>{members.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
                  <div><label className="lbl">Due</label><input name="dueDate" type="date" className="input" defaultValue={plusDays(7)} /></div>
                  <div className="col-span-2"><label className="lbl">Link to (optional)</label><LinkSelect options={options} /></div>
                </div>
              </>
            ) : (
              <>
                <input ref={first} name="name" className="input" placeholder="Company / opportunity (Enter to add)" required autoComplete="off" />
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="lbl">Fund</label><select name="fundIds" className="select" defaultValue={defaultFundId}>{funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
                  <div><label className="lbl">Owner</label><select name="owner" className="select" defaultValue={me}>{members.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
                  <div><label className="lbl">Stage</label><select name="stage" className="select" defaultValue="Sourced">{STAGES.filter((s) => s !== "Passed").map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
                  <div><label className="lbl">Sponsor / source (optional)</label><input name="sponsor" className="input" /></div>
                </div>
              </>
            )}
            <div className="flex items-center gap-2">
              <button className="btn" type="submit" disabled={pending}>{pending ? "Adding…" : mode === "task" ? "Add task" : "Add deal"}</button>
              <button className="btn btn-secondary" type="button" onClick={() => setOpen(false)}>Cancel</button>
              {error && <span className="text-neg">{error}</span>}
              {done && <span className="text-pos">{done}</span>}
              {funds.length === 0 && mode === "deal" && <span className="text-neg">Create a fund first (import a workbook).</span>}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
