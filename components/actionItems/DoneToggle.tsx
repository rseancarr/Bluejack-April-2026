"use client";
import { useTransition } from "react";
import { toggleActionItem } from "@/lib/actions/actionItems";

export function DoneToggle({ id, done }: { id: string; done: boolean }) {
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      className="h-3.5 w-3.5 cursor-pointer accent-ink"
      checked={done}
      disabled={pending}
      aria-label={done ? "Mark open" : "Mark done"}
      onChange={(e) => start(() => toggleActionItem(id, e.target.checked))}
    />
  );
}
