"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteActionItem, taskDialogData, updateActionItem } from "@/lib/actions/actionItems";
import type { LinkOptions } from "@/lib/queries/actionItems";
import { LinkSelect } from "./LinkSelect";

export interface TaskForDialog {
  id: string;
  title: string;
  owner: string;
  dueDate: string | null; // yyyy-mm-dd
  status: string;
  pinned: boolean;
  notes: string | null;
  link: string; // "investment:<id>" | "deal:<id>" | "fund:<id>" | ""
  linkLabel: string | null;
}

/** A task title that opens an in-place edit dialog. Works on any page. */
export function TaskLink({ task, className = "" }: { task: TaskForDialog; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`text-left hover:underline ${className}`} onClick={() => setOpen(true)} title="Open task">
        {task.title}
      </button>
      {open && <TaskDialog task={task} onClose={() => setOpen(false)} />}
    </>
  );
}

function TaskDialog({ task, onClose }: { task: TaskForDialog; onClose: () => void }) {
  const [data, setData] = useState<{ options: LinkOptions; members: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    taskDialogData().then(setData);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = (fd: FormData) =>
    start(async () => {
      const r = await updateActionItem(task.id, fd);
      if (r.error) setError(r.error);
      else {
        router.refresh();
        onClose();
      }
    });

  return (
    <div className="modal-wrap fixed inset-0 z-50 bg-black/25 flex items-start justify-center pt-16" onClick={onClose}>
      <form className="modal card p-4 w-[560px] max-w-full space-y-3" onClick={(e) => e.stopPropagation()} action={save}>
        <div className="flex items-center justify-between">
          <h2>Task</h2>
          <span className="faint">Esc to close</span>
        </div>
        <div>
          <label className="lbl">Title</label>
          <input ref={titleRef} name="title" className="input" defaultValue={task.title} required autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="lbl">Owner</label>
            {data ? (
              <select name="owner" className="select" defaultValue={task.owner}>{[...new Set([task.owner, ...data.members])].map((m) => <option key={m} value={m}>{m}</option>)}</select>
            ) : (
              <input name="owner" className="input" defaultValue={task.owner} />
            )}
          </div>
          <div><label className="lbl">Due</label><input name="dueDate" type="date" className="input" defaultValue={task.dueDate ?? ""} /></div>
          <div className="col-span-2">
            <label className="lbl">Linked to</label>
            {data ? <LinkSelect options={data.options} defaultValue={task.link} /> : <input className="input" disabled value={task.linkLabel ?? "loading…"} readOnly />}
          </div>
          <div className="col-span-2"><label className="lbl">Notes</label><textarea name="notes" className="textarea" defaultValue={task.notes ?? ""} placeholder="Context, what was said, next step…" /></div>
          <div className="col-span-2 flex items-center gap-5">
            <label className="inline-flex items-center gap-2 text-[12.5px]"><input type="checkbox" name="pinned" defaultChecked={task.pinned} /> Must do (leads the daily card)</label>
            <label className="inline-flex items-center gap-2 text-[12.5px]"><input type="checkbox" name="done" defaultChecked={task.status === "done"} /> Done</label>
            <input type="hidden" name="statusEditable" value="1" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
          <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
          {error && <span className="text-neg">{error}</span>}
          <button type="button" className="btn btn-ghost text-neg ml-auto" onClick={() => { if (confirm("Delete this task?")) start(async () => { await deleteActionItem(task.id); router.refresh(); onClose(); }); }}>Delete</button>
        </div>
      </form>
    </div>
  );
}
