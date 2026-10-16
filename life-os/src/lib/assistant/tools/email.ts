import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import * as mail from "@/lib/services/mail";
import { formatDateTime } from "@/lib/time";
import { defineTool } from "../registry";

async function thread(id: string) {
  const t = await db.emailThread.findUnique({ where: { id }, include: { messages: { orderBy: { date: "asc" } } } });
  if (!t) throw new Error(`No email thread with id ${id}`);
  return t;
}

const brief = (t: { id: string; subject: string; fromName: string | null; fromEmail: string; lastMessageAt: Date; category: string | null; priority: number | null; summary: string | null; needsReply: boolean; unread: boolean }) => ({
  id: t.id,
  subject: t.subject,
  from: t.fromName ? `${t.fromName} <${t.fromEmail}>` : t.fromEmail,
  when: formatDateTime(t.lastMessageAt),
  category: t.category,
  priority: t.priority,
  summary: t.summary,
  needsReply: t.needsReply,
  unread: t.unread,
});

export const emailTools = [
  defineTool({
    name: "email_search",
    description: "Search synced Gmail threads by keyword (subject, sender, summary, body). Use view='needs_reply' for the reply queue or 'inbox' for current inbox. Returns thread ids for other email tools.",
    schema: z.object({ query: z.string().optional().describe("Keywords; omit to list"), view: z.enum(["inbox", "needs_reply", "all"]).optional(), limit: z.number().int().min(1).max(50).optional() }),
    actionType: "email.search",
    kind: "read",
    summarize: (i) => `Search email${i.query ? ` for "${i.query}"` : ""}`,
    run: async (i) => {
      const rows = i.query ? await mail.searchMail(i.query, i.limit ?? 15) : await mail.listThreads({ view: i.view === "needs_reply" ? "reply" : (i.view ?? "inbox") });
      return { result: rows.slice(0, i.limit ?? 15).map(brief) };
    },
  }),
  defineTool({
    name: "email_read",
    description: "Read a full email thread (all messages, quoted history stripped).",
    schema: z.object({ threadId: z.string() }),
    actionType: "email.read",
    kind: "read",
    summarize: () => "Read email thread",
    run: async (i) => {
      const t = await thread(i.threadId);
      return { result: { ...brief(t), messages: t.messages.map((m) => ({ from: m.isFromMe ? "Grayden (me)" : (m.fromName ?? m.fromEmail), date: formatDateTime(m.date), body: m.bodyText.slice(0, 6000) })) } };
    },
  }),
  defineTool({
    name: "email_summarize",
    description: "Get the triage summary, category, priority, and the latest message of a thread. Cheaper than email_read for quick overviews.",
    schema: z.object({ threadId: z.string() }),
    actionType: "email.summarize",
    kind: "read",
    summarize: () => "Summarize email thread",
    run: async (i) => {
      const t = await thread(i.threadId);
      const last = t.messages.at(-1);
      return { result: { ...brief(t), messageCount: t.messages.length, latest: last ? { from: last.isFromMe ? "me" : (last.fromName ?? last.fromEmail), body: last.bodyText.slice(0, 1500) } : null } };
    },
  }),
  defineTool({
    name: "email_draft_reply",
    description: "Save a draft reply on a thread (does NOT send). Provide `body` to use your own wording, or `instructions` to have it drafted in Grayden's voice. Grayden can review it in the Inbox.",
    schema: z.object({ threadId: z.string(), body: z.string().max(20_000).optional(), instructions: z.string().max(2000).optional() }),
    actionType: "email.draft",
    kind: "write",
    summarize: async (i) => `Draft reply: ${(await thread(i.threadId)).subject}`,
    run: async (i) => {
      const d = i.body ? await mail.saveDraft(i.threadId, i.body) : await mail.generateDraft(i.threadId, i.instructions);
      return { result: { draftId: d.id, body: d.body }, undo: { actionType: "email.discardDraft", payload: { threadId: i.threadId } } };
    },
  }),
  defineTool({
    name: "email_send_reply",
    description: "Send a reply on a thread to the latest sender (other participants are Cc'd). Requires Grayden's approval unless he enabled auto-send for this category. Show him the exact text first when possible.",
    schema: z.object({ threadId: z.string(), body: z.string().min(1).max(20_000) }),
    actionType: "email.send",
    kind: "write",
    approval: async (i) => ({ key: "email.send", emailCategory: (await thread(i.threadId)).category }),
    summarize: async (i) => {
      const t = await thread(i.threadId);
      return `Send reply to ${t.fromName ?? t.fromEmail} re: "${t.subject}":\n\n${i.body}`;
    },
    run: async (i) => {
      const r = await mail.sendReply(i.threadId, i.body);
      return { result: r, summary: `Sent reply to ${r.to.join(", ")}` };
    },
  }),
  defineTool({
    name: "email_archive",
    description: "Archive a thread (remove from inbox). Undoable.",
    schema: z.object({ threadId: z.string() }),
    actionType: "email.archive",
    kind: "write",
    summarize: async (i) => `Archive "${(await thread(i.threadId)).subject}"`,
    run: async (i) => {
      await mail.archiveThread(i.threadId);
      return { result: { archived: true }, undo: { actionType: "email.unarchive", payload: { id: i.threadId } } };
    },
  }),
  defineTool({
    name: "email_label",
    description: "Apply a Gmail label to a thread (creates the label if needed). Undoable.",
    schema: z.object({ threadId: z.string(), label: z.string().min(1).max(100) }),
    actionType: "email.label",
    kind: "write",
    summarize: async (i) => `Label "${(await thread(i.threadId)).subject}" as ${i.label}`,
    run: async (i) => {
      await mail.labelThread(i.threadId, i.label);
      return { result: { labeled: i.label }, undo: { actionType: "email.unlabel", payload: { id: i.threadId, label: i.label } } };
    },
  }),
  defineTool({
    name: "email_trash",
    description: "Move a thread to trash. Always requires approval by default.",
    schema: z.object({ threadId: z.string() }),
    actionType: "email.trash",
    kind: "write",
    approval: () => ({ key: "email.trash" }),
    summarize: async (i) => `Trash "${(await thread(i.threadId)).subject}"`,
    run: async (i) => {
      await mail.trashThread(i.threadId);
      return { result: { trashed: true }, undo: { actionType: "email.untrash", payload: { id: i.threadId } } };
    },
  }),
];
