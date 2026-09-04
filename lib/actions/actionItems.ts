"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  if (v === null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
};

function revalidate() {
  revalidatePath("/action-items");
  revalidatePath("/action-items/meeting");
  revalidatePath("/");
}

/** Link target encoded as "investment:<id>" | "deal:<id>" | "fund:<id>" | "". */
function parseLink(link: string | null): { investmentId?: string; dealId?: string; fundId?: string } {
  if (!link) return {};
  const [kind, id] = link.split(":");
  if (!id) return {};
  if (kind === "investment") return { investmentId: id };
  if (kind === "deal") return { dealId: id };
  if (kind === "fund") return { fundId: id };
  return {};
}

export async function createActionItem(formData: FormData): Promise<{ error?: string; id?: string }> {
  const title = s(formData, "title");
  if (!title) return { error: "Title is required" };
  const owner = s(formData, "owner") ?? (await currentUser());
  const due = s(formData, "dueDate");
  const meeting = s(formData, "meetingDate");
  const item = await prisma.actionItem.create({
    data: {
      title,
      owner,
      dueDate: due ? new Date(`${due}T12:00:00Z`) : null,
      createdFrom: meeting ? "meeting" : "manual",
      meetingDate: meeting ? new Date(`${meeting}T12:00:00Z`) : null,
      ...parseLink(s(formData, "link")),
    },
  });
  revalidate();
  for (const p of ["investments", "pipeline", "funds"]) revalidatePath(`/${p}`, "layout");
  return { id: item.id };
}

export async function toggleActionItem(id: string, done: boolean) {
  await prisma.actionItem.update({
    where: { id },
    data: { status: done ? "done" : "open", completedAt: done ? new Date() : null },
  });
  revalidate();
  for (const p of ["investments", "pipeline", "funds"]) revalidatePath(`/${p}`, "layout");
}

export async function updateActionItem(id: string, formData: FormData): Promise<{ error?: string }> {
  const title = s(formData, "title");
  if (!title) return { error: "Title is required" };
  const due = s(formData, "dueDate");
  const link = s(formData, "link");
  const target = parseLink(link);
  await prisma.actionItem.update({
    where: { id },
    data: {
      title,
      owner: s(formData, "owner") ?? undefined,
      dueDate: due ? new Date(`${due}T12:00:00Z`) : null,
      investmentId: target.investmentId ?? null,
      dealId: target.dealId ?? null,
      fundId: target.fundId ?? null,
    },
  });
  revalidate();
  return {};
}

export async function deleteActionItem(id: string) {
  await prisma.actionItem.delete({ where: { id } });
  revalidate();
}
