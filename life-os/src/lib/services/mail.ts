import "server-only";
import { db } from "@/lib/db";
import type { EmailCategory, Prisma } from "@/generated/prisma/client";
import { draftReply } from "@/lib/ai/draft";
import { triageBatch, type TriageResult } from "@/lib/ai/triage";
import { buildMime, gmailProvider, HistoryExpiredError, replySubject, stripQuoted, type Address, type GmailThread } from "@/lib/integrations/google/gmail";
import { isMock } from "@/lib/integrations/mode";
import { isGoogleConnected } from "./calendar";

// ───────────────────────────── Sync ─────────────────────────────

async function googleAccountRow(email: string) {
  const existing = await db.integrationAccount.findFirst({ where: { provider: "GOOGLE" } });
  if (existing) return existing;
  // Mock mode has no OAuth step; create the row so the sync cursor has a home.
  if (!isMock()) throw new Error("Google is not connected");
  return db.integrationAccount.create({ data: { provider: "GOOGLE", accountEmail: email, status: "CONNECTED", scopes: ["mock"] } });
}

export async function myEmail(): Promise<string> {
  const a = await db.integrationAccount.findFirst({ where: { provider: "GOOGLE" } });
  return (a?.accountEmail ?? "").toLowerCase();
}

export async function upsertThread(gt: GmailThread, me: string) {
  if (gt.messages.length === 0) return null;
  const msgs = [...gt.messages].sort((a, b) => a.date.getTime() - b.date.getTime());
  const latest = msgs[msgs.length - 1];
  if (!latest) return null;
  const latestInbound = [...msgs].reverse().find((m) => m.from.email !== me) ?? latest;
  const labels = [...new Set(msgs.flatMap((m) => m.labelIds))];
  const existing = await db.emailThread.findUnique({ where: { gmailThreadId: gt.id } });
  const changed = !existing || existing.lastMessageAt.getTime() !== latest.date.getTime();
  const lastFromMe = latest.from.email === me;
  const data = {
    subject: msgs[0]?.subject ?? latest.subject,
    fromName: latestInbound.from.name,
    fromEmail: latestInbound.from.email,
    snippet: latest.snippet || latest.text.slice(0, 160),
    lastMessageAt: latest.date,
    labels,
    unread: msgs.some((m) => m.labelIds.includes("UNREAD")),
    inInbox: msgs.some((m) => m.labelIds.includes("INBOX")) && !labels.includes("TRASH"),
    historyId: gt.historyId,
    // A new message re-opens triage; a reply from me closes the needs-reply flag.
    ...(changed ? { triagedAt: null, notifiedAt: null } : {}),
    ...(lastFromMe ? { needsReply: false } : {}),
  };
  const thread = existing ? await db.emailThread.update({ where: { id: existing.id }, data }) : await db.emailThread.create({ data: { gmailThreadId: gt.id, ...data } });
  for (const m of msgs) {
    await db.emailMessage.upsert({
      where: { gmailMessageId: m.id },
      create: { gmailMessageId: m.id, threadId: thread.id, fromName: m.from.name, fromEmail: m.from.email, to: m.to.map((a) => a.email), cc: m.cc.map((a) => a.email), date: m.date, subject: m.subject, bodyText: m.text, messageIdHeader: m.messageIdHeader, isFromMe: m.from.email === me },
      update: {},
    });
  }
  return thread;
}

