"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, configWarnings, makeSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/session";
import { teamMembers } from "@/lib/constants";
import { clientAddress, globalLoginLimiter, loginLimiter } from "@/lib/ratelimit";

let warned = false;

export async function login(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "");
  const next = String(formData.get("next") ?? "/");
  const ip = clientAddress(await headers());
  const wait = Math.max(loginLimiter.hit(ip), globalLoginLimiter.hit("all"));
  if (wait > 0) return { error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` };
  if (!teamMembers().includes(name)) return { error: "Pick your name." };
  if (!checkPassword(password)) {
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing
    return { error: "Wrong password." };
  }
  if (!warned) {
    warned = true;
    for (const w of configWarnings()) console.warn(`[config] ${w}`);
  }
  loginLimiter.reset(ip);
  const store = await cookies();
  store.set(SESSION_COOKIE, makeSessionToken(name), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
  // Only same-site relative paths; never an absolute URL (open-redirect guard).
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
