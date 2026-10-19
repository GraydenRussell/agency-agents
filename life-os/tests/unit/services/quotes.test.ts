import { beforeEach, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { db } from "@/lib/db";
import { approve, executeTool, undoActivity, type ExecResult } from "@/lib/assistant/executor";
import { DEFAULT_PRICING, priceQuote } from "@/lib/business/pricing";
import { pdfSafe, renderQuotePdf } from "@/lib/business/quote-pdf";
import { buildMime } from "@/lib/integrations/google/gmail";
import { mockOutbox } from "@/lib/notify";
import { toE164 } from "@/lib/notify/customer";
import { createQuote, getQuote, isExpired, quoteStats, quoteToken, quoteUrl, sendQuote, setQuoteStatus, updateQuote, verifyQuoteToken } from "@/lib/services/quotes";
import { setSetting } from "@/lib/services/settings";
import { addDays, today } from "@/lib/time";
import { GET as publicQuote } from "@/app/q/[token]/route";
import { resetDb } from "../../setup/db";

beforeEach(async () => {
  await resetDb();
  mockOutbox().length = 0;
});

const tom = { name: "Tom Becker", phone: "(480) 555-1222", email: "tom@example.com", address: "1420 W Ray Rd, Chandler", inputs: { panes: 32, insidePanes: 32, screens: 18, stories: 2 } };

describe("pricing", () => {
  it("prices items, then story surcharge, then discount", () => {
    const p = priceQuote({ panes: 32, insidePanes: 32, screens: 18, stories: 2 });
    expect(p.lines.map((l) => [l.key, l.amount])).toEqual([["panes", 192], ["insidePanes", 128], ["screens", 54], ["stories", 56.1]]);
    expect(p.total).toBe(430.1);
    expect(p.minimumApplied).toBe(false);
    const d = priceQuote({ panes: 32, insidePanes: 32, screens: 18, stories: 2, discountPct: 10 });
    expect(d.lines.at(-1)).toMatchObject({ key: "discount", amount: -43.01 });
    expect(d.total).toBe(387.09);
    expect(priceQuote({ panes: 10, stories: 3 }).lines.find((l) => l.key === "stories")).toMatchObject({ amount: 18 });
  });
  it("applies the minimum only to real jobs, and uses custom rules", () => {
    const small = priceQuote({ panes: 5 });
    expect(small).toMatchObject({ total: 150, minimumApplied: true });
    expect(small.lines.at(-1)).toMatchObject({ key: "minimum", amount: 120 });
    expect(priceQuote({})).toMatchObject({ total: 0, lines: [], minimumApplied: false });
    expect(priceQuote({ panes: 40 }, { ...DEFAULT_PRICING, pane: 7.5, minimum: 0 }).total).toBe(300);
  });
});

describe("PDF + delivery plumbing", () => {
  it("renders a parseable branded PDF and survives non-Latin text", async () => {
    expect(pdfSafe("“Hi” — 3 × panes… ✓")).toBe('"Hi" - 3 x panes... ');
    const many = Array.from({ length: 40 }, (_, i) => ({ key: `x${i}`, label: `Line ${i} — extra`, qty: 1, unit: 10, amount: 10 }));
    const bytes = await renderQuotePdf({ number: 1001, date: "Oct 19, 2026", validUntil: "Nov 18, 2026", customer: { name: "Zoë 🧽 Smith", address: "1 Main St" }, lines: many, total: 400, notes: "Back sliders — hard water", business: { name: "Rapid Window Cleaning", legalName: "AZ Rapid Washers LLC", city: "Chandler, AZ", phone: "", email: "", website: "" } });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getTitle()).toBe("Quote #1001 - Rapid Window Cleaning");
  });
  it("builds multipart email with the PDF attached", () => {
    const raw = buildMime({ to: [{ name: "Tom", email: "tom@example.com" }], subject: "Your quote", body: "Hi Tom", attachments: [{ filename: "Quote-1001.pdf", contentType: "application/pdf", data: new Uint8Array([37, 80, 68, 70]) }] });
    const mime = Buffer.from(raw, "base64url").toString();
    expect(mime).toMatch(/Content-Type: multipart\/mixed; boundary="lifeos_/);
    expect(mime).toContain('Content-Disposition: attachment; filename="Quote-1001.pdf"');
    expect(mime).toContain(Buffer.from([37, 80, 68, 70]).toString("base64"));
    expect(Buffer.from(buildMime({ to: [{ name: null, email: "a@b.co" }], subject: "s", body: "b" }), "base64url").toString()).toContain("Content-Type: text/plain");
  });
  it("normalizes phone numbers for texting", () => {
    expect(toE164("(480) 555-1222")).toBe("+14805551222");
    expect(toE164("1-480-555-1222")).toBe("+14805551222");
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
    expect(toE164("555-1222")).toBeNull();
    expect(toE164(null)).toBeNull();
  });
});

describe("quotes service", () => {
  it("creates with current pricing, links/creates the customer, and sets validity", async () => {
    await setSetting("business.pricing", { ...DEFAULT_PRICING, pane: 7, validDays: 14 });
    const q = await createQuote({ ...tom, saveCustomer: true });
    expect(q.number).toBe(1001); // numbering starts at #1001, even after a reset
    expect(q.lines[0]).toMatchObject({ key: "panes", unit: 7, amount: 224 });
    expect(q.validUntil).toBe(addDays(today(), 14));
    expect(q.status).toBe("DRAFT");
    const c = await db.customer.findUniqueOrThrow({ where: { id: q.customerId! } });
    expect(c).toMatchObject({ name: "Tom Becker", source: "MANUAL" });
    await expect(createQuote({ name: "Empty", inputs: {} })).rejects.toThrow(/at least one item/);
    await expect(createQuote({ name: " ", inputs: { panes: 3 } })).rejects.toThrow(/name is required/);
  });

  it("reprices on edit, keeps old prices otherwise, and locks decided quotes", async () => {
    const q = await createQuote(tom);
    await setSetting("business.pricing", { ...DEFAULT_PRICING, pane: 10 });
    expect((await updateQuote(q.id, { notes: "Gate code 4421" })).total).toBe(430.1); // untouched counts keep old prices
    expect((await updateQuote(q.id, { inputs: { panes: 20 } })).total).toBe(200);
    await setQuoteStatus(q.id, "ACCEPTED");
    await expect(updateQuote(q.id, { notes: "x" })).rejects.toThrow(/accepted/);
    expect(isExpired({ status: "SENT", validUntil: addDays(today(), -1) })).toBe(true);
    expect(isExpired({ status: "ACCEPTED", validUntil: addDays(today(), -1) })).toBe(false);
  });

  it("signs customer links and rejects tampering", async () => {
    const q = await createQuote(tom);
    const token = quoteToken(q.id);
    expect(verifyQuoteToken(token)).toBe(q.id);
    expect(verifyQuoteToken(`${q.id}.${"0".repeat(32)}`)).toBeNull();
    expect(verifyQuoteToken(token.replace(q.id, "cabcdefghijklmnopqrstuvwx"))).toBeNull();
    expect(verifyQuoteToken("garbage")).toBeNull();
    expect(quoteUrl(q.id)).toMatch(/\/q\/[a-z0-9]+\.[0-9a-f]{32}$/);

    const ok = await publicQuote(new Request("http://x"), { params: Promise.resolve({ token }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("application/pdf");
    expect(ok.headers.get("x-robots-tag")).toContain("noindex");
    const bad = await publicQuote(new Request("http://x"), { params: Promise.resolve({ token: `${q.id}.deadbeef` }) });
    expect(bad.status).toBe(404);
  });

  it("sends by text and email (mock), marks it sent, and refuses unreachable channels", async () => {
    const q = await createQuote(tom);
    const r = await sendQuote(q.id, ["SMS", "EMAIL"]);
    expect(r.sent).toEqual([{ channel: "SMS", to: "+14805551222" }, { channel: "EMAIL", to: "tom@example.com" }]);
    const box = mockOutbox();
    expect(box[0]?.body).toMatch(/^Hi Tom, here's your Rapid Window Cleaning quote #\d+: \$430\.10\. View it here: http.*\/q\//);
    expect(box[1]?.body).toContain("[attached: Quote-");
    const after = await getQuote(q.id);
    expect(after).toMatchObject({ status: "SENT", sentVia: ["SMS", "EMAIL"] });

    const noPhone = await createQuote({ name: "Email Only", email: "e@example.com", inputs: { panes: 30 } });
    await expect(sendQuote(noPhone.id, ["SMS"])).rejects.toThrow(/no textable phone/);
    await setQuoteStatus(noPhone.id, "DECLINED");
    await expect(sendQuote(noPhone.id, ["EMAIL"])).rejects.toThrow(/already declined/);
  });

  it("computes pipeline stats", () => {
    expect(quoteStats([{ status: "DRAFT", total: 100 }, { status: "SENT", total: 200 }, { status: "ACCEPTED", total: 300 }, { status: "DECLINED", total: 50 }, { status: "ACCEPTED", total: 100 }])).toEqual({ openCount: 2, openValue: 300, wonValue: 400, closeRate: 2 / 3 });
    expect(quoteStats([]).closeRate).toBeNull();
  });
});

describe("assistant quote tools", () => {
  const ctx = { actor: "ASSISTANT" as const };
  const ok = (r: ExecResult) => {
    if (r.status !== "ok") throw new Error(JSON.stringify(r));
    return r;
  };

  it("drafts freely (undoable) but waits for approval to send", async () => {
    const created = ok(await executeTool("quote_create", { name: "Tom Becker", phone: "4805551222", inputs: { panes: 32, insidePanes: 32, screens: 18, stories: 2 } }, ctx));
    const quoteId = (created.result as { id: string }).id;
    expect(created.summary).toMatch(/Drafted quote #\d+ for Tom Becker: \$430/);

    const send = await executeTool("quote_send", { quoteId, via: ["SMS"] }, ctx);
    expect(send.status).toBe("pending_approval");
    expect(mockOutbox()).toHaveLength(0);
    const approval = await db.pendingApproval.findFirstOrThrow({ where: { actionType: "quote_send" } });
    expect(approval).toMatchObject({ risk: "quote.send", summary: expect.stringMatching(/Send quote #\d+ \(\$430\) to Tom Becker by text to 4805551222/) });

    ok(await approve(approval.id));
    expect(mockOutbox()).toHaveLength(1);
    expect((await getQuote(quoteId))?.status).toBe("SENT");

    await expect(undoActivity(created.activityId)).rejects.toThrow(/already sent/);
    expect(await getQuote(quoteId)).not.toBeNull();

    const draft = ok(await executeTool("quote_create", { name: "Draft Only", inputs: { panes: 40 } }, ctx));
    await undoActivity(draft.activityId);
    expect(await getQuote((draft.result as { id: string }).id)).toBeNull();
  });

  it("sends immediately only when quote auto-approve is switched on", async () => {
    await setSetting("approvals.autoApprove", { "quote.send": true });
    const q = await createQuote(tom);
    ok(await executeTool("quote_send", { quoteId: q.id, via: ["EMAIL"] }, ctx));
    expect(mockOutbox()).toHaveLength(1);
  });
});
