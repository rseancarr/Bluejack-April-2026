import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { isOverdue, linkOf, type ActionItemRow } from "@/lib/queries/actionItems";
import { DoneToggle } from "./DoneToggle";
import { Empty } from "@/components/ui/Empty";

export function ItemsTable({ items, showOwner = true, showLink = true, emptyText = "Nothing here." }: { items: ActionItemRow[]; showOwner?: boolean; showLink?: boolean; emptyText?: string }) {
  if (items.length === 0) return <Empty>{emptyText}</Empty>;
  return (
    <div className="tbl-wrap">
      <table className="tbl compact tbl-cards">
        <thead>
          <tr>
            <th>Item</th>
            {showOwner && <th>Owner</th>}
            <th>Due</th>
            {showLink && <th>Linked to</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const link = linkOf(it);
            const overdue = isOverdue(it);
            return (
              <tr key={it.id} className={it.status === "done" ? "opacity-60" : ""}>
                <td className={`card-title ${it.status === "done" ? "line-through" : ""}`}>
                  <span className="inline-flex items-start gap-2.5"><DoneToggle id={it.id} done={it.status === "done"} />
                  <Link href={`/action-items?edit=${it.id}`} className="hover:underline">{it.title}</Link></span>
                  {it.createdFrom === "meeting" && it.meetingDate && <span className="faint ml-2">mtg {fmtDate(it.meetingDate)}</span>}
                </td>
                {showOwner && <td data-label="Owner">{it.owner}</td>}
                <td data-label="Due" className={`tnum whitespace-nowrap ${overdue ? "overdue font-medium" : ""}`}>{fmtDate(it.dueDate)}{overdue && " · overdue"}</td>
                {showLink && (
                  <td data-label="Linked">
                    {link ? (
                      <Link href={link.href} className="link"><span className="faint mr-1">{link.kind}</span>{link.label}</Link>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
