"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { NAV, NAV_GROUP_LABELS, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useShell } from "./shell-context";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ badges }: { badges: Partial<Record<string, number>> }) {
  const pathname = usePathname();
  const { setOpen } = useShell();
  const groups = (["main", "life", "system"] as const).map((g) => ({ g, items: NAV.filter((n) => n.group === g) }));

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-card/40 lg:flex">
      <div className="flex items-center gap-2 px-5 pt-5 pb-3">
        <div className="grid size-8 place-items-center rounded-lg bg-primary font-display text-lg text-white">L</div>
        <span className="font-heading text-2xl tracking-wider">Life OS</span>
      </div>
      <button
        onClick={() => setOpen("palette", true)}
        className="mx-3 mb-2 flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search or jump…</span>
        <kbd>⌘K</kbd>
      </button>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map(({ g, items }) => (
          <div key={g} className="mt-3">
            <p className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{NAV_GROUP_LABELS[g]}</p>
            {items.map((item) => (
              <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} badge={badges[item.href]} />
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function SidebarLink({ item, active, badge }: { item: NavItem; active: boolean; badge?: number }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
        active ? "bg-primary/15 font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className={cn("size-4", active && "text-brand-cyan")} />
      <span className="flex-1">{item.label}</span>
      {badge ? <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-white">{badge}</span> : null}
      {item.chord && <kbd className="opacity-0 transition-opacity group-hover:opacity-100">G {item.chord.toUpperCase()}</kbd>}
    </Link>
  );
}
