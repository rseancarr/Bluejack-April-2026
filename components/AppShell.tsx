import { existsSync } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import Link from "next/link";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { Nav } from "./Nav";
import { MobileNav } from "./MobileNav";
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
  const logoFile = ["logo.svg", "logo.png"].find((f) => existsSync(path.join(process.cwd(), "public", "brand", f)));

  return (
    <>
      <header className="border-b border-line bg-paper">
        <div className="mx-auto max-w-[1400px] px-3 md:px-6 flex items-center gap-4 md:gap-5 lg:gap-8 h-12">
          <Link href="/" className="flex items-center gap-3 shrink-0" aria-label="Freestone Capital">
            {logoFile ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/brand/${logoFile}`} alt="Freestone" className="h-[22px] w-auto" />
            ) : (
              <span className="wordmark">Freestone Capital</span>
            )}
            <span className="text-navy text-[11px] uppercase tracking-[0.14em] hidden lg:inline pt-0.5">Portfolio</span>
          </Link>
          {user && <div className="hidden md:block"><Nav items={NAV} /></div>}
          <div className="ml-auto flex items-center gap-3 text-ink-3">
            {user ? (
              <>
                <span className="text-[12px] whitespace-nowrap">{user}</span>
                <form action={logout} className="hidden md:block">
                  <button className="btn btn-ghost btn-sm" type="submit">Sign out</button>
                </form>
              </>
            ) : null}
          </div>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-[1400px] px-3 md:px-6 py-4 md:py-6 pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-6">{children}</main>
      <footer className="border-t border-line hidden md:block">
        <div className="mx-auto max-w-[1400px] px-6 py-3 text-[11px] text-ink-4 tracking-wide">
          Freestone Capital — Internal. Confidential.
        </div>
      </footer>
      {user && <MobileNav logout={logout} />}
    </>
  );
}
