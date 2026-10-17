import { NextResponse } from "next/server";
import { getUserOrNull } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { exportAll } from "@/lib/services/export";
import { today } from "@/lib/time";

export const runtime = "nodejs";

/** Full JSON export (Settings → Export my data). Signed-in only; logged in the Activity Log. */
export async function GET() {
  if (!(await getUserOrNull())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await exportAll();
  const total = Object.values(body.counts).reduce((a, b) => a + b, 0);
  await db.activityLog.create({ data: { actor: "USER", actionType: "data.export", summary: `Exported all data (${total} records)` } });
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="life-os-export-${today()}.json"`,
      "cache-control": "no-store",
    },
  });
}
