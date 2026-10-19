import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { executeTool } from "@/lib/assistant/executor";
import { looksLikeSpam, normalizeLeadFields, ruleScore, waitingMinutes } from "@/lib/business/leads";
import { parseLeadgenWebhook, verifyMetaSignature } from "@/lib/integrations/meta";
import { websiteWebhookAuthorized } from "@/lib/leads-intake";
import { mockOutbox } from "@/lib/notify";
import { createManualLead, formatWait, ingestLead, leadsFromEmail, leadWatch, processNewLead, replyToLead } from "@/lib/services/leads";
import { createQuote, setQuoteStatus } from "@/lib/services/quotes";
import { setSetting } from "@/lib/services/settings";
import { GET as metaGET, POST as metaPOST } from "@/app/api/leads/meta/route";
import { POST as webhookPOST } from "@/app/api/leads/webhook/route";
import { resetDb } from "../../setup/db";

const SECRET = "test-lead-webhook-secret-123";
const AREA = ["Chandler", "Gilbert", "Mesa"];

beforeEach(async () => {
  await resetDb();
  mockOutbox().length = 0;
  process.env.LEAD_WEBHOOK_SECRET = SECRET;
  process.env.META_APP_SECRET = "meta-app-secret";
  process.env.META_VERIFY_TOKEN = "meta-verify";
  await setSetting("notifications.quietHours", { start: "23:59", end: "00:00" }); // effectively off
});
afterEach(() => {
  delete process.env.LEAD_WEBHOOK_SECRET;
  delete process.env.META_APP_SECRET;
  delete process.env.META_VERIFY_TOKEN;
});

const post = (body: string, headers: Record<string, string>, qs = "") => webhookPOST(new Request(`http://x/api/leads/webhook${qs}`, { method: "POST", body, headers }));
/** Lets runAfter's inline fallback finish. */
const settle = () => new Promise((r) => setTimeout(r, 50));
async function settled<T>(fn: () => Promise<T | null>, tries = 40): Promise<T> {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await settle();
  }
  throw new Error("timed out");
}

describe("lead helpers", () => {
  it("normalizes common form-builder field names and keeps unknown fields", () => {
    expect(normalizeLeadFields({ "First Name": "Ann", last_name: "Lee", "Phone Number": "480-555-0101", "Your Email": "ANN@EXAMPLE.COM", "Street Address": "1 Main St", City: "Mesa", Zip: "85201", "How can we help?": "Windows + screens", "Number of stories": "2", _gotcha: "" })).toEqual({
      name: "Ann Lee", phone: "480-555-0101", email: "ann@example.com", address: "1 Main St, Mesa, 85201", message: "Windows + screens\n\nNumber of stories: 2",
    });
    expect(normalizeLeadFields({ full_name: "Bo", phone_number: "+14805550147", "how_many_windows?": "25" })).toMatchObject({ name: "Bo", message: "how_many_windows?: 25" });
    expect(normalizeLeadFields({ email: "x@y.co" }).name).toBe("x@y.co");
  });
  it("flags bots and pitches but not real people with websites", () => {
    expect(looksLikeSpam({ _gotcha: "filled" }, normalizeLeadFields({ name: "a", phone: "4805550101" }))).toBe(true);
    expect(looksLikeSpam({}, normalizeLeadFields({ name: "No Contact", message: "hi" }))).toBe(true);
    expect(looksLikeSpam({}, normalizeLeadFields({ name: "Spammy", email: "a@b.co", message: "We offer SEO services and backlinks" }))).toBe(true);
    const shop = { name: "Dental Office", email: "office@dental.example", website: "https://dental.example" };
    expect(looksLikeSpam(shop, normalizeLeadFields(shop))).toBe(false);
  });
  it("scores by rules", () => {
    const hot = ruleScore({ name: "HOA", phone: "4805550101", email: null, address: "Chandler", message: "Our HOA clubhouse needs quarterly cleaning, ASAP, 2 story" }, AREA);
    expect(hot.score).toBe(95);
    expect(hot.reason).toContain("in Chandler");
    const cold = ruleScore({ name: "X", phone: null, email: "x@y.co", address: "Tucson", message: null }, AREA);
    expect(cold.score).toBe(30);
    expect(cold.reason).toMatch(/outside your area/);
  });
  it("tracks waiting time", () => {
    const now = new Date("2026-10-19T19:00:00Z");
    expect(waitingMinutes({ receivedAt: new Date("2026-10-19T18:40:00Z"), firstResponseAt: null, status: "NEW" }, now)).toBe(20);
    expect(waitingMinutes({ receivedAt: new Date("2026-10-19T18:40:00Z"), firstResponseAt: now, status: "CONTACTED" }, now)).toBeNull();
    expect([formatWait(14), formatWait(75), formatWait(60), formatWait(3000)]).toEqual(["14 min", "1 h 15 min", "1 h", "2 days"]);
  });
});

