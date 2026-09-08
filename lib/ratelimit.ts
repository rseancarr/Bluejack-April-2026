// Small in-memory rate limiter for sign-in attempts. Per process: enough for a single-instance
// deployment; with several instances each one enforces its own budget.
export interface Limiter {
  /** Returns the number of seconds to wait, or 0 when the attempt may proceed. Records the attempt. */
  hit(key: string, now?: number): number;
  /** Clears a key after a success. */
  reset(key: string): void;
}

export function createLimiter({ max, windowMs }: { max: number; windowMs: number }): Limiter {
  const hits = new Map<string, number[]>();
  return {
    hit(key, now = Date.now()) {
      const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (list.length >= max) {
        hits.set(key, list);
        return Math.ceil((list[0] + windowMs - now) / 1000);
      }
      list.push(now);
      hits.set(key, list);
      if (hits.size > 10_000) for (const k of hits.keys()) if (hits.get(k)!.every((t) => now - t >= windowMs)) hits.delete(k);
      return 0;
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

/** 10 attempts per 15 minutes per client address, plus a global ceiling so a botnet cannot brute-force either. */
export const loginLimiter = createLimiter({ max: 10, windowMs: 15 * 60_000 });
export const globalLoginLimiter = createLimiter({ max: 200, windowMs: 15 * 60_000 });

/** Client address behind a reverse proxy (Azure App Service / Front Door set x-forwarded-for). */
export function clientAddress(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") ?? headers.get("x-client-ip") ?? "unknown";
}
