"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const isCurrent = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/pipeline") return pathname === "/pipeline" || (pathname.startsWith("/pipeline/") && !pathname.startsWith("/pipeline/funnel"));
    return pathname === href || pathname.startsWith(href + "/");
  };
  return (
    <nav className="nav flex items-center gap-5 h-12">
      {items.map((it) => (
        <Link key={it.href} href={it.href} aria-current={isCurrent(it.href) ? "page" : undefined}>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
