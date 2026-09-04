"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { isBucket, isSourceType, isStage } from "@/lib/constants";
import { planInitialEvents, planStageChange, StageChangeError } from "@/lib/pipeline/stageEvents";

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  if (v === null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
};

function revalidatePipeline(id?: string) {
  revalidatePath("/pipeline");
  revalidatePath("/pipeline/funnel");
  revalidatePath("/");
  if (id) revalidatePath(`/pipeline/${id}`);
}

/** Add-deal: only name, fund, stage, owner are required. */
export async function createDeal(formData: FormData): Promise<{ error?: string; id?: string }> {
  const name = s(formData, "name");
  const fundIds = formData.getAll("fundIds").map(String).filter(Boolean);
  const stage = s(formData, "stage") ?? "Sourced";
  const owner = s(formData, "owner");
  if (!name) return { error: "Name is required" };
  if (fundIds.length === 0) return { error: "Pick at least one fund" };
  if (!owner) return { error: "Owner is required" };
  if (!isStage(stage)) return { error: "Invalid stage" };
  const bucket = s(formData, "bucket");
  if (bucket && !isBucket(bucket)) return { error: "Invalid bucket" };
  const sourceType = s(formData, "sourceType") ?? "other";
  if (!isSourceType(sourceType)) return { error: "Invalid source type" };
  const est = s(formData, "estSize");
  const estSize = est === null ? null : Number(est.replace(/[,$]/g, ""));
  if (estSize !== null && !Number.isFinite(estSize)) return { error: "Est. size must be a number" };
  const dateSourcedRaw = s(formData, "dateSourced");
  const dateSourced = dateSourcedRaw ? new Date(`${dateSourcedRaw}T12:00:00Z`) : new Date();
  const passReason = s(formData, "passReason");

  let events;
  try {
    events = planInitialEvents(stage, dateSourced, passReason);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const by = await currentUser();
  const deal = await prisma.deal.create({
    data: {
      name,
      sponsor: s(formData, "sponsor"),
      sourceType,
      sector: s(formData, "sector"),
      bucket,
      estSize,
      stage,
      owner,
      nextStep: s(formData, "nextStep"),
      fitNotes: s(formData, "fitNotes"),
      dateSourced,
      passReason: stage === "Passed" ? passReason : null,
      funds: { create: fundIds.map((fundId) => ({ fundId })) },
      stageEvents: { create: events.map((e) => ({ stage: e.stage, enteredAt: e.enteredAt, changedBy: by })) },
    },
  });
  revalidatePipeline();
  return { id: deal.id };
}

/** Drag/drop or select: writes a DealStageEvent when the stage actually changes. */
export async function moveDeal(dealId: string, newStage: string, passReason?: string | null): Promise<{ error?: string }> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) return { error: "Deal not found" };
  let plan;
  try {
    plan = planStageChange({ currentStage: deal.stage, newStage, passReason });
  } catch (e) {
    return { error: e instanceof StageChangeError ? e.message : "Could not change stage" };
  }
  const by = await currentUser();
  await prisma.$transaction(async (tx) => {
    await tx.deal.update({ where: { id: dealId }, data: plan.dealUpdate });
    if (plan.appendEvent && plan.event) {
      await tx.dealStageEvent.create({
        data: { dealId, stage: plan.event.stage, enteredAt: plan.event.enteredAt, changedBy: by, note: plan.event.stage === "Passed" ? plan.dealUpdate.passReason : null },
      });
    }
  });
  revalidatePipeline(dealId);
  return {};
}

export async function updateDeal(id: string, formData: FormData): Promise<{ error?: string }> {
  const name = s(formData, "name");
  if (!name) return { error: "Name is required" };
  const bucket = s(formData, "bucket");
  if (bucket && !isBucket(bucket)) return { error: "Invalid bucket" };
  const sourceType = s(formData, "sourceType") ?? "other";
  if (!isSourceType(sourceType)) return { error: "Invalid source type" };
  const est = s(formData, "estSize");
  const estSize = est === null ? null : Number(est.replace(/[,$]/g, ""));
  if (estSize !== null && !Number.isFinite(estSize)) return { error: "Est. size must be a number" };
  const fundIds = formData.getAll("fundIds").map(String).filter(Boolean);
  if (fundIds.length === 0) return { error: "Pick at least one fund" };
  const owner = s(formData, "owner");
  if (!owner) return { error: "Owner is required" };
  const dateSourcedRaw = s(formData, "dateSourced");
  const deal = await prisma.deal.findUnique({ where: { id } });
  if (!deal) return { error: "Deal not found" };
  await prisma.$transaction(async (tx) => {
    await tx.dealFund.deleteMany({ where: { dealId: id } });
    await tx.deal.update({
      where: { id },
      data: {
        name,
        sponsor: s(formData, "sponsor"),
        sourceType,
        sector: s(formData, "sector"),
        bucket,
        estSize,
        owner,
        nextStep: s(formData, "nextStep"),
        fitNotes: s(formData, "fitNotes"),
        dateSourced: dateSourcedRaw ? new Date(`${dateSourcedRaw}T12:00:00Z`) : deal.dateSourced,
        passReason: deal.stage === "Passed" ? s(formData, "passReason") ?? deal.passReason : null,
        funds: { create: fundIds.map((fundId) => ({ fundId })) },
      },
    });
  });
  revalidatePipeline(id);
  return {};
}

export async function deleteDeal(id: string) {
  await prisma.deal.delete({ where: { id } });
  revalidatePipeline();
}
