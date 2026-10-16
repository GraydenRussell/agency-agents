"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, Bot, Check, CircleAlert, Loader2, ShieldQuestion, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { approveAction, rejectAction } from "@/app/(app)/approvals/actions";
import { Markdown } from "./markdown";

export type ToolView = { id: string; name: string; status: "running" | "ok" | "error" | "pending_approval" | "approved" | "rejected" | "expired" | "failed"; summary?: string; approvalId?: string; error?: string };
export type ChatItem = { id: string; role: "user" | "assistant" | "notice"; text: string; tools: ToolView[] };

type ServerEvent =
  | { type: "conversation"; id: string }
  | { type: "text"; delta: string }
  | { type: "tool"; id: string; name: string; status: "running" | "ok" | "error" | "pending_approval"; summary?: string; approvalId?: string; error?: string }
  | { type: "notice"; message: string }
  | { type: "done"; costUsd: number }
  | { type: "error"; message: string };

const TOOL_LABEL: Record<string, string> = {
  email_search: "Searching email",
  email_read: "Reading email",
  email_summarize: "Summarizing email",
  email_draft_reply: "Drafting reply",
  email_send_reply: "Send reply",
  email_archive: "Archiving",
  email_label: "Labeling",
  email_trash: "Trash email",
  calendar_list_events: "Checking calendar",
  calendar_create_event: "Creating event",
  calendar_move_event: "Moving event",
  calendar_delete_event: "Delete event",
  calendar_find_free_time: "Finding free time",
  task_list: "Looking at tasks",
  task_create: "Creating task",
  task_update: "Updating task",
  task_complete: "Completing task",
  task_delete: "Delete task",
  task_prioritize: "Prioritizing",
  plan_day: "Planning the day",
  plan_week: "Planning the week",
  reminder_schedule: "Scheduling reminder",
  reminder_list: "Listing reminders",
  reminder_cancel: "Cancel reminder",
  note_create: "Creating note",
  note_search: "Searching notes",
  journal_append: "Writing journal",
  project_status: "Checking projects",
  project_add_next_step: "Updating project",
  business_numbers: "Pulling business numbers",
  memory_write: "Remembering",
  memory_forget: "Forgetting",
};

export const SUGGESTIONS = ["Plan my day", "What needs a reply?", "How's the business doing this week?", "Find 2 hours for admin this week", "What's on my calendar tomorrow?"];

