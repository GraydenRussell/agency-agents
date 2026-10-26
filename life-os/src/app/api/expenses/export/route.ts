import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { exportYearCsv } from "@/lib/services/expenses";

export const runtime = "nodejs";

/** CSV for your accountant: ?year=2026&kind=expenses|mileage */
export async function GET(req: Request) {
  await requireUser();
  const p = new URL(req.url).searchParams;
  const year = /^\d{4}$/.test(p.get("year") ?? "") ? p.get("year")! : String(new Date().getFullYear());
  const kind = p.get("kind") === "mileage" ? "mileage" : "expenses";
  const csv = (await exportYearCsv(year))[kind];
  await db.activityLog.create({ data: { actor: "USER", actionType: "expenses.export", summary: `Exported ${year} ${kind} CSV`, input: { year, kind } } });
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="rapid-${kind}-${year}.csv"`, "cache-control": "private, no-store" } });
}
