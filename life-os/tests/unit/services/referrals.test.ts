import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { executeTool, undoActivity } from "@/lib/assistant/executor";
import { mockOutbox } from "@/lib/notify";
import { createManualLead, setLeadStatus } from "@/lib/services/leads";
import { createReferral, listReferrals, markEarnedReferrals, matchReferrer, referralStats, referralWatch, setReferralStatus } from "@/lib/services/referrals";
import { setSetting } from "@/lib/services/settings";
import { resetDb } from "../../setup/db";

beforeEach(async () => {
  await resetDb();
  mockOutbox().length = 0;
  await setSetting("notifications.quietHours", { start: "23:59", end: "00:00" });
});

const customer = (name: string) => db.customer.create({ data: { name, tags: [] } });

describe("referral helpers", () => {
  it("matches the referrer by name, refusing ambiguous matches", () => {
    const cs = [{ id: "1", name: "Priya Patel" }, { id: "2", name: "Tom Becker" }, { id: "3", name: "Tom Barnes" }];
    expect(matchReferrer("priya patel", cs)?.id).toBe("1");
    expect(matchReferrer("Priya P.", cs)?.id).toBe("1");
    expect(matchReferrer("Priya", cs)?.id).toBe("1");
    expect(matchReferrer("Tom", cs)).toBeNull();
    expect(matchReferrer("Tom Be", cs)).toBeNull(); // last initial B matches both
    expect(matchReferrer("Tom Becker", cs)?.id).toBe("2");
    expect(matchReferrer("Nobody", cs)).toBeNull();
  });
  it("totals and ranks referrers", () => {
    const s = referralStats([
      { referrerId: "a", referrerName: "A", status: "PAID", reward: 25 },
      { referrerId: "a", referrerName: "A", status: "EARNED", reward: 25 },
      { referrerId: "b", referrerName: "B", status: "PENDING", reward: 25 },
      { referrerId: "b", referrerName: "B", status: "VOID", reward: 25 },
    ]);
    expect(s).toMatchObject({ total: 3, converted: 2, owedCount: 1, owedAmount: 25, paidAmount: 25 });
    expect(s.leaders.map((l) => [l.name, l.converted, l.sent])).toEqual([["A", 2, 2], ["B", 0, 1]]);
  });
});

describe("referral lifecycle", () => {
  it("a referral lead becomes a referral, earns when the referred customer completes a job, then gets paid", async () => {
    const priya = await customer("Priya Patel");
    await setSetting("business.referralReward", { amount: 40, kind: "gift card" });
    await createManualLead({ name: "Rick Neighbor", phone: "4805550133", source: "REFERRAL", sourceDetail: "Priya Patel" });
    expect(await referralWatch()).toBe("1 new from leads, 0 earned");
    const r = await db.referral.findFirstOrThrow();
    expect(r).toMatchObject({ referrerId: priya.id, referredName: "Rick Neighbor", reward: 40, rewardKind: "gift card", status: "PENDING" });
    expect(await referralWatch()).toBe("0 new from leads, 0 earned"); // idempotent

    const rick = await customer("Rick Neighbor");
    await db.lead.update({ where: { id: r.leadId! }, data: { customerId: rick.id } });
    await db.job.create({ data: { title: "Windows", customerId: rick.id, status: "COMPLETED", total: 300, completedAt: new Date() } });
    expect(await markEarnedReferrals()).toBe(1);
    expect(await db.referral.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: "EARNED", referredCustomerId: rick.id, earnedAt: expect.any(Date) });
    expect(mockOutbox().some((m) => m.title === "Referral reward earned: Priya Patel" && m.body.includes("$40 gift card"))).toBe(true);

    await setReferralStatus(r.id, "PAID");
    const { stats } = await listReferrals();
    expect(stats).toMatchObject({ paidAmount: 40, owedAmount: 0, converted: 1 });
  });

  it("a won lead also earns; pending referrals can't be marked paid; ambiguous names are skipped", async () => {
    const amy = await customer("Amy Jones");
    await customer("Tom Becker");
    await customer("Tom Barnes");
    const lead = await createManualLead({ name: "Wanda", phone: "4805550199", source: "REFERRAL", sourceDetail: "Amy Jones" });
    await createManualLead({ name: "Vague", phone: "4805550198", source: "REFERRAL", sourceDetail: "Tom" });
    await referralWatch();
    const r = await db.referral.findFirstOrThrow({ where: { referrerId: amy.id } });
    expect(await db.referral.count()).toBe(1);
    await expect(setReferralStatus(r.id, "PAID")).rejects.toThrow(/hasn't turned into a job/);
    await setLeadStatus(lead.id, "WON");
    expect(await markEarnedReferrals()).toBe(1);
  });

  it("assistant can record a referral (undoable) and rejects unknown referrers", async () => {
    await customer("Priya Patel");
    const ok = await executeTool("referral_add", { referrerName: "Priya", referredName: "Bob Next Door" }, { actor: "ASSISTANT" });
    if (ok.status !== "ok") throw new Error(JSON.stringify(ok));
    expect(ok.summary).toBe("Recorded referral: Priya Patel → Bob Next Door ($25 credit when they book)");
    await undoActivity(ok.activityId);
    expect(await db.referral.count()).toBe(0);
    const bad = await executeTool("referral_add", { referrerName: "Nobody Known", referredName: "X" }, { actor: "ASSISTANT" });
    expect(bad).toMatchObject({ status: "error", error: expect.stringMatching(/No single customer matches/) });
    expect((await createReferral({ referrerId: (await db.customer.findFirstOrThrow()).id, referredName: "Direct" })).reward).toBe(25);
  });
});
