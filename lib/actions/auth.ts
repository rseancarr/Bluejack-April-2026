"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, makeSessionToken, SESSION_COOKIE } from "@/lib/session";
import { teamMembers } from "@/lib/constants";

export async function login(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "");
  const next = String(formData.get("next") ?? "/");
  if (!teamMembers().includes(name)) return { error: "Pick your name." };
  if (!checkPassword(password)) return { error: "Wrong password." };
  const store = await cookies();
  store.set(SESSION_COOKIE, makeSessionToken(name), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
  redirect(next.startsWith("/") ? next : "/");
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
