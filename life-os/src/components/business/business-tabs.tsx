"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/business", label: "Overview" },
  { href: "/business/kpis", label: "KPIs" },
  { href: "/business/leads", label: "Leads" },
  { href: "/business/customers", label: "Customers" },
  { href: "/business/quotes", label: "Quotes" },
  { href: "/business/route", label: "Route" },
  { href: "/business/weather", label: "Weather" },
  { href: "/business/rebook", label: "Re-book" },
  { href: "/business/reviews", label: "Reviews" },
  { href: "/business/referrals", label: "Referrals" },
];

export function BusinessTabs({ unansweredLeads = 0, lateLeads = 0 }: { unansweredLeads?: number; lateLeads?: number }) {
  const path = usePathname();
  const active = (href: string) => (href === "/business" ? path === href : path.startsWith(href));
  return (
    <nav aria-label="Business sections" className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={active(t.href) ? "page" : undefined} className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors", active(t.href) ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
          {t.label}
          {t.href === "/business/leads" && unansweredLeads > 0 && (
            <span className={cn("rounded-full px-1.5 text-xs font-semibold tabular-nums", lateLeads > 0 ? "bg-red-500 text-white" : "bg-primary text-primary-foreground")} aria-label={`${unansweredLeads} unanswered${lateLeads ? `, ${lateLeads} waiting too long` : ""}`}>
              {unansweredLeads}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
