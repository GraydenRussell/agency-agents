import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getQuote, quotePdf } from "@/lib/services/quotes";

export const runtime = "nodejs";

/** Owner preview/download of a quote PDF (signed-in only; customers use /q/<token>). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const q = await getQuote(id);
  if (!q) return NextResponse.json({ error: "not found" }, { status: 404 });
  const download = new URL(req.url).searchParams.has("download");
  return new NextResponse(Buffer.from(await quotePdf(q)), {
    headers: { "content-type": "application/pdf", "content-disposition": `${download ? "attachment" : "inline"}; filename="Quote-${q.number}.pdf"`, "cache-control": "private, no-store" },
  });
}
