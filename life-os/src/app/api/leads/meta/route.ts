import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { fetchMetaLead, parseLeadgenWebhook, verifyMetaSignature } from "@/lib/integrations/meta";
import { runAfter } from "@/lib/leads-intake";
import { ingestLead, processNewLead } from "@/lib/services/leads";

export const runtime = "nodejs";

/** Meta's one-time subscription check: echo hub.challenge if the verify token matches. */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const token = process.env.META_VERIFY_TOKEN;
  if (p.get("hub.mode") === "subscribe" && token && safeEqual(p.get("hub.verify_token") ?? "", token)) return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  return new NextResponse("forbidden", { status: 403 });
}

/** Lead Ads `leadgen` webhook: verify signature, answer 200 at once, fetch + ingest after. */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const refs = parseLeadgenWebhook(body);
  runAfter(async () => {
    for (const ref of refs) {
      try {
        const lead = await fetchMetaLead(ref.leadgenId);
        const r = await ingestLead({ source: "META", externalId: ref.leadgenId, sourceDetail: lead.adName, raw: lead.fields, receivedAt: lead.createdAt ?? ref.createdAt ?? new Date() });
        if (r.status === "created") await processNewLead(r.lead.id);
      } catch (e) {
        console.error("[meta.leadgen]", ref.leadgenId, e);
      }
    }
  });
  return NextResponse.json({ ok: true, received: refs.length });
}
