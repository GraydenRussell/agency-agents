import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { fetchHousecall, mapCustomer, mapJob, mapWorkStatus, mockHousecall } from "@/lib/integrations/housecall";
import { createCustomer, customerStats, getCustomer, housecallSyncState, listCustomers, syncHousecallPro, updateCustomer } from "@/lib/services/customers";
import { resetDb } from "../../setup/db";

beforeEach(resetDb);
afterEach(() => {
  process.env.INTEGRATION_MODE = "mock";
  delete process.env.HOUSECALL_PRO_API_KEY;
  vi.unstubAllGlobals();
});

describe("Housecall Pro mapping", () => {
  it("maps customers: person name, company fallback, first phone, formatted address", () => {
    expect(mapCustomer({ id: "c1", first_name: " Priya ", last_name: "Patel", mobile_number: null, home_number: "4805551234", addresses: [{ street: "2210 W Ocotillo Rd", city: "Chandler", state: "AZ", zip: "85248", latitude: 33.2, longitude: -111.8 }] })).toEqual({
      externalId: "c1", name: "Priya Patel", company: null, phone: "4805551234", email: null, address: "2210 W Ocotillo Rd, Chandler, AZ 85248", city: "Chandler", lat: 33.2, lng: -111.8, tags: [],
    });
    expect(mapCustomer({ id: "c2", company: "Sun Lakes HOA" }).name).toBe("Sun Lakes HOA");
    expect(mapCustomer({ id: "c3" }).name).toBe("Unnamed customer");
  });
  it("maps work status", () => {
    expect(mapWorkStatus("complete rated", true)).toBe("COMPLETED");
    expect(mapWorkStatus("complete unrated", true)).toBe("COMPLETED");
    expect(mapWorkStatus("in progress", true)).toBe("IN_PROGRESS");
    expect(mapWorkStatus("pro canceled", true)).toBe("CANCELED");
    expect(mapWorkStatus("needs scheduling", false)).toBe("UNSCHEDULED");
    expect(mapWorkStatus("scheduled", true)).toBe("SCHEDULED");
    expect(mapWorkStatus(null, false)).toBe("UNSCHEDULED");
  });
  it("maps jobs: cents → dollars, crew names, dates", () => {
    const j = mapJob({ id: "j1", invoice_number: 1042, description: null, customer: { id: "c1" }, work_status: "complete rated", schedule: { scheduled_start: "2026-10-01T15:00:00Z", scheduled_end: "2026-10-01T17:00:00Z" }, work_timestamps: { completed_at: "2026-10-01T17:05:00Z" }, total_amount: 38550, outstanding_balance: 0, assigned_employees: [{ first_name: "Tyce", last_name: null }] });
    expect(j).toMatchObject({ externalId: "j1", customerExternalId: "c1", title: "Window cleaning", status: "COMPLETED", total: 385.5, balanceDue: 0, invoiceNumber: "1042", crew: ["Tyce"] });
    expect(j.completedAt?.toISOString()).toBe("2026-10-01T17:05:00.000Z");
    expect(mapJob({ id: "j2", schedule: { scheduled_start: "not a date" } }).scheduledStart).toBeNull();
  });
});

describe("Housecall Pro live client", () => {
  it("pages through results with the Token header and skips malformed rows", async () => {
    process.env.INTEGRATION_MODE = "live";
    process.env.HOUSECALL_PRO_API_KEY = "hcp_test_key";
    const calls: string[] = [];
    const f = vi.fn(async (url: URL, init?: RequestInit) => {
      calls.push(url.toString());
      expect(new Headers(init?.headers).get("authorization")).toBe("Token hcp_test_key");
      const p = Number(url.searchParams.get("page"));
      if (url.pathname === "/customers") return Response.json({ page: p, total_pages: 2, customers: p === 1 ? [{ id: "c1", first_name: "A" }, { nope: true }] : [{ id: "c2", company: "B LLC" }] });
      return Response.json({ page: 1, total_pages: 1, jobs: [{ id: "j1", customer: { id: "c2" }, total_amount: 10000, work_status: "scheduled", schedule: { scheduled_start: "2026-10-20T15:00:00Z" } }] });
    });
    const r = await fetchHousecall({ fetchImpl: f as unknown as typeof fetch });
    expect(r.customers.map((c) => c.name)).toEqual(["A", "B LLC"]);
    expect(r.jobs[0]).toMatchObject({ total: 100, status: "SCHEDULED", customerExternalId: "c2" });
    expect(calls.filter((c) => c.includes("/customers"))).toHaveLength(2);
    expect(calls.find((c) => c.includes("/jobs"))).toContain("scheduled_start_min=");
  });
  it("explains a rejected key and records the error on the sync state", async () => {
    process.env.INTEGRATION_MODE = "live";
    process.env.HOUSECALL_PRO_API_KEY = "bad";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    await expect(syncHousecallPro()).rejects.toThrow(/rejected the API key/);
    expect(await housecallSyncState()).toMatchObject({ configured: true, status: "ERROR", lastError: expect.stringContaining("rejected") });
  });
  it("refuses to sync without a key in live mode", async () => {
    process.env.INTEGRATION_MODE = "live";
    await expect(syncHousecallPro()).rejects.toThrow(/HOUSECALL_PRO_API_KEY/);
  });
});

