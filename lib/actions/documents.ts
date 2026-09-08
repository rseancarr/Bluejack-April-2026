"use server";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { DOCUMENT_TYPES } from "@/lib/constants";
import { ensureDir, safeFileName } from "@/lib/storage";

/** File types the team actually shares. Anything else is refused rather than stored. */
const ALLOWED_EXT = /\.(pdf|xlsx|xlsm|xls|csv|docx|doc|pptx|ppt|txt|md|png|jpg|jpeg|msg|eml|zip)$/i;
const MAX_BYTES = 25 * 1024 * 1024;

export async function uploadDocument(investmentId: string, formData: FormData): Promise<{ error?: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file" };
  if (!ALLOWED_EXT.test(file.name)) return { error: "That file type is not accepted (PDF, Office, CSV, text, images, .msg/.eml, .zip)." };
  if (file.size > MAX_BYTES) return { error: "Files are limited to 25 MB." };
  // The id comes from the browser: it must name a real investment before it is used in a path.
  const inv = await prisma.investment.findUnique({ where: { id: investmentId }, select: { id: true } });
  if (!inv) return { error: "Unknown investment." };
  const type = String(formData.get("type") ?? "other");
  if (!(DOCUMENT_TYPES as readonly string[]).includes(type)) return { error: "Invalid type" };
  const dateRaw = String(formData.get("date") ?? "").trim();
  const date = dateRaw ? new Date(`${dateRaw}T12:00:00Z`) : new Date();
  const dir = await ensureDir(path.join("documents", investmentId));
  const stored = path.join(dir, `${Date.now()}_${safeFileName(file.name)}`);
  await writeFile(stored, Buffer.from(await file.arrayBuffer()));
  await prisma.document.create({ data: { investmentId, fileName: file.name, type, date, storagePath: stored } });
  revalidatePath(`/investments/${investmentId}`);
  revalidatePath("/investments");
  return {};
}

export async function deleteDocument(id: string) {
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return;
  await prisma.document.delete({ where: { id } });
  try {
    await unlink(doc.storagePath);
  } catch {
    /* already gone */
  }
  revalidatePath(`/investments/${doc.investmentId}`);
}
