import { NextResponse } from "next/server";
import { getQuote, quotePdf, verifyQuoteToken } from "@/lib/services/quotes";

export const runtime = "nodejs";

/**
 * Public, unauthenticated: the link in a quote text. The token is an HMAC of the quote id, so it
 * can't be guessed or altered; only the quote it names is ever served.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = verifyQuoteToken(token);
  const q = id ? await getQuote(id) : null;
  if (!q) return new NextResponse("This quote link isn't valid. Please contact us for an updated quote.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const pdf = await quotePdf(q);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="Quote-${q.number}.pdf"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
    },
  });
}