describe("website webhook", () => {
  it("authorizes by HMAC signature, bearer token, or ?key, and rejects everything else", () => {
    const body = '{"name":"a"}';
    const sig = `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
    const u = new URL("http://x/api/leads/webhook");
    expect(websiteWebhookAuthorized(body, new Headers({ "x-lifeos-signature": sig }), u)).toBe(true);
    expect(websiteWebhookAuthorized(body + " ", new Headers({ "x-lifeos-signature": sig }), u)).toBe(false);
    expect(websiteWebhookAuthorized(body, new Headers({ authorization: `Bearer ${SECRET}` }), u)).toBe(true);
    expect(websiteWebhookAuthorized(body, new Headers(), new URL(`http://x/?key=${SECRET}`))).toBe(true);
    expect(websiteWebhookAuthorized(body, new Headers({ authorization: "Bearer nope" }), u)).toBe(false);
    expect(websiteWebhookAuthorized(body, new Headers({ authorization: "Bearer short" }), u, "short")).toBe(false);
  });

  it("creates, scores, alerts, then dedupes, merges, and drops spam", async () => {
    const json = { "content-type": "application/json", authorization: `Bearer ${SECRET}` };
    const r1 = await post(JSON.stringify({ submission_id: "wf-1", name: "Jennifer Alvarez", phone: "(480) 555-0185", email: "jen@example.com", city: "Chandler", message: "Open house next weekend, 2 story, need it this week" }), json, "?form=Contact%20page");
    expect(r1.status).toBe(201);
    const lead = await settled(() => db.lead.findFirst({ where: { alertedAt: { not: null } } }));
    expect(lead).toMatchObject({ source: "WEBSITE", sourceDetail: "Contact page", externalId: "wf-1", scoredBy: "rules", score: expect.any(Number) });
    expect(lead.draftReply).toMatch(/^Hi Jennifer, this is Grayden with Rapid Window Cleaning/);
    expect(mockOutbox().some((m) => m.title === "New lead: Jennifer Alvarez")).toBe(true);

    expect(await (await post(JSON.stringify({ submission_id: "wf-1", name: "Jennifer Alvarez", phone: "4805550185" }), json)).json()).toMatchObject({ status: "duplicate" });
    expect(await (await post(JSON.stringify({ name: "Jen A", phone: "480.555.0185", message: "Also the garage windows" }), json)).json()).toMatchObject({ status: "merged" });
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).message).toContain("Also the garage windows");
    expect(await (await post(JSON.stringify({ name: "Bot", email: "b@b.co", _gotcha: "x" }), json)).json()).toMatchObject({ status: "spam" });
    expect(await db.lead.count()).toBe(1);

    const unauth = await post(JSON.stringify({ name: "x" }), { "content-type": "application/json" });
    expect(unauth.status).toBe(401);
  });

  it("accepts a plain HTML form with ?key and redirects to the thank-you page", async () => {
    const res = await post(new URLSearchParams({ name: "Form Person", phone: "4805550199", message: "Need windows done" }).toString(), { "content-type": "application/x-www-form-urlencoded" }, `?key=${SECRET}&redirect=${encodeURIComponent("https://rapidwindows.example/thanks")}`);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://rapidwindows.example/thanks");
    expect(await db.lead.count()).toBe(1);
  });

  it("links a lead to an existing customer by phone", async () => {
    const c = await db.customer.create({ data: { name: "Priya Patel", phone: "480-555-1037", tags: [] } });
    const r = await ingestLead({ source: "WEBSITE", raw: { name: "Priya", phone: "+1 (480) 555-1037", message: "Time for another cleaning" } });
    expect(r.status === "created" && r.lead.customerId).toBe(c.id);
  });
});

describe("Meta lead ads", () => {
  const sign = (b: string) => `sha256=${createHmac("sha256", "meta-app-secret").update(b).digest("hex")}`;
  it("verifies signatures and parses leadgen changes", () => {
    expect(verifyMetaSignature("{}", sign("{}"))).toBe(true);
    expect(verifyMetaSignature("{}", sign("{ }"))).toBe(false);
    expect(verifyMetaSignature("{}", null)).toBe(false);
    expect(parseLeadgenWebhook({ object: "page", entry: [{ id: "1", changes: [{ field: "leadgen", value: { leadgen_id: 444, form_id: "9", created_time: 1760900000 } }, { field: "feed", value: {} }] }] })).toEqual([{ leadgenId: "444", formId: "9", adId: null, createdAt: new Date(1760900000 * 1000) }]);
    expect(parseLeadgenWebhook({ object: "user", entry: [] })).toEqual([]);
  });
  it("answers the subscription check and ingests a signed webhook", async () => {
    const ok = await metaGET(new Request("http://x/api/leads/meta?hub.mode=subscribe&hub.verify_token=meta-verify&hub.challenge=12345"));
    expect(await ok.text()).toBe("12345");
    expect((await metaGET(new Request("http://x/api/leads/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1"))).status).toBe(403);

    const body = JSON.stringify({ object: "page", entry: [{ id: "1", changes: [{ field: "leadgen", value: { leadgen_id: "lg-777", form_id: "9" } }] }] });
    expect((await metaPOST(new Request("http://x", { method: "POST", body, headers: { "x-hub-signature-256": sign(body + "x") } }))).status).toBe(401);
    const res = await metaPOST(new Request("http://x", { method: "POST", body, headers: { "x-hub-signature-256": sign(body) } }));
    expect(await res.json()).toEqual({ ok: true, received: 1 });
    const lead = await settled(() => db.lead.findFirst({ where: { source: "META", alertedAt: { not: null } } }));
    expect(lead).toMatchObject({ externalId: "lg-777", name: "Ashley Romero", phone: "+14805550147", sourceDetail: "Fall window special" });
    expect(lead.message).toContain("how_many_windows?: about 25, two story");
  });
});

