"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { ingestWorkbook } from "@/lib/import/ingest";
import { commitBatch, CommitError } from "@/lib/import/commit";
import { emptyResolutions, type UserResolutions } from "@/lib/import/match";
import { isBucket } from "@/lib/constants";

function revalidateAll() {
  for (const p of ["/import", "/", "/investments", "/funds"]) revalidatePath(p, "layout");
}

export async function uploadWorkbook(formData: FormData): Promise<{ error?: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an .xlsx file" };
  if (!/\.(xlsx|xlsm)$/i.test(file.name)) return { error: "Only .xlsx / .xlsm workbooks are accepted" };
  const buffer = Buffer.from(await file.arrayBuffer());
  const res = await ingestWorkbook(buffer, file.name, await currentUser());
  revalidatePath("/import");
  redirect(`/import/${res.batchId}`);
}

async function loadResolutions(batchId: string): Promise<UserResolutions> {
  const b = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!b || b.status !== "pending") throw new Error("Batch is not pending");
  return b.resolutionsJson ? (JSON.parse(b.resolutionsJson) as UserResolutions) : emptyResolutions();
}

async function saveResolutions(batchId: string, r: UserResolutions) {
  await prisma.importBatch.update({ where: { id: batchId }, data: { resolutionsJson: JSON.stringify(r) } });
  revalidatePath(`/import/${batchId}`);
}

/**
 * Map a workbook row to an existing record. For name-matched rows this writes a NameMapping
 * (persistent — future imports match automatically). For rows carrying an external ID, the
 * ID is learned onto the record at commit time.
 */
export async function mapRow(batchId: string, level: "fund" | "investment", index: number, sourceName: string, hasExternalId: boolean, targetId: string) {
  const r = await loadResolutions(batchId);
  if (level === "fund") {
    r.funds[index] = { fundId: targetId };
    if (!hasExternalId) {
      await prisma.nameMapping.upsert({
        where: { sourceName },
        create: { sourceName, level: "fund", fundId: targetId },
        update: { level: "fund", fundId: targetId, investmentId: null },
      });
    }
  } else {
    r.investments[index] = { investmentId: targetId };
    if (!hasExternalId) {
      await prisma.nameMapping.upsert({
        where: { sourceName },
        create: { sourceName, level: "investment", investmentId: targetId },
        update: { level: "investment", investmentId: targetId, fundId: null },
      });
    }
  }
  await saveResolutions(batchId, r);
}

/** The workbook's fund does not exist yet: create it (plus a name mapping) so the batch can resolve. */
export async function createFundFromRow(batchId: string, sourceName: string, vintage: number): Promise<{ error?: string }> {
  if (!Number.isInteger(vintage) || vintage < 1990 || vintage > 2100) return { error: "Enter the vintage year" };
  const existing = await prisma.fund.findUnique({ where: { name: sourceName } });
  const fund = existing ?? (await prisma.fund.create({ data: { name: sourceName, vintage, status: "investing" } }));
  await prisma.nameMapping.upsert({
    where: { sourceName },
    create: { sourceName, level: "fund", fundId: fund.id },
    update: { level: "fund", fundId: fund.id, investmentId: null },
  });
  revalidatePath(`/import/${batchId}`);
  revalidatePath("/funds");
  return {};
}

export async function markCreateNew(batchId: string, index: number, bucket: string) {
  if (!isBucket(bucket)) throw new Error("Invalid bucket");
  const r = await loadResolutions(batchId);
  r.investments[index] = { createNew: true, bucket };
  await saveResolutions(batchId, r);
}

export async function clearResolution(batchId: string, level: "fund" | "investment", index: number) {
  const r = await loadResolutions(batchId);
  if (level === "fund") delete r.funds[index];
  else delete r.investments[index];
  await saveResolutions(batchId, r);
}

export async function commitImport(batchId: string): Promise<{ error?: string }> {
  try {
    await commitBatch(batchId);
  } catch (e) {
    return { error: e instanceof CommitError ? e.message : `Commit failed: ${(e as Error).message}` };
  }
  revalidateAll();
  redirect(`/import/${batchId}`);
}

export async function discardImport(batchId: string) {
  const b = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!b) return;
  if (b.status === "committed") {
    // Discarding a committed batch removes its snapshots (cascade). Kept for restatements.
    await prisma.importBatch.update({ where: { id: batchId }, data: { status: "discarded", parsedJson: null, resolutionsJson: null } });
    await prisma.financialSnapshot.deleteMany({ where: { batchId } });
  } else {
    await prisma.importBatch.update({ where: { id: batchId }, data: { status: "discarded", parsedJson: null, resolutionsJson: null } });
  }
  revalidateAll();
  redirect("/import");
}

export async function deleteMapping(id: string) {
  await prisma.nameMapping.delete({ where: { id } });
  revalidatePath("/import/mappings");
}

export async function upsertMapping(formData: FormData): Promise<{ error?: string }> {
  const sourceName = String(formData.get("sourceName") ?? "").trim();
  const target = String(formData.get("target") ?? "");
  const [level, id] = target.split(":");
  if (!sourceName) return { error: "Workbook name is required" };
  if ((level !== "fund" && level !== "investment") || !id) return { error: "Pick a target" };
  await prisma.nameMapping.upsert({
    where: { sourceName },
    create: { sourceName, level, fundId: level === "fund" ? id : null, investmentId: level === "investment" ? id : null },
    update: { level, fundId: level === "fund" ? id : null, investmentId: level === "investment" ? id : null },
  });
  revalidatePath("/import/mappings");
  return {};
}