export async function syncInbox(opts: { maxThreads?: number } = {}) {
  if (!(await isGoogleConnected())) return { skipped: "Google not connected" as const };
  const provider = gmailProvider();
  const profile = await provider.profile();
  const account = await googleAccountRow(profile.email);
  const me = profile.email.toLowerCase();
  if (!account.accountEmail || account.accountEmail === "unknown") await db.integrationAccount.update({ where: { id: account.id }, data: { accountEmail: profile.email } });

  let threadIds: string[];
  let cursor = profile.historyId;
  let full = !account.syncCursor;
  if (account.syncCursor) {
    try {
      const h = await provider.history(account.syncCursor);
      threadIds = h.threadIds;
      cursor = h.historyId;
    } catch (e) {
      if (!(e instanceof HistoryExpiredError)) throw e;
      full = true;
      threadIds = await provider.listThreadIds("in:inbox newer_than:30d", opts.maxThreads ?? 100);
    }
  } else {
    threadIds = await provider.listThreadIds("in:inbox newer_than:30d", opts.maxThreads ?? 100);
  }

  let updated = 0;
  for (const id of threadIds) {
    const gt = await provider.getThread(id);
    if (!gt) {
      await db.emailThread.updateMany({ where: { gmailThreadId: id }, data: { inInbox: false } });
      continue;
    }
    if (await upsertThread(gt, me)) updated++;
  }
  await db.integrationAccount.update({ where: { id: account.id }, data: { syncCursor: cursor, lastSyncAt: new Date() } });
  return { full, updated };
}

/** Triage threads that are new or have new messages. Returns the results (for notifications). */
export async function triagePending(limit = 30): Promise<Array<TriageResult & { subject: string; from: string }>> {
  const pending = await db.emailThread.findMany({
    where: { inInbox: true, triagedAt: null },
    include: { messages: { orderBy: { date: "asc" } } },
    orderBy: { lastMessageAt: "desc" },
    take: limit,
  });
  if (pending.length === 0) return [];
  const results: TriageResult[] = [];
  for (let i = 0; i < pending.length; i += 15) {
    const batch = pending.slice(i, i + 15);
    results.push(
      ...(await triageBatch(
        batch.map((t) => {
          const lastIn = [...t.messages].reverse().find((m) => !m.isFromMe);
          return { id: t.id, subject: t.subject, fromName: t.fromName, fromEmail: t.fromEmail, labels: t.labels, body: stripQuoted(lastIn?.bodyText ?? t.snippet ?? ""), lastFromMe: t.messages.at(-1)?.isFromMe ?? false };
        }),
      )),
    );
  }
  for (const r of results) {
    await db.emailThread.update({ where: { id: r.id }, data: { category: r.category, priority: r.priority, summary: r.summary, needsReply: r.needsReply, triagedAt: new Date() } });
  }
  const byId = new Map(pending.map((t) => [t.id, t]));
  return results.map((r) => ({ ...r, subject: byId.get(r.id)?.subject ?? "", from: byId.get(r.id)?.fromName ?? byId.get(r.id)?.fromEmail ?? "" }));
}

export async function syncAndTriage() {
  const sync = await syncInbox();
  if ("skipped" in sync) return { sync, triaged: [] };
  await unsnoozeDue();
  const triaged = await triagePending();
  return { sync, triaged };
}

export async function syncInboxIfStale(maxAgeMs = 5 * 60_000) {
  const a = await db.integrationAccount.findFirst({ where: { provider: "GOOGLE" } });
  if (a?.lastSyncAt && Date.now() - a.lastSyncAt.getTime() < maxAgeMs) return null;
  try {
    return await syncAndTriage();
  } catch (e) {
    console.error("[mail.syncIfStale]", e);
    return null;
  }
}

// ───────────────────────────── Queries ─────────────────────────────

export type InboxFilter = { view?: "inbox" | "reply" | "all"; category?: EmailCategory; q?: string };

export async function listThreads(f: InboxFilter = {}) {
  const now = new Date();
  const where: Prisma.EmailThreadWhereInput = {};
  if (f.view !== "all") where.inInbox = true;
  if (f.view === "reply") where.needsReply = true;
  if (f.category) where.category = f.category;
  if (f.view !== "all") where.OR = [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }];
  if (f.q?.trim()) {
    const contains = { contains: f.q.trim(), mode: "insensitive" as const };
    where.AND = [{ OR: [{ subject: contains }, { fromEmail: contains }, { fromName: contains }, { snippet: contains }, { summary: contains }] }];
  }
  return db.emailThread.findMany({
    where,
    orderBy: f.view === "reply" ? [{ priority: { sort: "desc", nulls: "last" } }, { lastMessageAt: "desc" }] : [{ lastMessageAt: "desc" }],
    take: 200,
    include: { drafts: { where: { status: "DRAFT" }, take: 1, orderBy: { createdAt: "desc" } } },
  });
}

