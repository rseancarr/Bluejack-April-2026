"use client";
import { useRef, useState, useTransition } from "react";
import { createActionItem } from "@/lib/actions/actionItems";
import type { LinkOptions } from "@/lib/queries/actionItems";
import { LinkSelect } from "./LinkSelect";

function plusDays(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Single-line quick entry. Defaults: owner = me, due = +7 days. Enter submits. */
export function QuickAdd({ options, members, defaultOwner, defaultLink = "", meetingDate }: { options: LinkOptions; members: string[]; defaultOwner: string; defaultLink?: string; meetingDate?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  return (
    <form
      ref={ref}
      className="quick-add flex items-center gap-2"
      action={(fd) =>
        start(async () => {
          const res = await createActionItem(fd);
          if (res.error) setError(res.error);
          else {
            setError(null);
            const title = titleRef.current;
            if (title) {
              title.value = "";
              title.focus();
            }
          }
        })
      }
    >
      {meetingDate && <input type="hidden" name="meetingDate" value={meetingDate} />}
      <input ref={titleRef} name="title" className="qa-title input flex-1" placeholder="Add an action item and press Enter…" autoComplete="off" required />
      <select name="owner" className="select w-28" defaultValue={defaultOwner}>
        {members.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <input name="dueDate" type="date" className="input w-36" defaultValue={plusDays(7)} />
      <LinkSelect options={options} defaultValue={defaultLink} className="qa-link select w-52" />
      <button className="qa-btn btn" type="submit" disabled={pending}>Add</button>
      {error && <span className="text-neg">{error}</span>}
    </form>
  );
}
