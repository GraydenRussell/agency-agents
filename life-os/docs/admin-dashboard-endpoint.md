# Admin dashboard endpoint for Life OS

Life OS reads Rapid Window Cleaning numbers from your existing admin dashboard (`Rapid-Windows-dash`) through one
small, read-only, token-protected endpoint. The dashboard keeps owning the Housecall Pro sync and analytics; Life
OS just displays a summary and links back.

## 1. Add the route to the admin dashboard

Create `app/api/life-os/summary/route.ts` in the dashboard repo with the code below. Replace the four `TODO`
queries with your real tables (the GitHub repo was empty when Life OS was built, so the table names are guesses).

```ts
// app/api/life-os/summary/route.ts  (in Rapid-Windows-dash)
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma"; // your existing Prisma client

export const dynamic = "force-dynamic";

const PHX_OFFSET_MS = -7 * 3_600_000; // America/Phoenix, no DST
const phxMidnight = (d = new Date()) => {
  const wall = new Date(d.getTime() + PHX_OFFSET_MS);
  return new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) - PHX_OFFSET_MS);
};

function authorized(req: Request) {
  const expected = process.env.LIFE_OS_API_TOKEN ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return expected.length >= 24 && got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const todayStart = phxMidnight();
  const tomorrow = new Date(todayStart.getTime() + 86_400_000);
  const dow = (new Date(todayStart.getTime() + PHX_OFFSET_MS).getUTCDay() + 6) % 7; // Monday = 0
  const weekStart = new Date(todayStart.getTime() - dow * 86_400_000);
  const wall = new Date(todayStart.getTime() - PHX_OFFSET_MS + 12 * 3_600_000);
  const monthStart = phxMidnight(new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), 1, 19)));
  const lastMonthStart = phxMidnight(new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() - 1, 1, 19)));

  // TODO: revenue = sum of paid/invoiced job totals in each window (adjust table/columns).
  const revenue = async (from: Date, to: Date) =>
    Number((await prisma.job.aggregate({ where: { completedAt: { gte: from, lt: to } }, _sum: { total: true } }))._sum.total ?? 0);

  // TODO: today's scheduled jobs.
  const jobsToday = await prisma.job.findMany({ where: { scheduledStart: { gte: todayStart, lt: tomorrow } }, orderBy: { scheduledStart: "asc" } });

  // TODO: leads.
  const recentLeads = await prisma.lead.findMany({ orderBy: { createdAt: "desc" }, take: 5 });

  const [today, wtd, mtd, lastMonth, scheduledThisWeek, completedThisWeek, new24h, open] = await Promise.all([
    revenue(todayStart, tomorrow),
    revenue(weekStart, tomorrow),
    revenue(monthStart, tomorrow),
    revenue(lastMonthStart, monthStart),
    prisma.job.count({ where: { scheduledStart: { gte: weekStart, lt: new Date(weekStart.getTime() + 7 * 86_400_000) } } }),
    prisma.job.count({ where: { completedAt: { gte: weekStart, lt: tomorrow } } }),
    prisma.lead.count({ where: { createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
    prisma.lead.count({ where: { status: { in: ["new", "contacted", "quoted"] } } }),
  ]);

  // TODO (optional): your dashboard's existing Daily Brief, if stored.
  const brief = null as null | { markdown: string; generatedAt: Date };

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return NextResponse.json({
    asOf: new Date().toISOString(),
    revenue: { today, wtd, mtd, lastMonth, currency: "USD" },
    jobs: {
      today: jobsToday.map((j) => ({ id: String(j.id), customer: j.customerName, address: j.address ?? null, start: j.scheduledStart.toISOString(), end: j.scheduledEnd?.toISOString() ?? null, total: j.total == null ? null : Number(j.total), status: j.status ?? null })),
      scheduledThisWeek,
      completedThisWeek,
    },
    leads: { new24h, open, recent: recentLeads.map((l) => ({ id: String(l.id), name: l.name, source: l.source ?? null, createdAt: l.createdAt.toISOString(), status: l.status ?? null })) },
    dailyBrief: brief ? { markdown: brief.markdown, generatedAt: brief.generatedAt.toISOString() } : null,
    links: { dashboard: base || null, jobs: base ? `${base}/jobs` : null, leads: base ? `${base}/leads` : null },
  });
}
```

## 2. Configure both apps

1. Generate a token: `openssl rand -hex 32`.
2. Admin dashboard (Vercel env): `LIFE_OS_API_TOKEN=<token>`.
3. Life OS (Vercel env): `ADMIN_DASH_URL=https://<dashboard-domain>` and `LIFE_OS_API_TOKEN=<same token>`.
4. Life OS → Business should now show live numbers; the daily brief, Today page, and the assistant's
   `business_numbers` tool use the same data (cached 5 minutes).

## Response contract

Life OS validates the response with the Zod schema in `src/lib/integrations/business.ts`. Required fields:

| Field | Type |
|---|---|
| `asOf` | ISO timestamp |
| `revenue.today / wtd / mtd / lastMonth` | number (USD) |
| `jobs.today[]` | `{ id, customer, address?, start (ISO), end?, total?, status? }` |
| `jobs.scheduledThisWeek / completedThisWeek` | number |
| `leads.new24h / open` | number |
| `leads.recent[]` | `{ id, name, source?, createdAt (ISO), status? }` |
| `dailyBrief` | `{ markdown, generatedAt }` or `null` |
| `links` | `{ dashboard?, jobs?, leads? }` (optional) |

Test it: `curl -H "Authorization: Bearer $TOKEN" https://<dashboard>/api/life-os/summary | jq`.
