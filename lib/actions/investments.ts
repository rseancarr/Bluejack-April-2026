"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { BUCKETS, INVESTMENT_STATUSES } from "@/lib/constants";

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Non-financial fields only. Financial fields are never editable here. */
export async function updateInvestment(id: string, formData: FormData): Promise<{ error?: string }> {
  const bucket = str(formData, "bucket");
  const status = str(formData, "status");
  if (bucket && !(BUCKETS as readonly string[]).includes(bucket)) return { error: "Invalid bucket" };
  if (status && !(INVESTMENT_STATUSES as readonly string[]).includes(status)) return { error: "Invalid status" };
  const entry = str(formData, "entryDate");
  const own = str(formData, "ownershipPct");
  const ownership = own === null ? null : Number(own);
  if (ownership !== null && !Number.isFinite(ownership)) return { error: "Ownership must be a number" };
  await prisma.investment.update({
    where: { id },
    data: {
      name: str(formData, "name") ?? undefined,
      bucket: bucket ?? undefined,
      sector: str(formData, "sector"),
      entryDate: entry ? new Date(`${entry}T00:00:00Z`) : null,
      ownershipPct: ownership,
      status: status ?? undefined,
      contacts: str(formData, "contacts"),
      notes: str(formData, "notes"),
      externalId: str(formData, "externalId"),
    },
  });
  revalidatePath(`/investments/${id}`);
  revalidatePath("/investments");
  return {};
}
