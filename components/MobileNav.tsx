"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const PRIMARY = [
  { href: "/", label: "Home", icon: "M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" },
  { href: "/pipeline", label: "Pipeline", icon: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z" },
  { href: "/action-items", label: "Actions", icon: "M5 12l4 4L19 6M5 6h6" },
  { href: "/investments", label: "Invest.", icon: "M4 19h16M6 15l4-5 4 3 4-6" },
];
const MORE = [
  { href: "/pipeline/funnel", label: "Funnel" },
  { href: "/funds", label: "Funds" },
  { href: "/action-items/meeting", label: "Meeting mode" },
  { href: "/import", label: "Import" },
];

export function MobileNav({ logout }: { logout: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = (href: string) => (href === "/" ? pathname === "/" : pathname === href || (pathname.startsWith(href + "/") && !(href === "/pipeline" && pathname.startsWith("/pipeline/funnel")) && !(href === "/action-items" && pathname.startsWith("/action-items/meeting"))));
  const moreActive = MORE.some((m) => pathname === m.href || pathname.startsWith(m.href + "/"));
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute bottom-[calc(56px+env(safe-area-inset-bottom))] left-0 right-0 bg-paper border-t border-line p-2" onClick={(e) => e.stopPropagation()}>
            {MORE.map((m) => (
              <Link key={m.href} href={m.href} onClick={() => setOpen(false)} className="block px-4 py-3 text-[15px] border-b border-line-2 last:border-0">{m.label}</Link>
            ))}
            <form action={logout}><button className="block w-full text-left px-4 py-3 text-[15px] text-ink-3" type="submit">Sign out</button></form>
          </div>
        </div>
      )}
      <nav className="mobile-nav md:hidden" aria-label="Primary">
        {PRIMARY.map((it) => (
          <Link key={it.href} href={it.href} aria-current={current(it.href) ? "page" : undefined} onClick={() => setOpen(false)}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={it.icon} /></svg>
            <span>{it.label}</span>
          </Link>
        ))}
        <button type="button" aria-current={moreActive ? "page" : undefined} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