export async function getThread(id: string) {
  return db.emailThread.findUnique({ where: { id }, include: { messages: { orderBy: { date: "asc" } }, drafts: { where: { status: "DRAFT" }, orderBy: { createdAt: "desc" }, take: 1 } } });
}

/** Local search across synced mail (subject, sender, summary, and bodies). */
export async function searchMail(q: string, limit = 20) {
  const contains = { contains: q, mode: "insensitive" as const };
  return db.emailThread.findMany({
    where: { OR: [{ subject: contains }, { fromEmail: contains }, { fromName: contains }, { summary: contains }, { messages: { some: { bodyText: contains } } }] },
    orderBy: { lastMessageAt: "desc" },
    take: limit,
  });
}

// ───────────────────────────── Actions ─────────────────────────────

async function threadOrThrow(id: string) {
  const t = await db.emailThread.findUnique({ where: { id } });
  if (!t) throw new Error("Email thread not found");
  return t;
}

export async function archiveThread(id: string) {
  const t = await threadOrThrow(id);
  await gmailProvider().modifyThread(t.gmailThreadId, [], ["INBOX"]);
  return db.emailThread.update({ where: { id }, data: { inInbox: false, labels: t.labels.filter((l) => l !== "INBOX") } });
}

export async function unarchiveThread(id: string) {
  const t = await threadOrThrow(id);
  await gmailProvider().modifyThread(t.gmailThreadId, ["INBOX"], []);
  return db.emailThread.update({ where: { id }, data: { inInbox: true, snoozedUntil: null, labels: [...new Set([...t.labels, "INBOX"])] } });
}

export async function markRead(id: string, read = true) {
  const t = await threadOrThrow(id);
  if (t.unread === !read) return t;
  await gmailProvider().modifyThread(t.gmailThreadId, read ? [] : ["UNREAD"], read ? ["UNREAD"] : []);
  return db.emailThread.update({ where: { id }, data: { unread: !read } });
}

export async function labelThread(id: string, name: string, remove = false) {
  const t = await threadOrThrow(id);
  const provider = gmailProvider();
  const labels = await provider.listLabels();
  let label = labels.find((l) => l.name.toLowerCase() === name.trim().toLowerCase());
  if (!label) {
    if (remove) return t;
    label = await provider.createLabel(name.trim());
  }
  await provider.modifyThread(t.gmailThreadId, remove ? [] : [label.id], remove ? [label.id] : []);
  const next = remove ? t.labels.filter((l) => l !== label.id) : [...new Set([...t.labels, label.id])];
  return db.emailThread.update({ where: { id }, data: { labels: next } });
}

/** Gmail has no snooze API: we archive now and move it back to the inbox when due. */
export async function snoozeThread(id: string, until: Date) {
  if (until <= new Date()) throw new Error("Snooze time must be in the future");
  await archiveThread(id);
  return db.emailThread.update({ where: { id }, data: { snoozedUntil: until } });
}

export async function unsnoozeDue(now: Date = new Date()) {
  const due = await db.emailThread.findMany({ where: { snoozedUntil: { lte: now } } });
  for (const t of due) await unarchiveThread(t.id);
  return due.length;
}

export async function trashThread(id: string) {
  const t = await threadOrThrow(id);
  await gmailProvider().trashThread(t.gmailThreadId);
  return db.emailThread.update({ where: { id }, data: { inInbox: false, labels: [...t.labels.filter((l) => l !== "INBOX"), "TRASH"] } });
}

export async function untrashThread(id: string) {
  const t = await threadOrThrow(id);
  await gmailProvider().untrashThread(t.gmailThreadId);
  return db.emailThread.update({ where: { id }, data: { inInbox: true, labels: [...t.labels.filter((l) => l !== "TRASH"), "INBOX"] } });
}

