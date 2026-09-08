"use client";
import { useActionState, useState } from "react";
import { saveCalendarLink, removeCalendarLink } from "@/lib/actions/calendar";

export function CalendarSetup({ who, hasLink, error }: { who: string; hasLink: boolean; error?: string | null }) {
  const [open, setOpen] = useState(!hasLink && !error ? false : false);
  const [state, action, pending] = useActionState(saveCalendarLink, null);
  const done = state?.ok && !open;
  return (
    <div className="no-print">
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen((o) => !o)}>
        {hasLink ? "Calendar link…" : `Add ${who}'s Outlook calendar`}
      </button>
      {open && (
        <div className="card p-3 mt-2 space-y-2 max-w-[640px]">
          <div className="text-[12.5px]">
            <strong>Publish the calendar once in Outlook, then paste the ICS link here.</strong>
            <ol className="list-decimal ml-5 mt-1 space-y-0.5 text-ink-2">
              <li>Outlook on the web → Settings (gear) → <em>Calendar</em> → <em>Shared calendars</em>.</li>
              <li>Under <em>Publish a calendar</em>, pick your calendar, choose <em>Can view all details</em>, click <em>Publish</em>.</li>
              <li>Copy the link that ends in <code>.ics</code> (not the HTML one) and paste it below.</li>
            </ol>
            <div className="faint mt-1">Anyone with the link can read the calendar, so it stays in this app&apos;s local database and is never put in the code. Outlook refreshes a published calendar every few hours, so a brand-new invite may take a while to appear.</div>
          </div>
          <form action={action} className="flex flex-wrap gap-2 items-center">
            <input type="hidden" name="owner" value={who} />
            <input name="url" className="input flex-1 min-w-[260px]" placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics" required />
            <button type="submit" className="btn" disabled={pending}>{pending ? "Checking…" : "Save"}</button>
            {hasLink && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await removeCalendarLink(who); setOpen(false); }}>Remove link</button>
            )}
          </form>
          {state?.error && <div className="text-neg text-[12.5px]">{state.error}</div>}
          {state?.ok && <div className="text-pos text-[12.5px]">Saved. The day&apos;s meetings are below.</div>}
        </div>
      )}
      {done ? null : error && !open ? <div className="text-neg text-[12px] mt-1">{error}</div> : null}
    </div>
  );
}