export function ChatView({ initialConversationId = null, initialItems = [], compact = false, onConversation }: { initialConversationId?: string | null; initialItems?: ChatItem[]; compact?: boolean; onConversation?: (id: string) => void }) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [items, setItems] = useState<ChatItem[]>(initialItems);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [items]);

  const patchAssistant = (fn: (a: ChatItem) => ChatItem) =>
    setItems((xs) => {
      const last = xs[xs.length - 1];
      if (!last || last.role !== "assistant") return xs;
      return [...xs.slice(0, -1), fn(last)];
    });

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setItems((xs) => [...xs, { id: `u-${Date.now()}`, role: "user", text: message, tools: [] }, { id: `a-${Date.now()}`, role: "assistant", text: "", tools: [] }]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/assistant/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId, message }), signal: ctrl.signal });
      if (!res.ok || !res.body) throw new Error(res.status === 401 ? "Session expired; sign in again." : `Request failed (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 2);
          if (!line.startsWith("data:")) continue;
          handle(JSON.parse(line.slice(5)) as ServerEvent);
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) patchAssistant((a) => ({ ...a, text: `${a.text}\n\n⚠️ ${e instanceof Error ? e.message : "Something went wrong"}` }));
    } finally {
      setBusy(false);
      abortRef.current = null;
      router.refresh();
    }
  }

  function handle(e: ServerEvent) {
    if (e.type === "conversation") {
      setConversationId(e.id);
      onConversation?.(e.id);
    } else if (e.type === "text") patchAssistant((a) => ({ ...a, text: a.text + e.delta }));
    else if (e.type === "tool")
      patchAssistant((a) => {
        const exists = a.tools.some((t) => t.id === e.id);
        const t: ToolView = { id: e.id, name: e.name, status: e.status, summary: e.summary, approvalId: e.approvalId, error: e.error };
        // Keep paragraphs apart when the model speaks again after a tool call.
        const text = !exists && a.text && !a.text.endsWith("\n\n") ? `${a.text}\n\n` : a.text;
        return { ...a, text, tools: exists ? a.tools.map((x) => (x.id === e.id ? { ...x, ...t } : x)) : [...a.tools, t] };
      });
    else if (e.type === "notice") patchAssistant((a) => ({ ...a, text: `${a.text}\n\n_${e.message}_` }));
    else if (e.type === "error") patchAssistant((a) => ({ ...a, text: `${a.text}\n\n⚠️ ${e.message}` }));
  }

  const setToolStatus = (approvalId: string, status: ToolView["status"]) =>
    setItems((xs) => xs.map((it) => ({ ...it, tools: it.tools.map((t) => (t.approvalId === approvalId ? { ...t, status } : t)) })));

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", compact ? "h-full" : "h-[calc(100dvh-12rem)] lg:h-[calc(100dvh-10rem)]")}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" aria-live="polite">
        {items.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <Bot className="size-10 text-brand-cyan" />
            <p className="max-w-sm text-sm text-muted-foreground">Ask anything, or tell me what to do. I can read and act on your email, calendar, tasks, reminders, notes, projects, and business numbers.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {items.map((it) =>
          it.role === "user" ? (
            <div key={it.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm whitespace-pre-wrap text-primary-foreground">{it.text}</div>
            </div>
          ) : it.role === "notice" ? (
            <p key={it.id} className="text-center text-xs text-muted-foreground">
              {it.text}
            </p>
          ) : (
            <div key={it.id} className="space-y-2" data-testid="assistant-message">
              {it.tools.map((t) => (
                <ToolCard key={t.id} tool={t} onDecided={setToolStatus} />
              ))}
              {it.text ? (
                <div className="max-w-[95%] text-sm leading-relaxed">
                  <Markdown text={it.text.trim()} />
                </div>
              ) : busy && it === items[items.length - 1] && it.tools.every((t) => t.status !== "running") ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Thinking…
                </p>
              ) : null}
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <Textarea
          aria-label="Message the assistant"
          rows={compact ? 2 : 2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder="Message your assistant…"
          className="min-h-11 resize-none"
        />
        {busy ? (
          <Button type="button" size="icon" variant="outline" aria-label="Stop" onClick={() => abortRef.current?.abort()}>
            <Square />
          </Button>
        ) : (
          <Button type="submit" size="icon" aria-label="Send" disabled={!input.trim()}>
            <ArrowUp />
          </Button>
        )}
      </form>
    </div>
  );
}

function ToolCard({ tool, onDecided }: { tool: ToolView; onDecided: (approvalId: string, status: ToolView["status"]) => void }) {
  const [pending, setPending] = useState(false);
  const label = TOOL_LABEL[tool.name] ?? tool.name;
  if (tool.status === "pending_approval" && tool.approvalId) {
    const id = tool.approvalId;
    const decide = async (approve: boolean) => {
      setPending(true);
      const r = approve ? await approveAction(id) : await rejectAction(id);
      setPending(false);
      if (!r.ok) return toast.error(r.error);
      onDecided(id, approve ? "approved" : "rejected");
      toast.success(approve ? "Approved and done" : "Rejected");
    };
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm" data-testid="approval-card">
        <p className="mb-1 flex items-center gap-1.5 font-medium text-amber-400">
          <ShieldQuestion className="size-4" /> Needs your approval: {label}
        </p>
        <p className="mb-3 whitespace-pre-wrap">{tool.summary}</p>
        <div className="flex gap-2">
          <Button size="sm" disabled={pending} onClick={() => void decide(true)}>
            <Check /> Approve
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => void decide(false)}>
            <X /> Reject
          </Button>
        </div>
      </div>
    );
  }
  const icon =
    tool.status === "running" ? <Loader2 className="size-3.5 animate-spin" /> : tool.status === "error" || tool.status === "failed" ? <CircleAlert className="size-3.5 text-red-400" /> : tool.status === "rejected" || tool.status === "expired" ? <X className="size-3.5" /> : <Check className="size-3.5 text-emerald-400" />;
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <span className="mt-0.5">{icon}</span>
      <span>
        {label}
        {tool.status === "approved" && " (approved)"}
        {tool.status === "rejected" && " (rejected)"}
        {tool.error && <span className="block text-red-400">{tool.error}</span>}
      </span>
    </div>
  );
}
