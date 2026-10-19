import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { executeTool } from "@/lib/assistant/executor";
import { addMonthsLocal, rebookStatus, rebookText } from "@/lib/business/rebook";
import { mockOutbox } from "@/lib/notify";
import { syncHousecallPro, updateCustomer } from "@/lib/services/customers";
import { rebookDigest, rebookList, sendRebookText, setRebookOptOut, snoozeRebook } from "@/lib/services/rebook";
import { setSetting } from "@/lib/services/settings";
import { resetDb } from "../../setup/db";

beforeEach(async () => {
  await resetDb();
  mockOutbox().length = 0;
  await setSetting("notifications.quietHours", { start: "23:59", end: "00:00" });
});

describe("re-book rules", () => {
  it("adds months with month-end clamping", () => {
    expect(addMonthsLocal("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsLocal("2026-04-19", 6)).toBe("2026-10-19");
    expect(addMonthsLocal("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonthsLocal("2028-02-29", 12)).toBe("2029-02-28");
  });
  it("buckets by due date and respects suppressions", () => {
    const base = { lastCleaned: "2026-04-01", intervalMonths: 6, hasUpcomingJob: false, optOut: false, snoozedUntil: null, textedAt: null };
    expect(rebookStatus(base, "2026-10-19")).toEqual({ dueDate: "2026-10-01", daysUntil: -18, bucket: "overdue" });
    expect(rebookStatus({ ...base, lastCleaned: "2026-04-25" }, "2026-10-19")?.bucket).toBe("due");
    expect(rebookStatus({ ...base, lastCleaned: "2026-05-20" }, "2026-10-19")?.bucket).toBe("soon");
    expect(rebookStatus({ ...base, lastCleaned: "2026-07-01" }, "2026-10-19")).toBeNull();
    expect(rebookStatus({ ...base, hasUpcomingJob: true }, "2026-10-19")).toBeNull();
    expect(rebookStatus({ ...base, optOut: true }, "2026-10-19")).toBeNull();
    expect(rebookStatus({ ...base, snoozedUntil: "2026-11-01" }, "2026-10-19")).toBeNull();
    expect(rebookStatus({ ...base, snoozedUntil: "2026-10-01" }, "2026-10-19")).not.toBeNull();
    expect(rebookStatus({ ...base, textedAt: "2026-10-01" }, "2026-10-19")).toBeNull();
    expect(rebookStatus({ ...base, textedAt: "2026-09-01" }, "2026-10-19")).not.toBeNull();
    expect(rebookStatus({ ...base, lastCleaned: null }, "2026-10-19")).toBeNull();
  });
  it("drafts a friendly text", () => {
    expect(rebookText({ name: "Tom Becker", lastCleanedLabel: "Sep 18, 2025", monthsSince: 13, business: "Rapid Window Cleaning" })).toBe("Hi Tom, it's Grayden with Rapid Window Cleaning! It's been over a year since we cleaned your windows (Sep 18, 2025). Want me to get you on the schedule for your next cleaning? I have openings next week. Reply with a day that works!");
  });
});

describe("re-book list + sending", () => {
  it("lists due Housecall Pro customers (skipping anyone with upcoming work), most overdue first", async () => {
    await syncHousecallPro();
    const rows = await rebookList();
    expect(rows.map((r) => r.name)).toEqual(["Tom Becker", "Jennifer Alvarez"]); // 13 and 7 months, default 6
    expect(rows[0]).toMatchObject({ bucket: "overdue", canText: true, intervalMonths: 6, lastTotal: 340 });
    expect(rows[0]?.draft).toMatch(/^Hi Tom, it's Grayden with Rapid Window Cleaning! It's been over a year/);
    expect(rows[1]?.draft).toContain("It's been about 7 months");
    expect(rebookText({ name: "A", lastCleanedLabel: "x", monthsSince: 6, business: "B" })).toContain("about 6 months");
  });

  it("per-customer interval, snooze, opt-out, and texting all take customers off the list", async () => {
    await syncHousecallPro();
    const jen = await db.customer.findUniqueOrThrow({ where: { externalId: "hc_c5" } });
    const tom = await db.customer.findUniqueOrThrow({ where: { externalId: "hc_c6" } });
    await updateCustomer(jen.id, { rebookMonths: 12 });
    expect((await rebookList()).map((r) => r.name)).toEqual(["Tom Becker"]);
    await updateCustomer(jen.id, { rebookMonths: null });

    expect(await sendRebookText(tom.id)).toMatchObject({ name: "Tom Becker", to: expect.stringMatching(/^\+1480555/) });
    expect(mockOutbox().at(-1)?.body).toMatch(/^Hi Tom/);
    expect((await rebookList()).map((r) => r.name)).toEqual(["Jennifer Alvarez"]);

    await snoozeRebook(jen.id, 30);
    expect(await rebookList()).toEqual([]);
    await db.customer.update({ where: { id: jen.id }, data: { rebookSnoozedUntil: null } });
    await setRebookOptOut(jen.id, true);
    expect(await rebookList()).toEqual([]);
    await expect(sendRebookText(jen.id)).rejects.toThrow(/isn't due/);
  });

  it("Monday digest only fires when someone is due; assistant texting waits for approval", async () => {
    expect(await rebookDigest()).toBe("no customers due");
    await syncHousecallPro();
    expect(await rebookDigest()).toBe("2 due");
    expect(mockOutbox().some((m) => m.title === "2 customers due for a cleaning")).toBe(true);
    const tom = await db.customer.findUniqueOrThrow({ where: { externalId: "hc_c6" } });
    const before = mockOutbox().length;
    const r = await executeTool("rebook_text", { customerId: tom.id }, { actor: "ASSISTANT" });
    expect(r.status).toBe("pending_approval");
    expect(await db.pendingApproval.findFirstOrThrow()).toMatchObject({ risk: "rebook.text", summary: expect.stringContaining("Text Tom Becker") });
    expect(mockOutbox()).toHaveLength(before);
  });
});
