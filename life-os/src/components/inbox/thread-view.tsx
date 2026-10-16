"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArrowLeft, Clock, Loader2, MailOpen, Send, Sparkles, Tag, Trash2 } from "lucide-react";
import type { EmailCategory } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/ui/use-action";
import { addDays, atLocalMinutes, formatDateTime, isoWeekday, today } from "@/lib/time";
import { cn } from "@/lib/utils";
import { archiveAction, discardDraftAction, draftAction, labelAction, markReadAction, saveDraftAction, sendReplyAction, snoozeAction, trashAction, unarchiveAction, untrashAction } from "@/app/(app)/inbox/actions";
import { CATEGORY_META } from "./category";

export type ThreadDetail = {
  id: string;
  subject: string;
  category: EmailCategory | null;
  priority: number | null;
  summary: string | null;
  needsReply: boolean;
  unread: boolean;
  messages: Array<{ id: string; fromName: string | null; fromEmail: string; to: string[]; date: string; bodyText: string; isFromMe: boolean }>;
  draft: string | null;
};

function snoozeOptions(): Array<{ label: string; at: Date }> {
  const t = today();
  const tomorrow8 = atLocalMinutes(addDays(t, 1), 8 * 60);
  const daysToMon = ((8 - isoWeekday(t)) % 7) || 7;
  return [
    { label: "Later today (3 hours)", at: new Date(Date.now() + 3 * 3_600_000) },
    { label: "Tomorrow 8 AM", at: tomorrow8 },
    { label: "Next week (Mon 8 AM)", at: atLocalMinutes(addDays(t, daysToMon), 8 * 60) },
  ];
}

export function ThreadView({ thread, backHref }: { thread: ThreadDetail; backHref: string }) {
  const router = useRouter();
  const [body, setBody] = useState(thread.draft ?? "");
  const [instructions, setInstructions] = useState("");
  const [label, setLabel] = useState("");
  const { pending, run } = useAction();
  const [drafting, setDrafting] = useState(false);
  const goBack = () => router.push(backHref);

  const draft = () => {
    setDrafting(true);
    run(() => draftAction(thread.id, instructions || undefined), {
      onSuccess: (d) => {
        setBody(d.body);
        setDrafting(false);
        if (!d.ai) toast.info("AI drafting is off (mock mode or no API key), so this is a template.");
      },
    });
    setTimeout(() => setDrafting(false), 30_000);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Back" onClick={goBack} className="lg:hidden">
          <ArrowLeft />
        </Button>
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => archiveAction(thread.id), { onSuccess: () => { toast("Archived", { action: { label: "Undo", onClick: () => void unarchiveAction(thread.id) } }); goBack(); } })}>
          <Archive /> Archive
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Clock /> Snooze
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Back in your inbox…</DropdownMenuLabel>
            {snoozeOptions().map((o) => (
              <DropdownMenuItem key={o.label} onSelect={() => run(() => snoozeAction(thread.id, o.at.toISOString()), { success: `Snoozed until ${formatDateTime(o.at)}`, onSuccess: goBack })}>
                {o.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Tag /> Label
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60 p-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (label.trim()) run(() => labelAction(thread.id, label), { success: `Labeled "${label}"`, onSuccess: () => setLabel("") });
              }}
            >
              <Input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label name, then Enter" onKeyDown={(e) => e.stopPropagation()} />
            </form>
            <DropdownMenuSeparator />
            {["Customers", "Leads", "Vendors", "Receipts"].map((l) => (
              <DropdownMenuItem key={l} onSelect={() => run(() => labelAction(thread.id, l), { success: `Labeled "${l}"` })}>
                {l}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => markReadAction(thread.id, false), { success: "Marked unread", onSuccess: goBack })}>
          <MailOpen /> Unread
        </Button>
        <Button variant="ghost" size="sm" className="text-red-400" disabled={pending} onClick={() => run(() => trashAction(thread.id), { onSuccess: () => { toast("Moved to trash", { action: { label: "Undo", onClick: () => void untrashAction(thread.id) } }); goBack(); } })}>
          <Trash2 /> Trash
        </Button>
      </div>

      <div>
        <h2 className="font-sans text-xl font-semibold">{thread.subject}</h2>
        {thread.category && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2 text-sm">
            <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", CATEGORY_META[thread.category].className)}>{CATEGORY_META[thread.category].label}</span>
            <span className="text-xs text-muted-foreground">priority {thread.priority ?? "–"}</span>
            {thread.summary && <span className="flex-1">{thread.summary}</span>}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {thread.messages.map((m) => (
          <article key={m.id} className={cn("rounded-xl border border-border p-4", m.isFromMe ? "bg-primary/5" : "bg-card")}>
            <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">
                {m.isFromMe ? "You" : (m.fromName ?? m.fromEmail)} <span className="font-normal text-muted-foreground">&lt;{m.fromEmail}&gt;</span>
              </span>
              <time className="text-xs text-muted-foreground">{formatDateTime(new Date(m.date))}</time>
            </header>
            <div className="text-sm leading-relaxed break-words whitespace-pre-wrap">{m.bodyText}</div>
          </article>
        ))}
      </div>

      <section aria-label="Reply" className="space-y-2 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Optional: what should the reply say? (e.g. offer Tuesday 9am, $350)" className="min-w-48 flex-1" />
          <Button variant="secondary" onClick={draft} disabled={pending || drafting}>
            {drafting ? <Loader2 className="animate-spin" /> : <Sparkles />} Draft with AI
          </Button>
        </div>
        <Textarea aria-label="Reply body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} onBlur={() => body && run(() => saveDraftAction(thread.id, body))} placeholder="Write a reply…" />
        <div className="flex justify-between gap-2">
          <Button variant="ghost" size="sm" disabled={!body || pending} onClick={() => run(() => discardDraftAction(thread.id), { onSuccess: () => setBody("") })}>
            Discard
          </Button>
          <Button
            disabled={!body.trim() || pending}
            onClick={() => {
              if (!confirm("Send this reply now?")) return;
              run(() => sendReplyAction(thread.id, body), { success: (r) => `Sent to ${r.to.join(", ")}`, onSuccess: () => { setBody(""); router.refresh(); } });
            }}
          >
            <Send /> Send
          </Button>
        </div>
      </section>
    </div>
  );
}
