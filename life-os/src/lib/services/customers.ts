import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { fetchHousecall, housecallConfigured, HousecallNotConfiguredError } from "@/lib/integrations/housecall";
import type { Prisma } from "@/generated/prisma/client";

const HCP_ACCOUNT = "housecall-pro";

export type HousecallSyncResult = { customers: { created: number; updated: number }; jobs: { created: number; updated: number; unlinked: number } };

/**
 * Pulls customers + jobs from Housecall Pro and upserts them by Housecall id. Fields you edit in
 * Life OS (re-book interval, notes) are never overwritten; Housecall-owned fields always are.
 */
export async function syncHousecallPro(): Promise<HousecallSyncResult> {
  if (!housecallConfigured()) throw new HousecallNotConfiguredError();
  try {
    const { customers, jobs } = await fetchHousecall();
    const result: HousecallSyncResult = { customers: { created: 0, updated: 0 }, jobs: { created: 0, updated: 0, unlinked: 0 } };

    const existingC = new Map((await db.customer.findMany({ where: { externalId: { in: customers.map((c) => c.externalId) } }, select: { id: true, externalId: true } })).map((c) => [c.externalId!, c.id]));
    const idByExternal = new Map(existingC);
    for (const c of customers) {
      const data = { source: "HOUSECALL_PRO" as const, name: c.name, company: c.company, phone: c.phone, email: c.email, address: c.address, city: c.city, lat: c.lat, lng: c.lng, tags: c.tags };
      const row = await db.customer.upsert({ where: { externalId: c.externalId }, create: { externalId: c.externalId, ...data }, update: data, select: { id: true } });
      idByExternal.set(c.externalId, row.id);
      result.customers[existingC.has(c.externalId) ? "updated" : "created"]++;
    }

    // Jobs may reference customers outside this page of results; look those up too.
    const missing = [...new Set(jobs.map((j) => j.customerExternalId).filter((x): x is string => Boolean(x) && !idByExternal.has(x!)))];
    if (missing.length) for (const c of await db.customer.findMany({ where: { externalId: { in: missing } }, select: { id: true, externalId: true } })) idByExternal.set(c.externalId!, c.id);

    const existingJ = new Set((await db.job.findMany({ where: { externalId: { in: jobs.map((j) => j.externalId) } }, select: { externalId: true } })).map((j) => j.externalId!));
    for (const { customerExternalId, externalId, ...j } of jobs) {
      const customerId = customerExternalId ? (idByExternal.get(customerExternalId) ?? null) : null;
      if (!customerId) result.jobs.unlinked++;
      const data = { ...j, source: "HOUSECALL_PRO" as const, customerId };
      await db.job.upsert({ where: { externalId }, create: { externalId, ...data }, update: data });
      result.jobs[existingJ.has(externalId) ? "updated" : "created"]++;
    }

    await recordSync({ status: "CONNECTED", lastError: null, lastSyncAt: new Date() });
    return result;
  } catch (e) {
    await recordSync({ status: "ERROR", lastError: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

async function recordSync(data: Prisma.IntegrationAccountUpdateInput & { status: "CONNECTED" | "ERROR" }) {
  await db.integrationAccount.upsert({
    where: { provider_accountEmail: { provider: "HOUSECALL_PRO", accountEmail: HCP_ACCOUNT } },
    create: { ...(data as Omit<Prisma.IntegrationAccountCreateInput, "provider">), provider: "HOUSECALL_PRO", accountEmail: HCP_ACCOUNT, scopes: [] },
    update: data,
  });
}

export async function housecallSyncState() {
  const a = await db.integrationAccount.findUnique({ where: { provider_accountEmail: { provider: "HOUSECALL_PRO", accountEmail: HCP_ACCOUNT } } });
  return { configured: housecallConfigured(), lastSyncAt: a?.lastSyncAt ?? null, status: a?.status ?? null, lastError: a?.lastError ?? null };
}

// ───────────── reads ─────────────

export type CustomerRow = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  source: "HOUSECALL_PRO" | "MANUAL";
  tags: string[];
  jobCount: number;
  lifetimeValue: number;
  balanceDue: number;
  lastCompletedAt: Date | null;
  nextScheduledAt: Date | null;
};

/** Pure: roll a customer's jobs up into the list-row stats. */
export function customerStats(jobs: Array<{ status: string; total: number; balanceDue: number; completedAt: Date | null; scheduledStart: Date | null }>, now: Date = new Date()) {
  const done = jobs.filter((j) => j.status === "COMPLETED");
  const last = done.map((j) => j.completedAt ?? j.scheduledStart).filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const next = jobs.filter((j) => (j.status === "SCHEDULED" || j.status === "IN_PROGRESS") && j.scheduledStart && j.scheduledStart >= new Date(now.getTime() - 12 * 3_600_000)).map((j) => j.scheduledStart!).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  return {
    jobCount: done.length,
    lifetimeValue: Math.round(done.reduce((s, j) => s + j.total, 0) * 100) / 100,
    balanceDue: Math.round(jobs.filter((j) => j.status !== "CANCELED").reduce((s, j) => s + j.balanceDue, 0) * 100) / 100,
    lastCompletedAt: last,
    nextScheduledAt: next,
  };
}

export async function listCustomers(opts: { q?: string; take?: number } = {}): Promise<CustomerRow[]> {
  const q = opts.q?.trim() ?? "";
  const digits = q.replace(/\D/g, "");
  // Phone numbers are stored as typed ("480-555-0199"), so digit-only searches compare digits.
  const phoneSearch = digits.length >= 4 && !/[a-z]/i.test(q);
  const where: Prisma.CustomerWhereInput =
    q && !phoneSearch
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }, { address: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
      : phoneSearch
        ? { phone: { not: null } }
        : {};
  const rows = await db.customer.findMany({ where, orderBy: { name: "asc" }, take: phoneSearch ? undefined : (opts.take ?? 300), include: { jobs: { select: { status: true, total: true, balanceDue: true, completedAt: true, scheduledStart: true } } } });
  const matched = phoneSearch ? rows.filter((c) => (c.phone ?? "").replace(/\D/g, "").includes(digits)).slice(0, opts.take ?? 300) : rows;
  return matched.map(({ jobs, ...c }) => ({ id: c.id, name: c.name, company: c.company, phone: c.phone, email: c.email, city: c.city, source: c.source, tags: c.tags, ...customerStats(jobs) }));
}

export async function getCustomer(id: string) {
  const c = await db.customer.findUnique({ where: { id }, include: { jobs: { orderBy: [{ scheduledStart: { sort: "desc", nulls: "last" } }] } } });
  if (!c) return null;
  return { ...c, stats: customerStats(c.jobs) };
}

export const customerInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  company: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.union([z.string().trim().email("That email doesn't look right"), z.literal("")]).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  rebookMonths: z.coerce.number().int().min(1).max(36).optional().nullable(),
  rebookOptOut: z.boolean().optional(),
  notes: z.string().max(5000).optional().nullable(),
});
export type CustomerInput = z.infer<typeof customerInput>;

const blankToNull = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v])) as T;

export async function createCustomer(input: CustomerInput) {
  const data = blankToNull(customerInput.parse(input));
  return db.customer.create({ data: { ...data, source: "MANUAL", tags: [] } });
}

/** Housecall-synced customers only accept Life OS–owned fields; manual ones accept everything. */
export async function updateCustomer(id: string, input: Partial<CustomerInput>) {
  const c = await db.customer.findUniqueOrThrow({ where: { id } });
  const data = blankToNull(customerInput.partial().parse(input));
  const allowed = c.source === "HOUSECALL_PRO" ? { rebookMonths: data.rebookMonths, rebookOptOut: data.rebookOptOut, notes: data.notes } : data;
  return db.customer.update({ where: { id }, data: Object.fromEntries(Object.entries(allowed).filter(([, v]) => v !== undefined)) });
}
