import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getReceipt } from "@/lib/services/expenses";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const r = await getReceipt(id);
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(Buffer.from(r.data), { headers: { "content-type": r.mime, "cache-control": "private, max-age=3600", "content-disposition": "inline", "x-content-type-options": "nosniff" } });
}
