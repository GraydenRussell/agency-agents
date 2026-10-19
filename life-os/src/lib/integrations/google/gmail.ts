import "server-only";
import { z } from "zod";
import { isMock } from "../mode";
import { GoogleApiError, googleFetch } from "./oauth";

export type Address = { name: string | null; email: string };
export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds: string[];
  from: Address;
  to: Address[];
  cc: Address[];
  subject: string;
  date: Date;
  text: string;
  messageIdHeader: string | null;
  references: string | null;
  snippet: string;
};
export type GmailThread = { id: string; historyId: string; messages: GmailMessage[] };
export type GmailLabel = { id: string; name: string; type: "system" | "user" };

export class HistoryExpiredError extends Error {
  constructor() {
    super("Gmail history is too old; full resync required");
    this.name = "HistoryExpiredError";
  }
}

export interface GmailProvider {
  profile(): Promise<{ email: string; historyId: string }>;
  listThreadIds(q: string, max: number): Promise<string[]>;
  getThread(id: string): Promise<GmailThread | null>;
  /** Thread ids changed since `historyId`, plus the latest historyId. */
  history(startHistoryId: string): Promise<{ threadIds: string[]; historyId: string }>;
  modifyThread(id: string, add: string[], remove: string[]): Promise<void>;
  trashThread(id: string): Promise<void>;
  untrashThread(id: string): Promise<void>;
  send(raw: string, threadId?: string): Promise<{ id: string; threadId: string }>;
  listLabels(): Promise<GmailLabel[]>;
  createLabel(name: string): Promise<GmailLabel>;
}

// ─────────────────────────── MIME helpers (pure) ───────────────────────────

export function parseAddress(raw: string): Address {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  if (m) return { name: m[1]?.trim() || null, email: (m[2] ?? "").trim().toLowerCase() };
  return { name: null, email: raw.trim().toLowerCase() };
}

/** Splits an address list on commas that aren't inside quotes. */
export function parseAddressList(raw: string | undefined): Address[] {
  if (!raw) return [];
  const parts: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of raw) {
    if (ch === '"') quoted = !quoted;
    if (ch === "," && !quoted) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map(parseAddress).filter((a) => a.email.includes("@"));
}

const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Removes quoted reply history ("On … wrote:" and ">" lines) to keep prompts small. */
export function stripQuoted(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .{5,200} wrote:\s*$/.test(line.trim()) || /^-{2,}\s*Original Message/i.test(line.trim())) break;
    if (line.trim().startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

const partSchema: z.ZodType<ApiPart> = z.lazy(() =>
  z.object({
    mimeType: z.string().optional(),
    body: z.object({ data: z.string().optional(), size: z.number().optional() }).optional(),
    parts: z.array(partSchema).optional(),
    headers: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
  }),
);
type ApiPart = { mimeType?: string; body?: { data?: string; size?: number }; parts?: ApiPart[]; headers?: Array<{ name: string; value: string }> };

const messageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  labelIds: z.array(z.string()).default([]),
  snippet: z.string().default(""),
  internalDate: z.string().optional(),
  payload: partSchema.optional(),
});
type ApiMessage = z.infer<typeof messageSchema>;

function findPart(p: ApiPart | undefined, mime: string): string | null {
  if (!p) return null;
  if (p.mimeType === mime && p.body?.data) return b64url(p.body.data);
  for (const c of p.parts ?? []) {
    const r = findPart(c, mime);
    if (r) return r;
  }
  return null;
}