export async function generateDraft(threadId: string, instructions?: string) {
  const t = await db.emailThread.findUnique({ where: { id: threadId }, include: { messages: { orderBy: { date: "asc" } } } });
  if (!t) throw new Error("Email thread not found");
  const { body, model } = await draftReply({
    subject: t.subject,
    instructions,
    messages: t.messages.map((m) => ({ fromName: m.fromName, fromEmail: m.fromEmail, isFromMe: m.isFromMe, date: m.date, body: stripQuoted(m.bodyText) })),
  });
  await db.emailDraft.updateMany({ where: { threadId, status: "DRAFT" }, data: { status: "DISCARDED" } });
  return db.emailDraft.create({ data: { threadId, body, model } });
}

export async function saveDraft(threadId: string, body: string) {
  const existing = await db.emailDraft.findFirst({ where: { threadId, status: "DRAFT" }, orderBy: { createdAt: "desc" } });
  if (existing) return db.emailDraft.update({ where: { id: existing.id }, data: { body } });
  return db.emailDraft.create({ data: { threadId, body } });
}

export async function discardDraft(threadId: string) {
  await db.emailDraft.updateMany({ where: { threadId, status: "DRAFT" }, data: { status: "DISCARDED" } });
}

/** Recipients for a reply: the latest inbound sender, plus other participants as Cc (never me). */
export function replyRecipients(messages: Array<{ fromName: string | null; fromEmail: string; to: string[]; cc: string[]; isFromMe: boolean }>, me: string): { to: Address[]; cc: Address[] } {
  const lastIn = [...messages].reverse().find((m) => !m.isFromMe) ?? messages[messages.length - 1];
  if (!lastIn) return { to: [], cc: [] };
  const to: Address[] = lastIn.isFromMe ? lastIn.to.map((e) => ({ name: null, email: e })) : [{ name: lastIn.fromName, email: lastIn.fromEmail }];
  const toSet = new Set(to.map((a) => a.email));
  const cc = [...new Set([...lastIn.to, ...lastIn.cc])].filter((e) => e !== me && !toSet.has(e)).map((email) => ({ name: null, email }));
  return { to, cc };
}

export async function sendReply(threadId: string, body: string) {
  if (!body.trim()) throw new Error("Reply is empty");
  const t = await db.emailThread.findUnique({ where: { id: threadId }, include: { messages: { orderBy: { date: "asc" } } } });
  if (!t) throw new Error("Email thread not found");
  const me = await myEmail();
  const { to, cc } = replyRecipients(t.messages, me);
  if (to.length === 0) throw new Error("No recipient for this reply");
  const last = t.messages[t.messages.length - 1];
  const raw = buildMime({ to, cc, subject: replySubject(t.subject), body, inReplyTo: last?.messageIdHeader, references: null });
  const sent = await gmailProvider().send(raw, t.gmailThreadId);
  await db.emailDraft.updateMany({ where: { threadId, status: "DRAFT" }, data: { status: "SENT", sentAt: new Date(), body } });
  await db.emailThread.update({ where: { id: threadId }, data: { needsReply: false, unread: false } });
  const gt = await gmailProvider().getThread(t.gmailThreadId);
  if (gt) await upsertThread(gt, me);
  return { messageId: sent.id, to: to.map((a) => a.email), cc: cc.map((a) => a.email) };
}

export async function inboxCounts() {
  const [unread, needsReply, byCategory] = await Promise.all([
    db.emailThread.count({ where: { inInbox: true, unread: true } }),
    db.emailThread.count({ where: { inInbox: true, needsReply: true } }),
    db.emailThread.groupBy({ by: ["category"], where: { inInbox: true }, _count: { _all: true } }),
  ]);
  return { unread, needsReply, byCategory: Object.fromEntries(byCategory.map((c) => [c.category ?? "UNTRIAGED", c._count._all])) as Record<string, number> };
}
