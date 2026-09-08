"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "../db";
import { teamMembers } from "../constants";
import { fetchCalendarText, isAcceptableCalendarUrl } from "../calendar/outlook";

export async function saveCalendarLink(_prev: { error?: string; ok?: boolean } | null, formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const owner = String(formData.get("owner") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  if (!teamMembers().includes(owner)) return { error: "Unknown team member." };
  const bad = isAcceptableCalendarUrl(url);
  if (bad) return { error: bad };
  try {
    await fetchCalendarText(url);
  } catch (e) {
    return { error: `Could not read that link: ${(e as Error).message}` };
  }
  await prisma.teamCalendar.upsert({ where: { owner }, create: { owner, url }, update: { url } });
  revalidatePath("/today");
  return { ok: true };
}

export async function removeCalendarLink(owner: string): Promise<void> {
  await prisma.teamCalendar.deleteMany({ where: { owner } });
  revalidatePath("/today");
}
