import "server-only";
import { z } from "zod";
import { addDays, atLocalMinutes, today } from "@/lib/time";
import { isMock } from "./mode";

/**
 * Housecall Pro public API (https://docs.housecallpro.com). Auth: `Authorization: Token <API key>`
 * (MAX plan → App Store → API). Schemas are deliberately loose: unknown fields are ignored and
 * everything optional, so a field Housecall Pro renames degrades to "missing" instead of failing
 * the whole sync. Amounts arrive in cents.
 */
const BASE = "https://api.housecallpro.com";

const address = z.object({ street: z.string().nullish(), street_line_2: z.string().nullish(), city: z.string().nullish(), state: z.string().nullish(), zip: z.string().nullish(), latitude: z.coerce.number().nullish(), longitude: z.coerce.number().nullish() }).partial();

export const hcpCustomerSchema = z.object({
  id: z.string(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  company: z.string().nullish(),
  email: z.string().nullish(),
  mobile_number: z.string().nullish(),
  home_number: z.string().nullish(),
  work_number: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  addresses: z.array(address).nullish(),
});
export type HcpCustomer = z.infer<typeof hcpCustomerSchema>;

export const hcpJobSchema = z.object({
  id: z.string(),
  invoice_number: z.union([z.string(), z.number()]).nullish(),
  description: z.string().nullish(),
  customer: z.object({ id: z.string() }).partial().nullish(),
  address: address.nullish(),
  work_status: z.string().nullish(),
  schedule: z.object({ scheduled_start: z.string().nullish(), scheduled_end: z.string().nullish() }).partial().nullish(),
  work_timestamps: z.object({ completed_at: z.string().nullish() }).partial().nullish(),
  total_amount: z.number().nullish(),
  outstanding_balance: z.number().nullish(),
  assigned_employees: z.array(z.object({ first_name: z.string().nullish(), last_name: z.string().nullish() }).partial()).nullish(),
});
export type HcpJob = z.infer<typeof hcpJobSchema>;

function parsePage<T extends z.ZodTypeAny>(raw: unknown, key: string, item: T): { totalPages: number; items: Array<z.infer<T>> } {
  const r = z.object({ total_pages: z.number().nullish() }).passthrough().parse(raw) as { total_pages?: number | null } & Record<string, unknown>;
  const list = Array.isArray(r[key]) ? (r[key] as unknown[]) : [];
  return { totalPages: r.total_pages ?? 1, items: list.flatMap((x) => { const p = item.safeParse(x); return p.success ? [p.data as z.infer<T>] : []; }) };
}

export class HousecallNotConfiguredError extends Error {
  constructor() {
    super("Housecall Pro isn't connected (set HOUSECALL_PRO_API_KEY).");
    this.name = "HousecallNotConfiguredError";
  }
}

export const housecallConfigured = () => isMock() || Boolean(process.env.HOUSECALL_PRO_API_KEY);

// ───────────── mapping (pure) ─────────────

export type MappedCustomer = { externalId: string; name: string; company: string | null; phone: string | null; email: string | null; address: string | null; city: string | null; lat: number | null; lng: number | null; tags: string[] };
export type MappedJob = { externalId: string; customerExternalId: string | null; title: string; address: string | null; lat: number | null; lng: number | null; scheduledStart: Date | null; scheduledEnd: Date | null; completedAt: Date | null; status: "UNSCHEDULED" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELED"; total: number; balanceDue: number; invoiceNumber: string | null; crew: string[] };

const clean = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);
const date = (s: string | null | undefined) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};
function formatAddress(a: z.infer<typeof address> | null | undefined): string | null {
  if (!a) return null;
  const street = [a.street, a.street_line_2].map(clean).filter(Boolean).join(" ");
  const tail = [clean(a.city), [clean(a.state), clean(a.zip)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [street, tail].filter(Boolean).join(", ") || null;
}

export function mapCustomer(c: HcpCustomer): MappedCustomer {
  const a = c.addresses?.[0];
  const person = [clean(c.first_name), clean(c.last_name)].filter(Boolean).join(" ");
  return {
    externalId: c.id,
    name: person || clean(c.company) || clean(c.email) || "Unnamed customer",
    company: clean(c.company),
    phone: clean(c.mobile_number) ?? clean(c.home_number) ?? clean(c.work_number),
    email: clean(c.email),
    address: formatAddress(a),
    city: clean(a?.city),
    lat: a?.latitude ?? null,
    lng: a?.longitude ?? null,
    tags: (c.tags ?? []).filter(Boolean),
  };
}

/** Housecall Pro work_status → our JobStatus. */
export function mapWorkStatus(s: string | null | undefined, hasSchedule: boolean): MappedJob["status"] {
  const v = (s ?? "").toLowerCase();
  if (v.includes("cancel")) return "CANCELED";
  if (v.startsWith("complete")) return "COMPLETED";
  if (v.includes("progress")) return "IN_PROGRESS";
  if (v.includes("needs scheduling") || v === "unscheduled") return "UNSCHEDULED";
  return hasSchedule ? "SCHEDULED" : "UNSCHEDULED";
}

export function mapJob(j: HcpJob): MappedJob {
  const start = date(j.schedule?.scheduled_start);
  const crew = (j.assigned_employees ?? []).map((e) => [clean(e.first_name), clean(e.last_name)].filter(Boolean).join(" ")).filter(Boolean);
  return {
    externalId: j.id,
    customerExternalId: j.customer?.id ?? null,
    title: clean(j.description) ?? "Window cleaning",
    address: formatAddress(j.address),
    lat: j.address?.latitude ?? null,
    lng: j.address?.longitude ?? null,
    scheduledStart: start,
    scheduledEnd: date(j.schedule?.scheduled_end),
    completedAt: date(j.work_timestamps?.completed_at),
    status: mapWorkStatus(j.work_status, Boolean(start)),
    total: Math.round(j.total_amount ?? 0) / 100,
    balanceDue: Math.round(j.outstanding_balance ?? 0) / 100,
    invoiceNumber: j.invoice_number == null ? null : String(j.invoice_number),
    crew,
  };
}

// ───────────── live client ─────────────

async function hcpGet(path: string, params: Record<string, string | number>, f: typeof fetch = fetch): Promise<unknown> {
  const key = process.env.HOUSECALL_PRO_API_KEY;
  if (!key) throw new HousecallNotConfiguredError();
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await f(url, { headers: { authorization: `Token ${key}`, accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (res.status === 401 || res.status === 403) throw new Error("Housecall Pro rejected the API key (check HOUSECALL_PRO_API_KEY and that your plan includes API access)");
  if (!res.ok) throw new Error(`Housecall Pro returned ${res.status} for ${path}`);
  return res.json();
}

const MAX_PAGES = 50;
async function allPages<T extends z.ZodTypeAny>(path: string, key: string, item: T, params: Record<string, string | number>, f?: typeof fetch): Promise<Array<z.infer<T>>> {
  const out: Array<z.infer<T>> = [];
  for (let p = 1; p <= MAX_PAGES; p++) {
    const r = parsePage(await hcpGet(path, { ...params, page: p, page_size: 100 }, f), key, item);
    out.push(...r.items);
    if (p >= r.totalPages) break;
  }
  return out;
}

/** Customers + jobs in a window (default: last 400 days through the next 90). */
export async function fetchHousecall(opts: { from?: Date; to?: Date; fetchImpl?: typeof fetch } = {}): Promise<{ customers: MappedCustomer[]; jobs: MappedJob[] }> {
  if (isMock()) return mockHousecall();
  const from = opts.from ?? new Date(Date.now() - 400 * 86_400_000);
  const to = opts.to ?? new Date(Date.now() + 90 * 86_400_000);
  const [customers, jobs] = await Promise.all([
    allPages("/customers", "customers", hcpCustomerSchema, {}, opts.fetchImpl),
    allPages("/jobs", "jobs", hcpJobSchema, { scheduled_start_min: from.toISOString(), scheduled_start_max: to.toISOString() }, opts.fetchImpl),
  ]);
  return { customers: customers.map(mapCustomer), jobs: jobs.map(mapJob) };
}

// ───────────── mock ─────────────

const MOCK_CUSTOMERS: Array<[string, string, string, string, number, number, number]> = [
  // id, first, last, street/city, lat, lng, months since last cleaning
  ["hc_c1", "Priya", "Patel", "2210 W Ocotillo Rd|Chandler", 33.2486, -111.8873, 6],
  ["hc_c2", "Sun Lakes", "HOA", "25025 S Sun Lakes Blvd|Sun Lakes", 33.2117, -111.8754, 3],
  ["hc_c3", "Minh", "Nguyen", "1544 E Elliot Rd|Gilbert", 33.3484, -111.7647, 12],
  ["hc_c4", "Desert Ridge", "Dental", "3100 S Gilbert Rd|Chandler", 33.2638, -111.7894, 1],
  ["hc_c5", "Jennifer", "Alvarez", "980 N Alma School Rd|Chandler", 33.3176, -111.8577, 7],
  ["hc_c6", "Tom", "Becker", "1420 W Ray Rd|Chandler", 33.3200, -111.8650, 13],
  ["hc_c7", "Linda", "Park", "4455 E Queen Creek Rd|Gilbert", 33.2617, -111.7380, 4],
  ["hc_c8", "Ocotillo Lakes", "Office Park", "2875 W Ray Rd|Chandler", 33.3205, -111.8890, 2],
];

export function mockHousecall(): { customers: MappedCustomer[]; jobs: MappedJob[] } {
  const t = today();
  const customers = MOCK_CUSTOMERS.map(([id, first, last, addr, lat, lng]) => {
    const [street, city] = addr.split("|") as [string, string];
    const isBiz = /HOA|Dental|Office/.test(last);
    return mapCustomer({ id, first_name: isBiz ? null : first, last_name: isBiz ? null : last, company: isBiz ? `${first} ${last}` : null, email: `${first.toLowerCase().replace(/\s/g, "")}@example.com`, mobile_number: `480555${String(1000 + Number(id.slice(4)) * 37).slice(0, 4)}`, tags: isBiz ? ["commercial"] : ["residential"], addresses: [{ street, city, state: "AZ", zip: "85224", latitude: lat, longitude: lng }] });
  });
  const jobs: MappedJob[] = [];
  MOCK_CUSTOMERS.forEach(([id, , last, addr, lat, lng, months], i) => {
    const [street, city] = addr.split("|") as [string, string];
    const total = [385, 520, 275, 180, 410, 340, 295, 950][i] ?? 300;
    const done = addDays(t, -Math.round(months * 30.4));
    jobs.push(mapJob({ id: `hc_j${i}a`, invoice_number: 1000 + i, description: /HOA|Office|Dental/.test(last) ? "Commercial exterior windows" : "Inside + outside windows, screens", customer: { id }, address: { street, city, state: "AZ", latitude: lat, longitude: lng }, work_status: "complete rated", schedule: { scheduled_start: atLocalMinutes(done, 8 * 60 + i * 30).toISOString(), scheduled_end: atLocalMinutes(done, 10 * 60 + i * 30).toISOString() }, work_timestamps: { completed_at: atLocalMinutes(done, 10 * 60 + i * 30).toISOString() }, total_amount: total * 100, outstanding_balance: i === 4 ? total * 100 : 0, assigned_employees: [{ first_name: i % 2 ? "Tyce" : "Grayden" }] }));
  });
  // Today's route + upcoming work
  const upcoming: Array<[number, number, number, number]> = [[0, 0, 8 * 60, 385], [1, 0, 10 * 60 + 30, 520], [2, 0, 14 * 60, 275], [6, 1, 9 * 60, 295], [7, 2, 7 * 60 + 30, 950]];
  upcoming.forEach(([ci, day, min, total], k) => {
    const c = MOCK_CUSTOMERS[ci]!;
    const [street, city] = c[3].split("|") as [string, string];
    const d = addDays(t, day);
    jobs.push(mapJob({ id: `hc_j_up${k}`, description: "Window cleaning", customer: { id: c[0] }, address: { street, city, state: "AZ", latitude: c[4], longitude: c[5] }, work_status: "scheduled", schedule: { scheduled_start: atLocalMinutes(d, min).toISOString(), scheduled_end: atLocalMinutes(d, min + 120).toISOString() }, total_amount: total * 100, outstanding_balance: total * 100, assigned_employees: [{ first_name: "Grayden" }, { first_name: "Tyce" }] }));
  });
  return { customers, jobs };
}
