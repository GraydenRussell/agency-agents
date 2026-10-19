import { NextResponse } from "next/server";
import { readFields, runAfter, websiteWebhookAuthorized } from "@/lib/leads-intake";
import { ingestLead, processNewLead } from "@/lib/services/leads";

export const runtime = "nodejs";

/**
 * Website / form-builder leads. POST JSON, urlencoded, or multipart. Auth: see websiteWebhookAuthorized.
 * Optional: `?form=Contact page` labels the source; `?redirect=https://…` sends a browser back to a
 * thank-you page (plain HTML forms).
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const raw = await request.text();
  if (raw.length > 100_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  if (!websiteWebhookAuthorized(raw, request.headers, url)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let fields: Record<string, unknown>;
  try {
    fields = await readFields(raw, request.headers.get("content-type") ?? "");
  } catch {
    return NextResponse.json({ error: "unreadable body" }, { status: 400 });
  }
  const form = url.searchParams.get("form") ?? (typeof fields.form_name === "string" ? fields.form_name : typeof fields.source === "string" ? fields.source : null);
  const submissionId = ["submission_id", "submissionId", "id", "entry_id"].map((k) => fields[k]).find((v) => typeof v === "string" || typeof v === "number");
  const r = await ingestLead({ source: "WEBSITE", raw: fields, externalId: submissionId == null ? null : String(submissionId), sourceDetail: form ? String(form).slice(0, 120) : null });
  if (r.status === "created") runAfter(() => processNewLead(r.lead.id));

  const redirect = url.searchParams.get("redirect");
  if (redirect && /^https:\/\//.test(redirect)) return NextResponse.redirect(redirect, 303);
  return NextResponse.json({ ok: true, status: r.status }, { status: r.status === "created" ? 201 : 200 });
}
