import Link from "next/link";
import { Inbox as InboxIcon, PenLine } from "lucide-react";
import type { EmailCategory } from "@/generated/prisma/enums";
import { EmptyState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shell/page-header";
import { CATEGORY_META, priorityColor } from "@/components/inbox/category";
import { SyncInboxButton } from "@/components/inbox/sync-button";
import { ThreadView } from "@/components/inbox/thread-view";
import { isGoogleConnected } from "@/lib/services/calendar";
import { getThread, inboxCounts, listThreads, markRead, syncInboxIfStale, type InboxFilter } from "@/lib/services/mail";
import { formatTime, localDateOf, relativeDayLabel, today } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Inbox" };

const CATEGORIES = Object.keys(CATEGORY_META) as EmailCategory[];

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const sp = await searchParams;
  const view = (sp.view === "inbox" || sp.view === "all" ? sp.view : "reply") as NonNullable<InboxFilter["view"]>;
  const category = typeof sp.category === "string" && CATEGORIES.includes(sp.category as EmailCategory) ? (sp.category as EmailCategory) : undefined;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const threadId = typeof sp.thread === "string" ? sp.thread : undefined;

  const connected = await isGoogleConnected();
  if (connected) await syncInboxIfStale();
  const [threads, counts, open] = await Promise.all([listThreads({ view, category, q }), inboxCounts(), threadId ? getThread(threadId) : null]);
  if (open?.unread) await markRead(open.id, true);

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view, category, q, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/inbox?${p.toString()}`;
  };
  const backHref = qs({ thread: undefined });

  return (
    <>
      <PageHeader title="Inbox" description={`${counts.unread} unread · ${counts.needsReply} need a reply`} actions={<SyncInboxButton />} />
      {!connected && (
        <EmptyState icon={InboxIcon} title="Connect Gmail" description="Connect Google in Settings to sync your inbox." className="mb-4" action={<Link href="/settings#integrations" className="underline">Open Settings</Link>} />
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className={cn("min-w-0", open && "max-lg:hidden")}>
          <div className="mb-3 inline-flex rounded-lg bg-muted p-1 text-sm">
            {(
              [
                ["reply", `Needs reply (${counts.needsReply})`],
                ["inbox", "Inbox"],
                ["all", "All"],
              ] as const
            ).map(([k, label]) => (
              <Link key={k} href={qs({ view: k, thread: undefined })} className={cn("rounded-md px-3 py-1", view === k ? "bg-background shadow-sm" : "text-muted-foreground")}>
                {label}
              </Link>
            ))}
          </div>
          <form action="/inbox" className="mb-3">
            <input type="hidden" name="view" value={view} />
            <Input name="q" defaultValue={q} placeholder="Search mail" aria-label="Search mail" />
          </form>
          <div className="mb-3 flex flex-wrap gap-1.5">
            <Link href={qs({ category: undefined, thread: undefined })} className={cn("rounded-full border px-2.5 py-0.5 text-xs", !category ? "border-primary bg-primary/15" : "border-border text-muted-foreground")}>
              All
            </Link>
            {CATEGORIES.filter((c) => counts.byCategory[c]).map((c) => (
              <Link key={c} href={qs({ category: c, thread: undefined })} className={cn("rounded-full border px-2.5 py-0.5 text-xs", category === c ? "border-primary bg-primary/15" : "border-border text-muted-foreground")}>
                {CATEGORY_META[c].label} {counts.byCategory[c]}
              </Link>
            ))}
          </div>
          {threads.length === 0 ? (
            <EmptyState icon={InboxIcon} title={view === "reply" ? "Nothing needs a reply" : "No mail here"} description={view === "reply" ? "You're all caught up." : undefined} />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/40" data-testid="thread-list">
              {threads.map((t) => {
                const d = localDateOf(t.lastMessageAt);
                return (
                  <li key={t.id}>
                    <Link href={qs({ thread: t.id })} className={cn("flex gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40", t.id === threadId && "bg-accent/60")}>
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", priorityColor(t.priority))} aria-label={`priority ${t.priority ?? "untriaged"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cn("truncate text-sm", t.unread && "font-semibold")}>{t.fromName ?? t.fromEmail}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">{d === today() ? formatTime(t.lastMessageAt) : relativeDayLabel(d)}</span>
                        </span>
                        <span className={cn("block truncate text-sm", t.unread ? "text-foreground" : "text-muted-foreground")}>{t.subject}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          {t.category && <span className={cn("rounded px-1 text-[10px]", CATEGORY_META[t.category].className)}>{CATEGORY_META[t.category].label}</span>}
                          {t.drafts.length > 0 && <PenLine className="size-3 text-brand-cyan" aria-label="Draft ready" />}
                          <span className="truncate">{t.summary ?? t.snippet}</span>
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className={cn("min-w-0", !open && "max-lg:hidden")}>
          {open ? (
            <ThreadView
              key={open.id}
              backHref={backHref}
              thread={{
                id: open.id,
                subject: open.subject,
                category: open.category,
                priority: open.priority,
                summary: open.summary,
                needsReply: open.needsReply,
                unread: open.unread,
                draft: open.drafts[0]?.body ?? null,
                messages: open.messages.map((m) => ({ id: m.id, fromName: m.fromName, fromEmail: m.fromEmail, to: m.to, date: m.date.toISOString(), bodyText: m.bodyText, isFromMe: m.isFromMe })),
              }}
            />
          ) : (
            <EmptyState icon={InboxIcon} title="Select a conversation" className="h-full min-h-60" />
          )}
        </div>
      </div>
    </>
  );
}