describe("customer sync + reads", () => {
  it("imports mock customers and jobs, links them, and re-syncs idempotently without clobbering my fields", async () => {
    const mock = mockHousecall();
    const first = await syncHousecallPro();
    expect(first.customers).toEqual({ created: mock.customers.length, updated: 0 });
    expect(first.jobs).toMatchObject({ created: mock.jobs.length, updated: 0, unlinked: 0 });

    const patel = await db.customer.findUniqueOrThrow({ where: { externalId: "hc_c1" } });
    await updateCustomer(patel.id, { rebookMonths: 4, notes: "Gate code 4421", name: "Hacked name" });

    const second = await syncHousecallPro();
    expect(second.customers).toEqual({ created: 0, updated: mock.customers.length });
    expect(second.jobs.created).toBe(0);
    expect(await db.job.count()).toBe(mock.jobs.length);
    const after = await db.customer.findUniqueOrThrow({ where: { id: patel.id } });
    expect(after).toMatchObject({ name: "Priya Patel", rebookMonths: 4, notes: "Gate code 4421", source: "HOUSECALL_PRO" });
    expect((await housecallSyncState()).status).toBe("CONNECTED");
  });

  it("rolls up lifetime value, last cleaned, next job, and money owed", async () => {
    await syncHousecallPro();
    const rows = await listCustomers();
    const patel = rows.find((r) => r.name === "Priya Patel")!;
    expect(patel.jobCount).toBe(1);
    expect(patel.lifetimeValue).toBe(385);
    expect(patel.nextScheduledAt).not.toBeNull();
    expect(rows.find((r) => r.name === "Jennifer Alvarez")!.balanceDue).toBe(410);
    expect((await listCustomers({ q: "gilbert" })).map((r) => r.name).sort()).toEqual(["Desert Ridge Dental", "Linda Park", "Minh Nguyen"]); // Desert Ridge is on Gilbert Rd
    expect((await listCustomers({ q: "HOA" })).map((r) => r.name)).toEqual(["Sun Lakes HOA"]);
    const detail = await getCustomer(patel.id);
    expect(detail?.jobs.length).toBe(2);
  });

  it("computes stats purely, ignoring canceled balances and stale schedules", () => {
    const now = new Date("2026-10-18T18:00:00Z");
    const s = customerStats([
      { status: "COMPLETED", total: 300, balanceDue: 0, completedAt: new Date("2026-04-01T18:00:00Z"), scheduledStart: null },
      { status: "COMPLETED", total: 320, balanceDue: 320, completedAt: null, scheduledStart: new Date("2026-09-01T18:00:00Z") },
      { status: "CANCELED", total: 200, balanceDue: 200, completedAt: null, scheduledStart: new Date("2026-10-25T18:00:00Z") },
      { status: "SCHEDULED", total: 300, balanceDue: 0, completedAt: null, scheduledStart: new Date("2026-10-01T18:00:00Z") },
      { status: "SCHEDULED", total: 300, balanceDue: 0, completedAt: null, scheduledStart: new Date("2026-11-02T18:00:00Z") },
    ], now);
    expect(s).toMatchObject({ jobCount: 2, lifetimeValue: 620, balanceDue: 320 });
    expect(s.lastCompletedAt?.toISOString()).toBe("2026-09-01T18:00:00.000Z");
    expect(s.nextScheduledAt?.toISOString()).toBe("2026-11-02T18:00:00.000Z");
  });

  it("creates and edits manual customers with validation", async () => {
    await expect(createCustomer({ name: "  " })).rejects.toThrow(/Name is required/);
    await expect(createCustomer({ name: "X", email: "not-an-email" })).rejects.toThrow(/email/);
    const c = await createCustomer({ name: "Walk-in Wanda", phone: "480-555-0199", email: "" });
    expect(c).toMatchObject({ source: "MANUAL", email: null });
    await updateCustomer(c.id, { name: "Wanda Ruiz", city: "Mesa" });
    expect(await db.customer.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ name: "Wanda Ruiz", city: "Mesa" });
    expect((await listCustomers({ q: "4805550199" })).map((r) => r.name)).toEqual(["Wanda Ruiz"]);
  });
});
