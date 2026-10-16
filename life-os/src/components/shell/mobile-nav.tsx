"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function MobileNav({ badges }: { badges: Partial<Record<string, number>> }) {
  const pathname = usePathname();
  const tabs = NAV.filter((n) => n.mobile);
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden" aria-label="Primary">
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {tabs.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const badge = badges[item.href];
          return (
            <li key={item.href} className="flex-1">
              <Link href={item.href} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-brand-cyan" : "text-muted-foreground")}>
                <Icon className="size-5" />
                {item.label}
                {badge ? <span className="absolute top-1 right-1/4 size-2 rounded-full bg-primary" /> : null}
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <Sheet>
            <SheetTrigger className="flex w-full flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground">
              <Menu className="size-5" />
              More
            </SheetTrigger>
            <SheetContent side="bottom" className="p-4">
              <SheetTitle className="mb-3 font-heading text-2xl">Everything</SheetTitle>
              <div className="grid grid-cols-3 gap-2">
                {NAV.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} className="flex flex-col items-center gap-1 rounded-lg border border-border p-3 text-xs">
                      <Icon className="size-5 text-brand-cyan" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}
