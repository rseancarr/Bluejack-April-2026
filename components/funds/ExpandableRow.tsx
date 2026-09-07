"use client";
import { useState, type ReactNode } from "react";

export interface RowCell {
  node: ReactNode;
  className?: string;
  label?: string;
}

/** A table row whose first cell carries a chevron; clicking it reveals a full-width detail row underneath. */
export function ExpandableRow({ cells, detail, detailLabel }: { cells: RowCell[]; detail: ReactNode; detailLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr>
        {cells.map((c, i) => (
          <td key={i} className={c.className} data-label={c.label}>
            {i === 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  className={`inline-block w-4 text-ink-3 transition-transform ${open ? "rotate-90" : ""}`}
                  onClick={() => setOpen((o) => !o)}
                  aria-expanded={open}
                  aria-label={open ? `Hide ${detailLabel}` : `Show ${detailLabel}`}
                  title={open ? `Hide ${detailLabel}` : `Show ${detailLabel}`}
                >
                  ▸
                </button>
                {c.node}
              </span>
            ) : (
              c.node
            )}
          </td>
        ))}
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={cells.length}>{detail}</td>
        </tr>
      )}
    </>
  );
}
