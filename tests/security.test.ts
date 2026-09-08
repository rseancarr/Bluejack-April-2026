import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeSessionToken, verifySessionToken, SESSION_TTL_SECONDS } from "../lib/session";
import { createLimiter, clientAddress } from "../lib/ratelimit";
import { isAcceptableCalendarUrl } from "../lib/calendar/outlook";

describe("session tokens", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.SESSION_SECRET = "unit-test-secret-that-is-long-enough-0123456789";
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("round-trips a name and expires", () => {
    const t0 = Date.parse("2026-09-08T12:00:00Z");
    const tok = makeSessionToken("Sean", t0);
    expect(verifySessionToken(tok, t0 + 1000)).toBe("Sean");
    expect(verifySessionToken(tok, t0 + SESSION_TTL_SECONDS * 1000 - 1)).toBe("Sean");
    expect(verifySessionToken(tok, t0 + SESSION_TTL_SECONDS * 1000)).toBeNull();
  });

  it("rejects tampering, another secret, and the old unsigned-name format", () => {
    const tok = makeSessionToken("Sean");
    const [payload, sig] = tok.split(".");
    expect(verifySessionToken(`${payload}x.${sig}`)).toBeNull();
    expect(verifySessionToken(`${Buffer.from("AJ").toString("base64url")}.${sig}`)).toBeNull();
    process.env.SESSION_SECRET = "a-different-secret-that-is-also-long-enough-xx";
    expect(verifySessionToken(tok)).toBeNull();
    expect(verifySessionToken(undefined)).toBeNull();
    expect(verifySessionToken("garbage")).toBeNull();
  });

  it("refuses to run in production without a real secret", () => {
    const nodeEnv = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.SESSION_SECRET = "short";
    expect(() => makeSessionToken("Sean")).toThrow(/SESSION_SECRET/);
    (process.env as Record<string, string>).NODE_ENV = nodeEnv ?? "test";
  });
});

describe("sign-in rate limiter", () => {
  it("allows max attempts per window, then makes the client wait, then forgets", () => {
    const l = createLimiter({ max: 3, windowMs: 60_000 });
    const t0 = 1_000_000;
    expect(l.hit("1.2.3.4", t0)).toBe(0);
    expect(l.hit("1.2.3.4", t0 + 1)).toBe(0);
    expect(l.hit("1.2.3.4", t0 + 2)).toBe(0);
    expect(l.hit("1.2.3.4", t0 + 3)).toBeGreaterThan(0);
    expect(l.hit("5.6.7.8", t0 + 3)).toBe(0); // other clients unaffected
    expect(l.hit("1.2.3.4", t0 + 60_001)).toBe(0); // window passed
    l.reset("5.6.7.8");
    expect(l.hit("5.6.7.8", t0 + 4)).toBe(0);
  });

  it("reads the client address from the proxy header", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientAddress(new Headers())).toBe("unknown");
  });
});

describe("calendar link allow-list", () => {
  it("accepts Outlook and Google links only, over https, without credentials", () => {
    expect(isAcceptableCalendarUrl("https://outlook.office365.com/owa/calendar/abc/calendar.ics")).toBeNull();
    expect(isAcceptableCalendarUrl("https://calendar.google.com/calendar/ical/x/basic.ics")).toBeNull();
    expect(isAcceptableCalendarUrl("http://outlook.office365.com/x.ics")).toMatch(/https/);
    expect(isAcceptableCalendarUrl("https://169.254.169.254/metadata")).toMatch(/only accepted/);
    expect(isAcceptableCalendarUrl("https://evil.example.com/outlook.office365.com/x.ics")).toMatch(/only accepted/);
    expect(isAcceptableCalendarUrl("https://user:pw@outlook.office365.com/x.ics")).toMatch(/username/);
    expect(isAcceptableCalendarUrl("not a url")).toMatch(/not a web address/);
  });
});
