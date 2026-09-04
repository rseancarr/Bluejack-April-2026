"use client";
import { useRouter } from "next/navigation";
import { QuickAdd } from "@/components/actionItems/QuickAdd";
import type { LinkOptions } from "@/lib/queries/actionItems";

export function MeetingEntry({ date, options, members, defaultOwner }: { date: string; options: LinkOptions; members: string[]; defaultOwner: string }) {
  const router = useRouter();
  return (
    <div className="card p-3 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="lbl">Meeting date</label><input type="date" className="input w-40" value={date} onChange={(e) => e.target.value && router.push(`/action-items/meeting?date=${e.target.value}`)} /></div>
        <span className="muted pb-1.5 hidden sm:inline">Owner and due date carry over between entries; the title box refocuses after each add.</span>
      </div>
      <QuickAdd options={options} members={members} defaultOwner={defaultOwner} meetingDate={date} />
    </div>
  );
}
