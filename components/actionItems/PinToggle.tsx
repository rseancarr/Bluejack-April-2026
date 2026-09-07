"use client";
import { useTransition } from "react";
import { togglePin } from "@/lib/actions/actionItems";

/** Star = "must do today"; pinned items lead the owner's daily card. */
export function PinToggle({ id, pinned, size = 14 }: { id: string; pinned: boolean; size?: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={`no-print inline-flex items-center justify-center rounded-sm ${pinned ? "text-rust" : "text-ink-4 hover:text-ink-2"}`}
      style={{ width: size + 8, height: size + 8 }}
      title={pinned ? "Unpin" : "Pin as must-do"}
      aria-pressed={pinned}
      disabled={pending}
      onClick={() => start(() => togglePin(id, !pinned))}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z" />
      </svg>
    </button>
  );
}
