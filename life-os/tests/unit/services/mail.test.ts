import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ruleTriage } from "@/lib/ai/triage";
import { buildMime, htmlToText, mockReceive, mockSentMessages, parseAddress, parseAddressList, parseApiMessage, replySubject, resetMockGmail, stripQuoted } from "@/lib/integrations/google/gmail";
import { archiveThread, generateDraft, labelThread, listThreads, replyRecipients, searchMail, sendReply, snoozeThread, syncAndTriage, syncInbox, unarchiveThread, unsnoozeDue } from "@/lib/services/mail";
import { resetDb } from "../../setup/db";

beforeEach(async () => {
  await resetDb();
  resetMockGmail();
});

describe("MIME helpers", () => {
  it("parses addresses and lists with quoted commas", () => {
    expect(parseAddress('"Park, Linda" <Linda@MesaVerdeHOA.org>')).toEqual({ name: "Park, Linda", email: "linda@mesaverdehoa.org" });
    expect(parseAddressList('"Park, Linda" <l@x.com>, bob@y.com')).toEqual([{ name: "Park, Linda", email: "l@x.com" }, { name: null, email: "bob@y.com" }]);
  });
  it("extracts text/plain, falls back to HTML", () => {
    const enc = (s: string) => Buffer.from(s).toString("base64url");
    const m = parseApiMessage({
      id: "1",
      threadId: "t",
      labelIds: ["INBOX"],
      snippet: "",
      internalDate: "1760630400000",
      payload: { mimeType: "multipart/alternative", headers: [{ name: "From", value: "A <a@x.com>" }, { name: "Subject", value: "Hi" }], parts: [{ mimeType: "text/html", body: { data: enc("<p>Hello&nbsp;<b>there</b></p>") } }] },
    });
    expect(m.text).toBe("Hello there");
    expect(m.from.email).toBe("a@x.com");
    expect(htmlToText("<div>a</div><div>b</div>")).toBe("a\nb");
  });
  it("strips quoted history", () => {
    expect(stripQuoted("Sounds good!\n\nOn Mon, Oct 12, 2026 at 9:00 AM Bob <b@x.com> wrote:\n> old")).toBe("Sounds good!");
  });
  it("builds a threaded reply", () => {
    const raw = buildMime({ to: [{ name: "Jen", email: "jen@x.com" }], subject: replySubject("Quote"), body: "Hi Jen — sure!", inReplyTo: "<m1@x>" });
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    expect(decoded).toContain("To: Jen <jen@x.com>");
    expect(decoded).toContain("Subject: Re: Quote");
    expect(decoded).toContain("In-Reply-To: <m1@x>");
    expect(replySubject("RE: x")).toBe("RE: x");
  });
});

describe("rule triage", () => {
  const base = { id: "x", fromName: null, labels: [], lastFromMe: false };
  it("categorizes typical window-cleaning mail", () => {
    expect(ruleTriage({ ...base, subject: "Quote request", fromEmail: "jen@x.com", body: "Could you give me a quote for windows?" })).toMatchObject({ category: "LEAD", needsReply: true });
    expect(ruleTriage({ ...base, subject: "URGENT verify", fromEmail: "security@paypa1-alerts.com", body: "Verify your account or be suspended" })).toMatchObject({ category: "SPAM", priority: 0, needsReply: false });
    expect(ruleTriage({ ...base, subject: "Invoice #1", fromEmail: "ar@vendor.com", body: "Invoice attached." })).toMatchObject({ category: "VENDOR" });
    expect(ruleTriage({ ...base, subject: "Weekly", fromEmail: "news@x.com", labels: ["CATEGORY_PROMOTIONS"], body: "Big sale" })).toMatchObject({ category: "NEWSLETTER" });
  });
  it("never needs a reply when I sent last", () => {
    expect(ruleTriage({ ...base, lastFromMe: true, subject: "Quote", fromEmail: "jen@x.com", body: "Can you quote?" }).needsReply).toBe(false);
  });
});

describe("mail service (mock Gmail)", () => {
  it("syncs, triages, and builds the needs-reply queue", async () => {
    const { sync, triaged } = await syncAndTriage();
    expect("full" in sync && sync.full).toBe(true);
    expect(triaged.length).toBe(10);
    const cats = Object.fromEntries((await db.emailThread.findMany()).map((t) => [t.subject, t.category]));
    expect(cats["Quote request - 2 story home in Ocotillo"]).toBe("LEAD");
    expect(cats["URGENT: verify your account to avoid suspension"]).toBe("SPAM");
    expect(cats["Invoice #4471 - Desert Pure Water Supply"]).toBe("VENDOR");
    const queue = await listThreads({ view: "reply" });
    expect(queue.map((t) => t.subject)).toContain("Quote request - 2 story home in Ocotillo");
    expect(queue.every((t) => t.needsReply)).toBe(true);
  });

  it("incremental sync picks up new mail and re-triages it", async () => {
    await syncAndTriage();
    mockReceive("Do you do screen repair?", { name: "Tom", email: "tom@example.com" }, "Hi, do you offer screen repair? How much?");
    const r = await syncInbox();
    expect("full" in r && r.full).toBe(false);
    const { triaged } = await syncAndTriage();
    expect(triaged.find((t) => t.subject === "Do you do screen repair?")?.category).toBe("LEAD");
  });

  it("archives, labels, snoozes and unsnoozes", async () => {
    await syncAndTriage();
    const t = (await listThreads({ q: "Jobber" }))[0];
    if (!t) throw new Error("fixture missing");
    await archiveThread(t.id);
    expect((await listThreads()).some((x) => x.id === t.id)).toBe(false);
    await unarchiveThread(t.id);
    await labelThread(t.id, "Read later");
    expect((await db.emailThread.findUniqueOrThrow({ where: { id: t.id } })).labels.some((l) => l.startsWith("Label_"))).toBe(true);
    await snoozeThread(t.id, new Date(Date.now() + 60_000));
    expect((await listThreads()).some((x) => x.id === t.id)).toBe(false);
    expect(await unsnoozeDue(new Date(Date.now() + 120_000))).toBe(1);
    expect((await listThreads()).some((x) => x.id === t.id)).toBe(true);
  });

  it("drafts (template fallback) and sends a threaded reply to the right person", async () => {
    await syncAndTriage();
    const t = (await searchMail("Ocotillo"))[0];
    if (!t) throw new Error("fixture missing");
    const draft = await generateDraft(t.id);
    expect(draft.body).toContain("Hi Jennifer");
    const r = await sendReply(t.id, "Hi Jen, happy to quote! Thanks, Grayden");
    expect(r.to).toEqual(["jen.alvarez@example.com"]);
    const sent = mockSentMessages()[0];
    expect(Buffer.from(sent?.raw ?? "", "base64url").toString()).toContain("In-Reply-To:");
    const after = await db.emailThread.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.needsReply).toBe(false);
    expect(await db.emailMessage.count({ where: { threadId: t.id, isFromMe: true } })).toBe(1);
    expect(await db.emailDraft.count({ where: { threadId: t.id, status: "SENT" } })).toBe(1);
  });

  it("reply recipients exclude me and keep other participants on Cc", () => {
    const r = replyRecipients([{ fromName: "Rick", fromEmail: "rick@x.com", to: ["me@x.com", "ops@x.com"], cc: ["boss@x.com"], isFromMe: false }], "me@x.com");
    expect(r.to.map((a) => a.email)).toEqual(["rick@x.com"]);
    expect(r.cc.map((a) => a.email).sort()).toEqual(["boss@x.com", "ops@x.com"]);
  });
});