export function parseApiMessage(m: ApiMessage): GmailMessage {
  const headers = new Map((m.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
  const plain = findPart(m.payload, "text/plain");
  const html = plain ? null : findPart(m.payload, "text/html");
  const text = plain ?? (html ? htmlToText(html) : m.snippet);
  const dateHeader = headers.get("date");
  const date = m.internalDate ? new Date(Number(m.internalDate)) : dateHeader ? new Date(dateHeader) : new Date();
  return {
    id: m.id,
    threadId: m.threadId,
    labelIds: m.labelIds,
    from: parseAddress(headers.get("from") ?? "unknown@unknown"),
    to: parseAddressList(headers.get("to")),
    cc: parseAddressList(headers.get("cc")),
    subject: headers.get("subject") ?? "(no subject)",
    date,
    text: text.slice(0, 50_000),
    messageIdHeader: headers.get("message-id") ?? null,
    references: headers.get("references") ?? null,
    snippet: m.snippet,
  };
}

function encodeHeader(v: string): string {
  // RFC 2047 for non-ASCII subjects/names.
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

const fmt = (a: Address) => (a.name ? `${encodeHeader(a.name)} <${a.email}>` : a.email);

/** Builds a base64url RFC 2822 message (plain text) that threads correctly in Gmail. */
export type MimeAttachment = { filename: string; contentType: string; data: Uint8Array };

export function buildMime(opts: { from?: string; to: Address[]; cc?: Address[]; subject: string; body: string; inReplyTo?: string | null; references?: string | null; attachments?: MimeAttachment[] }): string {
  const b64 = (buf: Buffer) => buf.toString("base64").replace(/(.{76})/g, "$1\r\n");
  const headers = [
    ...(opts.from ? [`From: ${opts.from}`] : []),
    `To: ${opts.to.map(fmt).join(", ")}`,
    ...(opts.cc?.length ? [`Cc: ${opts.cc.map(fmt).join(", ")}`] : []),
    `Subject: ${encodeHeader(opts.subject)}`,
    "MIME-Version: 1.0",
    ...(opts.inReplyTo ? [`In-Reply-To: ${opts.inReplyTo}`, `References: ${[opts.references, opts.inReplyTo].filter(Boolean).join(" ")}`] : []),
  ];
  const text = b64(Buffer.from(opts.body, "utf8"));
  if (!opts.attachments?.length) {
    const h = [...headers, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64"];
    return Buffer.from(`${h.join("\r\n")}\r\n\r\n${text}`, "utf8").toString("base64url");
  }
  const boundary = `lifeos_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const safeName = (n: string) => n.replace(/["\\\r\n]/g, "_");
  const parts = [
    `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${text}`,
    ...opts.attachments.map((a) => `--${boundary}\r\nContent-Type: ${a.contentType}; name="${safeName(a.filename)}"\r\nContent-Disposition: attachment; filename="${safeName(a.filename)}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(Buffer.from(a.data))}`),
  ];
  const h = [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`];
  return Buffer.from(`${h.join("\r\n")}\r\n\r\n${parts.join("\r\n")}\r\n--${boundary}--`, "utf8").toString("base64url");
}

export function replySubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;
}

// ─────────────────────────── Live (REST v1) ───────────────────────────

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

async function ok(res: Response) {
  if (res.ok) return res;
  const text = await res.text().catch(() => "");
  throw new GoogleApiError(`Gmail ${res.status}: ${text.slice(0, 300)}`, res.status);
}

const liveProvider: GmailProvider = {
  async profile() {
    const r = z.object({ emailAddress: z.string(), historyId: z.string() }).parse(await (await ok(await googleFetch(`${BASE}/profile`))).json());
    return { email: r.emailAddress, historyId: r.historyId };
  },
  async listThreadIds(q, max) {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ q, maxResults: String(Math.min(100, max - ids.length)) });
      if (pageToken) params.set("pageToken", pageToken);
      const data = z.object({ threads: z.array(z.object({ id: z.string() })).default([]), nextPageToken: z.string().optional() }).parse(await (await ok(await googleFetch(`${BASE}/threads?${params}`))).json());
      ids.push(...data.threads.map((t) => t.id));
      pageToken = data.nextPageToken;
    } while (pageToken && ids.length < max);
    return ids;
  },
  async getThread(id) {
    const res = await googleFetch(`${BASE}/threads/${id}?format=full`);
    if (res.status === 404) return null;
    const data = z.object({ id: z.string(), historyId: z.string(), messages: z.array(messageSchema).default([]) }).parse(await (await ok(res)).json());
    return { id: data.id, historyId: data.historyId, messages: data.messages.map(parseApiMessage) };
  },
  async history(startHistoryId) {
    const threadIds = new Set<string>();
    let pageToken: string | undefined;
    let historyId = startHistoryId;
    do {
      const params = new URLSearchParams({ startHistoryId, maxResults: "500" });
      for (const t of ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"]) params.append("historyTypes", t);
      if (pageToken) params.set("pageToken", pageToken);
      const res = await googleFetch(`${BASE}/history?${params}`);
      if (res.status === 404) throw new HistoryExpiredError();
      const data = z
        .object({ history: z.array(z.object({ messages: z.array(z.object({ threadId: z.string() })).default([]) })).default([]), historyId: z.string(), nextPageToken: z.string().optional() })
        .parse(await (await ok(res)).json());
      for (const h of data.history) for (const m of h.messages) threadIds.add(m.threadId);
      historyId = data.historyId;
      pageToken = data.nextPageToken;
    } while (pageToken);
    return { threadIds: [...threadIds], historyId };
  },
  async modifyThread(id, add, remove) {
    await ok(await googleFetch(`${BASE}/threads/${id}/modify`, { method: "POST", json: { addLabelIds: add, removeLabelIds: remove } }));
  },
  async trashThread(id) {
    await ok(await googleFetch(`${BASE}/threads/${id}/trash`, { method: "POST" }));
  },
  async untrashThread(id) {
    await ok(await googleFetch(`${BASE}/threads/${id}/untrash`, { method: "POST" }));
  },
  async send(raw, threadId) {
    const r = z.object({ id: z.string(), threadId: z.string() }).parse(await (await ok(await googleFetch(`${BASE}/messages/send`, { method: "POST", json: { raw, threadId } }))).json());
    return r;
  },
  async listLabels() {
    const r = z.object({ labels: z.array(z.object({ id: z.string(), name: z.string(), type: z.enum(["system", "user"]).default("user") })).default([]) }).parse(await (await ok(await googleFetch(`${BASE}/labels`))).json());
    return r.labels;
  },
  async createLabel(name) {
    const r = z.object({ id: z.string(), name: z.string() }).parse(await (await ok(await googleFetch(`${BASE}/labels`, { method: "POST", json: { name, labelListVisibility: "labelShow", messageListVisibility: "show" } }))).json());
    return { ...r, type: "user" };
  },
};

// ─────────────────────────── Mock ───────────────────────────

type MockState = { historyId: number; threads: Map<string, GmailThread & { changedAt: number }>; labels: GmailLabel[]; sent: Array<{ raw: string; threadId?: string }> };
const g = globalThis as unknown as { __mockGmail?: MockState };

const ME: Address = { name: "Grayden Russell", email: "grayden@sample.test" };

function fixtureThreads(now = Date.now()): GmailThread[] {
  const h = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000);
  let n = 0;
  const thread = (subject: string, from: Address, body: string, hoursAgo: number, labels: string[] = ["INBOX", "UNREAD"], extra: Array<{ from: Address; body: string; hoursAgo: number }> = []): GmailThread => {
    const id = `t${++n}`;
    const msgs = [{ from, body, hoursAgo }, ...extra].map((m, i) => ({
      id: `${id}m${i}`,
      threadId: id,
      labelIds: i === 0 ? labels : labels.filter((l) => l !== "UNREAD"),
      from: m.from,
      to: [m.from.email === ME.email ? from : ME],
      cc: [],
      subject: i === 0 ? subject : replySubject(subject),
      date: h(m.hoursAgo),
      text: m.body,
      messageIdHeader: `<${id}m${i}@mail.sample>`,
      references: null,
      snippet: m.body.slice(0, 120),
    }));
    return { id, historyId: "1", messages: msgs };
  };
  return [
    thread("Quote request - 2 story home in Ocotillo", { name: "Jennifer Alvarez", email: "jen.alvarez@example.com" }, "Hi! We just moved into a 2-story home near Ocotillo and the windows are a mess from the dust storm. Could you give me a quote for inside + outside, plus screens? We'd love to get it done before Thanksgiving. Thanks, Jen", 2),
    thread("Re: Quarterly contract for Mesa Verde HOA", { name: "Linda Park", email: "linda@mesaverdehoa.org" }, "Grayden, the board reviewed your proposal and is inclined to approve the quarterly plan. Can you confirm the price includes the clubhouse skylights? We vote Tuesday.", 5, ["INBOX", "UNREAD", "IMPORTANT"]),
    thread("Invoice #4471 - Desert Pure Water Supply", { name: "Marcus Reyes", email: "marcus@desertpure.example" }, "Attached is invoice #4471 for 6 resin cartridges and 2 DI tanks, total $612.40, due Nov 1. Let me know if you want to set up auto-ship.", 20, ["INBOX"]),
    thread("New lead from Google Business Profile", { name: "Google Business Profile", email: "noreply-gbp@google.example" }, "You have a new message from Tom Becker: 'Do you clean solar panels? I have 24 panels on a single story in Gilbert.' Reply within 24 hours to keep your response badge.", 3),
    thread("Your Housecall Pro weekly summary", { name: "Housecall Pro", email: "noreply@housecallpro.example" }, "This week: 23 jobs completed, $8,940 invoiced, 4 new online bookings. Top service: Exterior window cleaning.", 30, ["INBOX", "CATEGORY_UPDATES"]),
    thread("10 ways to grow your service business 🚀", { name: "Jobber Blog", email: "newsletter@jobber.example" }, "This week on the blog: pricing strategies, seasonal promos, and how to get more 5-star reviews...", 40, ["INBOX", "CATEGORY_PROMOTIONS"]),
    thread("Dinner Sunday?", { name: "Mom", email: "mom@example.com" }, "Are you and the crew coming Sunday? Dad is making ribs. Let me know by Friday!", 8),
    thread("URGENT: verify your account to avoid suspension", { name: "Account Security", email: "security@paypa1-alerts.example" }, "Your account will be suspended in 24 hours. Click here to verify your identity immediately.", 12, ["INBOX", "UNREAD", "CATEGORY_PROMOTIONS"]),
    thread("Re: Saturday storefront job - access time", { name: "Rick Ortega", email: "rick.ortega@cfcmall.example" }, "Confirmed for Saturday. Security will let you in at 6:30 AM at the north service entrance. Please have the crew sign in.", 1, ["INBOX", "UNREAD"], [{ from: ME, body: "Hi Rick, can you confirm the access time for Saturday? Thanks, Grayden", hoursAgo: 26 }]),
    thread("Review: ⭐⭐⭐⭐⭐ from Sarah K.", { name: "Google Business Profile", email: "noreply-gbp@google.example" }, "Sarah K. left a 5-star review: 'Rapid Window Cleaning did an amazing job, super professional and on time!' Reply to thank them.", 50, ["INBOX"]),
  ].map((t) => {
    // Order messages oldest→newest (fixtures list the newest first for readability).
    const messages = [...t.messages].sort((a, b) => a.date.getTime() - b.date.getTime());
    return { ...t, messages };
  });
}

function mockState(): MockState {
  if (!g.__mockGmail) {
    g.__mockGmail = { historyId: 1, threads: new Map(fixtureThreads().map((t) => [t.id, { ...t, changedAt: 1 }])), labels: [{ id: "INBOX", name: "INBOX", type: "system" }, { id: "UNREAD", name: "UNREAD", type: "system" }, { id: "IMPORTANT", name: "IMPORTANT", type: "system" }, { id: "TRASH", name: "TRASH", type: "system" }], sent: [] };
  }
  return g.__mockGmail;
}

/** Tests only. */
export function resetMockGmail() {
  g.__mockGmail = undefined;
}
/** Tests only: what the mock "sent". */
export function mockSentMessages() {
  return mockState().sent;
}
/** Tests/demo: simulate a new inbound email arriving. */
export function mockReceive(subject: string, from: Address, body: string): string {
  const s = mockState();
  s.historyId++;
  const id = `t-new-${s.historyId}`;
  s.threads.set(id, { id, historyId: String(s.historyId), changedAt: s.historyId, messages: [{ id: `${id}m0`, threadId: id, labelIds: ["INBOX", "UNREAD"], from, to: [ME], cc: [], subject, date: new Date(), text: body, messageIdHeader: `<${id}@mail.sample>`, references: null, snippet: body.slice(0, 120) }] });
  return id;
}

function touch(s: MockState, t: GmailThread & { changedAt: number }) {
  s.historyId++;
  t.changedAt = s.historyId;
  t.historyId = String(s.historyId);
}

const mockProvider: GmailProvider = {
  async profile() {
    return { email: ME.email, historyId: String(mockState().historyId) };
  },
  async listThreadIds(q, max) {
    const s = mockState();
    const inboxOnly = q.includes("in:inbox");
    return [...s.threads.values()]
      .filter((t) => !inboxOnly || t.messages.some((m) => m.labelIds.includes("INBOX")))
      .sort((a, b) => (b.messages.at(-1)?.date.getTime() ?? 0) - (a.messages.at(-1)?.date.getTime() ?? 0))
      .slice(0, max)
      .map((t) => t.id);
  },
  async getThread(id) {
    const t = mockState().threads.get(id);
    if (!t) return null;
    const { changedAt: _c, ...rest } = t;
    return structuredClone(rest);
  },
  async history(start) {
    const s = mockState();
    const since = Number(start);
    if (Number.isNaN(since)) throw new HistoryExpiredError();
    return { threadIds: [...s.threads.values()].filter((t) => t.changedAt > since).map((t) => t.id), historyId: String(s.historyId) };
  },
  async modifyThread(id, add, remove) {
    const s = mockState();
    const t = s.threads.get(id);
    if (!t) throw new GoogleApiError("Not found", 404);
    for (const m of t.messages) m.labelIds = [...new Set([...m.labelIds.filter((l) => !remove.includes(l)), ...add])];
    touch(s, t);
  },
  async trashThread(id) {
    await mockProvider.modifyThread(id, ["TRASH"], ["INBOX"]);
  },
  async untrashThread(id) {
    await mockProvider.modifyThread(id, ["INBOX"], ["TRASH"]);
  },
  async send(raw, threadId) {
    const s = mockState();
    s.sent.push({ raw, threadId });
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const [head = "", bodyB64 = ""] = decoded.split("\r\n\r\n");
    const body = Buffer.from(bodyB64.replace(/\r\n/g, ""), "base64").toString("utf8");
    const subject = /^Subject: (.*)$/m.exec(head)?.[1] ?? "(no subject)";
    const to = parseAddressList(/^To: (.*)$/m.exec(head)?.[1]);
    const id = threadId ?? `t-sent-${s.historyId + 1}`;
    const t = s.threads.get(id) ?? { id, historyId: "0", changedAt: 0, messages: [] };
    const mid = `${id}m${t.messages.length}`;
    t.messages.push({ id: mid, threadId: id, labelIds: ["SENT"], from: ME, to, cc: [], subject, date: new Date(), text: body, messageIdHeader: `<${mid}@mail.sample>`, references: null, snippet: body.slice(0, 120) });
    s.threads.set(id, t);
    touch(s, t);
    return { id: mid, threadId: id };
  },
  async listLabels() {
    return mockState().labels;
  },
  async createLabel(name) {
    const s = mockState();
    const l: GmailLabel = { id: `Label_${s.labels.length + 1}`, name, type: "user" };
    s.labels.push(l);
    return l;
  },
};

export function gmailProvider(): GmailProvider {
  return isMock() ? mockProvider : liveProvider;
}
