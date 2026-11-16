import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { executeTool } from "@/lib/assistant/executor";
import { mockOutbox } from "@/lib/notify";
import { doNowAction, doNowCounts, doNowItems } from "@/lib/services/do-now";
import { createQuote, sendQuote } from "@/lib/services/quotes";
import { setSetting } from "@/lib/services/settings";
import { createTask } from "@/lib/services/tasks";
import { addDays, atLocalMinutes, today } from "@/lib/time";
import { resetDb } from "../../setup/db";

beforeEach(async () => {
  await resetDb();
  mockOutbox().length = 0;
  await setSetting("notifications.quietHours", { start: "23:59", end: "00:00" });
});

describe("Do Now", () => {
  it("collects open loops from across Life OS, ranked by urgency", async () => {
    const now = new Date();
    await db.lead.create({ data: { source: "WEBSITE", name: "Waiting Wanda", phone: "4805550111", receivedAt: new Date(now.getTime() - 40 * 60_000) } });
    await db.lead.create({ data: { source: "META", name: "Fresh Fred", phone: "4805550112", receivedAt: new Date(now.getTime() - 2 * 60_000) } });
    await createTask({ title: "Overdue invoice follow-up", dueAt: atLocalMinutes(addDays(today(), -2), 17 * 60) });
    await createTask({ title: "Due today thing", priority: 3, dueAt: atLocalMinutes(today(), 17 * 60) });
    await createTask({ title: "Next week thing", dueAt: atLocalMinutes(addDays(today(), 7), 17 * 60) });
    const q = await createQuote({ name: "Slow Sam", phone: "4805550113", inputs: { panes: 30 } });
    await sendQuote(q.id, ["SMS"]);
    await db.quote.update({ where: { id: q.id }, data: { sentAt: new Date(now.getTime() - 5 * 86_400_000) } });
    const c = await db.customer.create({ data: { name: "Ref Rita", tags: [] } });
    await db.referral.create({ data: { referrerId: c.id, referredName: "Neighbor", status: "EARNED", reward: 25 } });
    await executeTool("quote_send", { quoteId: q.id, via: ["SMS"] }, { actor: "ASSISTANT" });

    const items = await doNowItems(now);
    const by = (k: string) => items.find((i) => i.title.includes(k));
    expect(by("Send quote")?.urgency).toBe("now"); // approval waiting
    expect(by("Reply to Waiting Wanda")?.urgency).toBe("now");
    expect(by("Reply to Fresh Fred")?.urgency).toBe("today");
    expect(by("Overdue invoice follow-up")).toMatchObject({ urgency: "now", detail: expect.stringMatching(/^Overdue since/) });
    expect(by("Due today thing")?.urgency).toBe("today");
    expect(by("Next week thing")).toBeUndefined();
    expect(by("Follow up on quote")?.urgency).toBe("today");
    expect(by("Pay Ref Rita's referral reward")?.urgency).toBe("week");
    expect(items.some((i) => i.area === "setup" && i.urgency === "later")).toBe(true); // mock mode isn't "live"
    const ranks = items.map((i) => ["now", "today", "week", "later"].indexOf(i.urgency));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(doNowCounts(items).now).toBeGreaterThanOrEqual(3);
  });

  it("one-tap actions close the loop and the item disappears", async () => {
    const t = await createTask({ title: "Buy squeegee rubbers", dueAt: atLocalMinutes(today(), 17 * 60) });
    const t2 = await createTask({ title: "Call insurance", dueAt: atLocalMinutes(today(), 17 * 60) });
    const lead = await db.lead.create({ data: { source: "WEBSITE", name: "Callme Carl", phone: "4805550114" } });
    expect(await doNowAction(`task:${t.id}`, "done")).toBe("Done");
    expect(await doNowAction(`task:${t2.id}`, "tomorrow")).toBe("Moved to tomorrow");
    expect(await doNowAction(`lead:${lead.id}`, "called")).toBe("Marked contacted");
    const titles = (await doNowItems()).map((i) => i.title);
    expect(titles).not.toContain("Buy squeegee rubbers");
    expect(titles).not.toContain("Call insurance");
    expect(titles).not.toContain("Reply to Callme Carl");
    await expect(doNowAction(`task:${t.id}`, "explode")).rejects.toThrow(/Can't do/);
  });

  it("approving from Do Now runs the waiting action", async () => {
    const q = await createQuote({ name: "Approve Amy", phone: "4805550115", inputs: { panes: 30 } });
    const r = await executeTool("quote_send", { quoteId: q.id, via: ["SMS"] }, { actor: "ASSISTANT" });
    if (r.status !== "pending_approval") throw new Error(r.status);
    expect(await doNowAction(`approval:${r.approvalId}`, "approve")).toMatch(/^Sent quote #\d+/);
    expect(mockOutbox()).toHaveLength(1);
  });

  it("the assistant can list it", async () => {
    await createTask({ title: "Assistant sees me", dueAt: atLocalMinutes(today(), 17 * 60) });
    const r = await executeTool("do_now_list", {}, { actor: "ASSISTANT" });
    if (r.status !== "ok") throw new Error(JSON.stringify(r));
    expect(JSON.stringify(r.result)).toContain("Assistant sees me");
  });
});
