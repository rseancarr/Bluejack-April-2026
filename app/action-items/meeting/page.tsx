import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { teamMembers } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { actionItemInclude, linkOptions } from "@/lib/queries/actionItems";
import { PageHeader } from "@/components/ui/PageHeader";
import { ItemsTable } from "@/components/actionItems/ItemsTable";
import { MeetingEntry } from "./MeetingEntry";

export const dynamic = "force-dynamic";

export default async function MeetingModePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : new Date().toISOString().slice(0, 10);
  const meetingDate = new Date(`${date}T12:00:00Z`);
  const [me, options, items] = await Promise.all([
    currentUser(),
    linkOptions(),
    prisma.actionItem.findMany({ where: { createdFrom: "meeting", meetingDate }, include: actionItemInclude, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Meeting mode" subtitle={<>Pick the meeting date, then type items and press Enter. Each is tagged with the meeting and optionally linked. <Link href="/action-items" className="link">Back to list</Link></>} />
      <MeetingEntry date={date} options={options} members={teamMembers()} defaultOwner={me} />
      <h2>Items from the {fmtDate(meetingDate)} meeting</h2>
      <ItemsTable items={items} emptyText="Nothing captured yet for this date." />
    </div>
  );
}
