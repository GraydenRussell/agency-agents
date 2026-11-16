"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Bell, Briefcase, CalendarCheck, CheckCircle2, CloudLightning, DollarSign, Inbox, MessageSquareText, PartyPopper, Repeat, Settings2, ShieldCheck, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/ui/use-action";
import { doNowItemAction } from "@/app/(app)/now/actions";
import type { DoArea, DoItem, Urgency } from "@/lib/services/do-now";
import { cn } from "@/lib/utils";

const ICON: Record<DoArea, typeof Bell> = { approvals: ShieldCheck, leads: MessageSquareText, tasks: CheckCircle2, quotes: Briefcase, rebook: Repeat, reviews: Star, money: DollarSign, weather: CloudLightning, people: Users, inbox: Inbox, habits: CalendarCheck, setup: Settings2 };
const SECTIONS: Array<[Urgency, string, string]> = [
  ["now", "Right now", "border-red-500/40"],
  ["today", "Today", "border-amber-500/40"],
  ["week", "This week", "border-border"],
  ["later", "To finish setting up", "border-border"],
];

export function DoNowList({ items }: { items: DoItem[] }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const live = items.filter((i) => !gone.has(i.key));
  const act = (i: DoItem, op: string) => {
    setBusy(i.key);
    run(() => doNowItemAction(i.key, op), {
      success: (m) => m,
      onSuccess: () => {
        setGone((g) => new Set(g).add(i.key));
        setBusy(null);
        router.refresh();
      },
    });
  };
  if (!pending && busy) setBusy(null);

  if (live.length === 0)
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
        <PartyPopper className="size-8 text-emerald-500" />
        <p className="font-medium">Nothing needs you right now</p>
        <p className="max-w-sm text-sm text-muted-foreground">Every lead answered, task done, and bill paid. New things show up here the moment they need you.</p>
      </div>
    );

  return (
    <div className="space-y-5">
      {SECTIONS.map(([u, label, border]) => {
        const list = live.filter((i) => i.urgency === u);
        if (!list.length) return null;
        return (
          <section key={u} aria-labelledby={`do-${u}`}>
            <h2 id={`do-${u}`} className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {u === "now" && <AlertCircle className="size-3.5 text-red-500" />} {label} <span className="rounded-full bg-muted px-1.5 tabular-nums">{list.length}</span>
            </h2>
            <ul className={cn("divide-y divide-border overflow-hidden rounded-xl border bg-card", border)} data-testid={`do-${u}`}>
              {list.map((i) => {
                const Icon = ICON[i.area];
                return (
                  <li key={i.key} className={cn("flex flex-wrap items-center gap-3 px-4 py-3 transition-opacity", busy === i.key && "opacity-50")}>
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-[12rem] flex-1">
                      {i.href ? <Link href={i.href} className="block font-medium hover:underline">{i.title}</Link> : <span className="block font-medium">{i.title}</span>}
                      {i.detail && <span className="block truncate text-xs text-muted-foreground">{i.detail}</span>}
                    </div>
                    <div className="ml-7 flex shrink-0 flex-wrap gap-1 sm:ml-0">
                      {i.actions.map((a) => (
                        <Button key={a.op} size="sm" variant={a.primary ? "default" : "outline"} disabled={busy === i.key} onClick={() => act(i, a.op)} aria-label={`${a.label}: ${i.title}`}>
                          {a.label}
                        </Button>
                      ))}
                      {i.href && (
                        <Button asChild size="sm" variant="ghost" aria-label={`Open: ${i.title}`}>
                          <Link href={i.href}>{i.actions.length ? "" : "Open"} <ArrowRight /></Link>
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const SUGGESTIONS = ["Plan my day around my jobs and Top 3", "Draft replies to my waiting leads", "Quote 30 panes, 2-story, screens for Tom Becker", "Log $48 gas at QuikTrip", "What's my revenue this month vs last?"];

export function AskBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const go = (text: string) => text.trim() && router.push(`/assistant?q=${encodeURIComponent(text.trim())}`);
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); go(q); }}>
        <label htmlFor="ask" className="sr-only">Ask Life OS to do anything</label>
        <input id="ask" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask Life OS to do anything… “text my waiting leads”, “block 2 hours for GREYVO content tomorrow”" className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <Button type="submit" disabled={!q.trim()}>Do it</Button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s, i) => (
          <button key={s} type="button" onClick={() => go(s)} className={cn("rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground", i > 2 && "hidden sm:inline-block")}>{s}</button>
        ))}
      </div>
    </div>
  );
}
