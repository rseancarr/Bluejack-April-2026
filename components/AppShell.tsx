import { existsSync } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import Link from "next/link";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { Nav } from "./Nav";
import { logout } from "@/lib/actions/auth";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/investments", label: "Investments" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/pipeline/funnel", label: "Funnel" },
  { href: "/action-items", label: "Action items" },
  { href: "/funds", label: "Funds" },
  { href: "/import", label: "Import" },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const user = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const hasLogo = existsSync(path.join(process.cwd(), "public", "brand", "logo.svg"));

  return (
    <>
      <header className="border-b border-line bg-paper">
        <div className="mx-auto max-w-[1400px] px-6 flex items-center gap-8 h-12">
          <Link href="/" className="flex items-center gap-3 shrink-0" aria-label="Freestone Capital">
            {hasLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/brand/logo.svg" alt="Freestone Capital" className="h-5 w-auto" />
            ) : (
              <span className="wordmark">Freestone Capital</span>
            )}
            <span className="text-ink-4 text-[11px] uppercase tracking-[0.12em] hidden sm:inline">Portfolio</span>
          </Link>
          {user && <Nav items={NAV} />}
          <div className="ml-auto flex items-center gap-3 text-ink-3">
            {user ? (
              <>
                <span className="text-[12px]">{user}</span>
                <form action={logout}>
                  <button className="btn btn-ghost btn-sm" type="submit">Sign out</button>
                </form>
              </>
            ) : null}
          </div>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-[1400px] px-6 py-6">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-[1400px] px-6 py-3 text-[11px] text-ink-4 tracking-wide">
          Freestone Capital — Internal. Confidential.
        </div>
      </footer>
    </>
  );
}
