"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { STAGES } from "@/lib/constants";
import { moveDeal } from "@/lib/actions/deals";
import { fmtMoneyM } from "@/lib/format";
import { PassReasonDialog } from "./PassReasonDialog";

export interface BoardDeal {
  id: string;
  name: string;
  stage: string;
  owner: string;
  sponsor: string | null;
  bucket: string | null;
  estSize: number | null;
  nextStep: string | null;
  sourceType: string;
  dateSourced: string;
  updatedAt: string;
  funds: string[];
  openItems: number;
  passReason: string | null;
}

function Card({ deal, overlay = false }: { deal: BoardDeal; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id, disabled: overlay });
  return (
    <div ref={overlay ? undefined : setNodeRef} {...(overlay ? {} : { ...attributes, ...listeners })} className={`deal-card ${isDragging ? "dragging" : ""} ${overlay ? "shadow-md rotate-1" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/pipeline/${deal.id}`} className="font-medium hover:underline leading-tight" draggable={false}>
          {deal.name}
        </Link>
        <span className="tnum text-ink-3 whitespace-nowrap">{deal.estSize === null ? <span className="faint" title="No est. size">—</span> : fmtMoneyM(deal.estSize)}</span>
      </div>
      <div className="mt-1 text-[11.5px] text-ink-3 flex flex-wrap gap-x-2">
        <span>{deal.owner}</span>
        {deal.bucket && <span>· {deal.bucket}</span>}
        {deal.sponsor && <span>· {deal.sponsor}</span>}
      </div>
      <div className="mt-1 text-[11.5px] flex justify-between gap-2">
        <span className="text-ink-2 truncate">{deal.stage === "Passed" ? <span className="text-neg">{deal.passReason}</span> : deal.nextStep ?? <span className="faint">no next step</span>}</span>
        {deal.openItems > 0 && <span className="badge">{deal.openItems} open</span>}
      </div>
      <div className="mt-1 text-[11px] faint">{deal.funds.join(", ")} · sourced {deal.dateSourced}</div>
    </div>
  );
}

function Column({ stage, deals, hiddenCount }: { stage: string; deals: BoardDeal[]; hiddenCount: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const size = deals.reduce((a, d) => a + (d.estSize ?? 0), 0);
  const missing = deals.filter((d) => d.estSize === null).length;
  return (
    <div ref={setNodeRef} className={`kanban-col ${isOver ? "over" : ""}`}>
      <div className="px-3 py-2 border-b border-line flex items-baseline justify-between">
        <span className="font-semibold text-[12px] uppercase tracking-wider">{stage}</span>
        <span className="text-[11px] text-ink-3 tnum">{deals.length} · {fmtMoneyM(size)}{missing ? `*` : ""}</span>
      </div>
      <div className="p-2 space-y-2 flex-1">
        {deals.map((d) => (
          <Card key={d.id} deal={d} />
        ))}
        {hiddenCount > 0 && <div className="faint text-center text-[11px] py-1">{hiddenCount} older hidden</div>}
      </div>
    </div>
  );
}

export function Board({ deals: initial, terminalWindowDays }: { deals: BoardDeal[]; terminalWindowDays: number | null }) {
  const [deals, setDeals] = useState(initial);
  const [active, setActive] = useState<BoardDeal | null>(null);
  const [passFor, setPassFor] = useState<BoardDeal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Server refreshes replace the list; keep local state in sync.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setDeals(initial);
  }

  const cutoff = terminalWindowDays === null ? null : Date.now() - terminalWindowDays * 86_400_000;
  const grouped = useMemo(() => {
    const g: Record<string, { shown: BoardDeal[]; hidden: number }> = {};
    for (const s of STAGES) g[s] = { shown: [], hidden: 0 };
    for (const d of deals) {
      const bucket = g[d.stage] ?? (g[d.stage] = { shown: [], hidden: 0 });
      const terminal = d.stage === "Closed" || d.stage === "Passed";
      if (terminal && cutoff !== null && new Date(d.updatedAt).getTime() < cutoff) bucket.hidden++;
      else bucket.shown.push(d);
    }
    return g;
  }, [deals, cutoff]);

  const apply = (dealId: string, stage: string, passReason?: string) => {
    const prev = deals;
    setDeals((ds) => ds.map((d) => (d.id === dealId ? { ...d, stage, passReason: stage === "Passed" ? passReason ?? d.passReason : null, updatedAt: new Date().toISOString() } : d)));
    start(async () => {
      const r = await moveDeal(dealId, stage, passReason);
      if (r.error) {
        setError(r.error);
        setDeals(prev);
      } else setError(null);
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const dealId = String(e.active.id);
    const stage = e.over ? String(e.over.id) : null;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || !stage || stage === deal.stage) return;
    if (stage === "Passed") {
      setPassFor(deal);
      return;
    }
    apply(dealId, stage);
  };
  const onDragStart = (e: DragStartEvent) => setActive(deals.find((d) => d.id === String(e.active.id)) ?? null);

  return (
    <div>
      {error && <div className="mb-2 text-neg">{error}</div>}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {STAGES.map((s) => (
            <Column key={s} stage={s} deals={grouped[s].shown} hiddenCount={grouped[s].hidden} />
          ))}
        </div>
        <DragOverlay>{active ? <Card deal={active} overlay /> : null}</DragOverlay>
      </DndContext>
      <p className="faint mt-1">* column total excludes deals without an est. size.</p>
      {passFor && (
        <PassReasonDialog
          dealName={passFor.name}
          onCancel={() => setPassFor(null)}
          onConfirm={(reason) => {
            apply(passFor.id, "Passed", reason);
            setPassFor(null);
          }}
        />
      )}
    </div>
  );
}
