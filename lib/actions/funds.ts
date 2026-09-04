"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { FUND_STATUSES } from "@/lib/constants";

const num = (v: FormDataEntryValue | null) => {
  if (v === null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/[,$]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

export async function updateFund(id: string, formData: FormData): Promise<{ error?: string }> {
  const status = String(formData.get("status") ?? "");
  if (!(FUND_STATUSES as readonly string[]).includes(status)) return { error: "Invalid status" };
  const committed = num(formData.get("committedCapital"));
  const mgmt = num(formData.get("mgmtFeePct"));
  const carry = num(formData.get("carryPct"));
  const hurdle = num(formData.get("hurdlePct"));
  if ([committed, mgmt, carry, hurdle].some((n) => Number.isNaN(n))) return { error: "Fund terms must be numbers" };
  await prisma.fund.update({
    where: { id },
    data: {
      status,
      committedCapital: committed,
      mgmtFeePct: mgmt,
      carryPct: carry,
      hurdlePct: hurdle,
      notes: String(formData.get("notes") ?? "").trim() || null,
      externalId: String(formData.get("externalId") ?? "").trim() || null,
    },
  });
  revalidatePath(`/funds/${id}`);
  revalidatePath("/funds");
  revalidatePath("/");
  return {};
}
