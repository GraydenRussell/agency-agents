"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/business", label: "Overview" },
  { href: "/business/customers", label: "Customers" },
  { href: "/business/quotes", label: "Quotes" },
];

export function BusinessTabs() {
  const path = usePathname();
  const active = (href: string) => (href === "/business" ? path === href : path.startsWith(href));
  return (
    <nav aria-label="Business sections" className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={active(t.href) ? "page" : undefined} className={cn("-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors", active(t.href) ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
