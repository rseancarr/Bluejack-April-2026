// Pure, runtime-agnostic session token helpers (used by proxy.ts and lib/auth.ts).
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "fs_session";
/** Sessions expire after this many seconds regardless of activity (the cookie carries the same lifetime). */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const MIN_SECRET_LENGTH = 32;

/** In production a real secret is mandatory; in development a fixed one keeps `npm run dev` working. */
function secret(): string {
  const s = process.env.SESSION_SECRET ?? "";
  if (process.env.NODE_ENV === "production") {
    if (s.length < MIN_SECRET_LENGTH) throw new Error(`SESSION_SECRET must be set to at least ${MIN_SECRET_LENGTH} random characters in production.`);
    return s;
  }
  return s || "dev-insecure-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

interface Claims {
  name: string;
  /** issued at, seconds */
  iat: number;
  /** expires at, seconds */
  exp: number;
}

/** Cookie value: base64url(JSON claims).signature */
export function makeSessionToken(userName: string, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const claims: Claims = { name: userName, iat, exp: iat + SESSION_TTL_SECONDS };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<Claims>;
    if (typeof claims.name !== "string" || !claims.name || typeof claims.exp !== "number") return null;
    if (claims.exp * 1000 <= now) return null;
    return claims.name;
  } catch {
    return null;
  }
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.APP_PASSWORD ?? "";
  if (!expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Warnings about weak configuration, for the server log at sign-in time (never shown to users). */
export function configWarnings(): string[] {
  const out: string[] = [];
  if ((process.env.APP_PASSWORD ?? "").length < 12) out.push("APP_PASSWORD is shorter than 12 characters.");
  if (process.env.NODE_ENV !== "production" && !process.env.SESSION_SECRET) out.push("SESSION_SECRET is not set (development fallback in use).");
  return out;
}
