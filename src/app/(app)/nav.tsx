"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Dashboard", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { href: "/customers", label: "Customers", icon: "M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21c0-4 4-6 8-6s8 2 8 6" },
  { href: "/loans", label: "Loans", icon: "M3 7h18v10H3zM12 9.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5" },
  { href: "/ledger", label: "Ledger", icon: "M5 4h11l3 3v13H5zM8 10h8M8 14h8M8 18h5" },
  { href: "/reminders", label: "Reminders", icon: "M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 004 0" },
  { href: "/settings", label: "Settings", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM4 12h2m12 0h2M12 4v2m0 12v2" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function Nav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      <nav className="hidden w-52 shrink-0 flex-col gap-1 md:flex">
        {items.map((i) => (
          <Link key={i.href} href={i.href}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium ${active(i.href) ? "bg-brand-soft text-brand-dark" : "text-slate-600 hover:bg-slate-100"}`}>
            <Icon d={i.icon} />
            {i.label}
          </Link>
        ))}
      </nav>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.map((i) => (
          <Link key={i.href} href={i.href}
            className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${active(i.href) ? "text-brand" : "text-slate-500"}`}>
            <Icon d={i.icon} />
            {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
