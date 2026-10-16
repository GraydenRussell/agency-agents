import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addWater, healthSummary, logSleep, logWorkout } from "@/lib/services/health";
import { addBill, addTransaction, dueDateIn, isPaid, markBillPaid, monthSummary, upcomingBills, upsertCategory } from "@/lib/services/money";
import { createPerson, dueFollowUps, logInteraction, updatePerson, upcomingBirthdays } from "@/lib/services/people";
import { addDays, today } from "@/lib/time";
import { resetDb } from "../../setup/db";

beforeEach(resetDb);

describe("health", () => {
  it("logs water (clamped), sleep (upsert), workouts and summarizes", async () => {
    const t = today();
    await addWater(t, 16);
    await addWater(t, 16);
    expect((await addWater(t, -100)).ounces).toBe(0);
    await addWater(t, 24);
    await logSleep(addDays(t, -1), 7);
    await logSleep(addDays(t, -1), 7.5, 4);
    await logWorkout({ date: t, type: "Run", durationMin: 40 });
    await logWorkout({ date: addDays(t, -1), type: "Strength", durationMin: 60 });
    await expect(logWorkout({ date: t, type: "Run", durationMin: 0 })).rejects.toThrow();
    const s = await healthSummary(14, t);
    expect(s.waterToday).toBe(24);
    expect(s.sleep.find((x) => x.date === addDays(t, -1))).toMatchObject({ hours: 7.5, quality: 4 });
    expect(s.avgSleep).toBe(7.5);
    expect(s.weekly.at(-1)?.minutes).toBeGreaterThanOrEqual(40);
    expect(s.dates.length).toBe(14);
  });
});

describe("money", () => {
  it("clamps due days and computes paid/autopay status", () => {
    expect(dueDateIn("2026-02", 31)).toBe("2026-02-28");
    expect(dueDateIn("2026-10", 15)).toBe("2026-10-15");
    expect(isPaid({ paidThrough: "2026-10", autopay: false }, "2026-10", "2026-10-01", "2026-10-20")).toBe(true);
    expect(isPaid({ paidThrough: null, autopay: true }, "2026-10", "2026-10-21", "2026-10-20")).toBe(true);
    expect(isPaid({ paidThrough: null, autopay: true }, "2026-10", "2026-10-19", "2026-10-20")).toBe(false);
  });

  it("summarizes a month: spend per category, bills, upcoming", async () => {
    const ym = today().slice(0, 7);
    const groceries = await upsertCategory({ name: "Groceries", monthlyLimit: 100 });
    await addTransaction({ date: `${ym}-01`, amount: 80, merchant: "Fry's", categoryId: groceries.id });
    await addTransaction({ date: `${ym}-02`, amount: 40, merchant: "Costco", categoryId: groceries.id });
    await addTransaction({ date: `${ym}-02`, amount: 9.99, merchant: "Spotify" });
    const bill = await addBill({ name: "Electric", amount: 180, dueDay: Number(addDays(today(), 2).slice(8)) });
    const s = await monthSummary(ym);
    expect(s.budget[0]).toMatchObject({ name: "Groceries", spent: 120, limit: 100 });
    expect(s.uncategorized).toBeCloseTo(9.99);
    expect(s.totalSpent).toBeCloseTo(129.99);
    const up = await upcomingBills(7);
    if (addDays(today(), 2).slice(0, 7) === ym) {
      expect(up.map((b) => b.name)).toContain("Electric");
      await markBillPaid(bill.id, ym);
      expect((await upcomingBills(7)).map((b) => b.name)).not.toContain("Electric");
    }
    await expect(addTransaction({ date: `${ym}-01`, amount: -5, merchant: "x" })).rejects.toThrow();
  });
});

describe("people", () => {
  it("tracks follow-ups from interactions and settings", async () => {
    const p = await createPerson({ name: "Linda Park", relation: "Customer", followUpDays: 7, email: "" });
    expect(p.email).toBeNull();
    expect((await dueFollowUps()).length).toBe(0);
    await logInteraction(p.id, { channel: "Call", summary: "Quoted HOA", date: new Date(Date.now() - 10 * 86_400_000) });
    expect((await dueFollowUps()).map((x) => x.name)).toEqual(["Linda Park"]);
    await logInteraction(p.id, { channel: "Email", summary: "Sent contract" });
    expect((await dueFollowUps()).length).toBe(0);
    await updatePerson(p.id, { followUpDays: null });
    expect((await db.person.findUniqueOrThrow({ where: { id: p.id } })).nextFollowUpAt).toBeNull();
    await expect(createPerson({ name: "Bad", birthday: "13/45" })).rejects.toThrow();
  });

  it("finds upcoming birthdays across the year boundary", () => {
    expect(upcomingBirthdays([{ name: "Mom", birthday: "01-03" }, { name: "Tyce", birthday: "06-01" }, { name: "None", birthday: null }], "2026-12-28", 14)).toEqual([{ name: "Mom", date: "2027-01-03", inDays: 6 }]);
  });
});
