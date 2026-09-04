// Pure, runtime-agnostic session token helpers (used by proxy.ts and lib/auth.ts).
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "fs_session";

function secret(): string {
  return process.env.SESSION_SECRET || "dev-insecure-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Cookie value: base64url(name).signature */
export function makeSessionToken(userName: string): string {
  const payload = Buffer.from(userName, "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const name = Buffer.from(payload, "base64url").toString("utf8");
  return name || null;
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.APP_PASSWORD ?? "";
  if (!expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