describe("replies, nudges, email leads, quotes", () => {
  it("replying by text marks the lead contacted and stops nudges", async () => {
    const r = await ingestLead({ source: "WEBSITE", raw: { name: "Tom Becker", phone: "4805551222", message: "windows" } });
    if (r.status !== "created") throw new Error(r.status);
    await processNewLead(r.lead.id);
    const sent = await replyToLead(r.lead.id, "SMS", "Hi Tom, happy to help!");
    expect(sent).toMatchObject({ to: "+14805551222", via: "SMS" });
    expect(await db.lead.findUniqueOrThrow({ where: { id: r.lead.id } })).toMatchObject({ status: "CONTACTED", firstResponseAt: expect.any(Date) });
    await expect(replyToLead(r.lead.id, "EMAIL", "x")).rejects.toThrow(/no email/);
  });

  it("nudges at 15 min, 1 h, 4 h, then stops; skipped deliveries retry", async () => {
    const t0 = new Date("2026-10-19T19:00:00Z"); // noon in Phoenix
    const at = (min: number) => new Date(t0.getTime() + min * 60_000);
    const lead = await db.lead.create({ data: { source: "WEBSITE", name: "Waiting Wanda", phone: "4805550111", receivedAt: t0, alertedAt: t0 } });
    const nudges = () => mockOutbox().filter((m) => m.title.startsWith("⏱") && m.channel === "PUSH").length; // one entry per channel
    await leadWatch(at(10));
    expect(nudges()).toBe(0);
    await leadWatch(at(16));
    expect(nudges()).toBe(1);
    expect(mockOutbox().find((m) => m.title.startsWith("⏱"))?.title).toBe("⏱ Waiting Wanda has waited 16 min");
    await leadWatch(at(30));
    expect(nudges()).toBe(1);
    await setSetting("notifications.quietHours", { start: "11:00", end: "13:30" }); // 1 h mark falls in quiet hours
    await leadWatch(at(61));
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).nudgeCount).toBe(1);
    await setSetting("notifications.quietHours", { start: "23:59", end: "00:00" });
    await leadWatch(at(62));
    expect(nudges()).toBe(2);
    await leadWatch(at(241));
    await leadWatch(at(600));
    expect(nudges()).toBe(3);
  });

  it("turns LEAD-category emails into leads once, pulling a phone number from the body", async () => {
    const t = await db.emailThread.create({ data: { gmailThreadId: "g1", subject: "Window cleaning quote?", fromEmail: "linda@example.com", fromName: "Linda Park", lastMessageAt: new Date(), category: "LEAD", inInbox: true } });
    await db.emailMessage.create({ data: { gmailMessageId: "m1", threadId: t.id, fromEmail: "linda@example.com", fromName: "Linda Park", date: new Date(), subject: t.subject, bodyText: "Hi, can you quote our house in Gilbert? Call me at 480-555-1259." } });
    expect(await leadsFromEmail()).toBe(1);
    expect(await leadsFromEmail()).toBe(0);
    expect(await db.lead.findFirstOrThrow()).toMatchObject({ source: "EMAIL", name: "Linda Park", phone: "480-555-1259", email: "linda@example.com", externalId: t.id });
  });

  it("quotes move the lead: quoted → won", async () => {
    const lead = await createManualLead({ name: "Referral Rick", phone: "4805550133", source: "REFERRAL", sourceDetail: "Priya Patel" });
    expect(lead.status).toBe("NEW");
    const q = await createQuote({ leadId: lead.id, name: lead.name, phone: lead.phone, inputs: { panes: 30 } });
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("QUOTED");
    await setQuoteStatus(q.id, "ACCEPTED");
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("WON");
    const call = await createManualLead({ name: "Caller Carl", phone: "4805550144" });
    expect(call).toMatchObject({ status: "CONTACTED", firstResponseAt: expect.any(Date) });
  });

  it("the assistant's lead_reply waits for approval", async () => {
    const lead = await db.lead.create({ data: { source: "META", name: "Ashley", phone: "4805550147" } });
    const r = await executeTool("lead_reply", { leadId: lead.id, via: "SMS", body: "Hi Ashley!" }, { actor: "ASSISTANT" });
    expect(r.status).toBe("pending_approval");
    expect(await db.pendingApproval.findFirstOrThrow()).toMatchObject({ risk: "lead.reply", summary: 'Text 4805550147 (Ashley): “Hi Ashley!”' });
    expect(mockOutbox()).toHaveLength(0);
  });
});
