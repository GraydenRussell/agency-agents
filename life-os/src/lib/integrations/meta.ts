import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { safeEqual } from "@/lib/crypto";
import { isMock } from "./mode";

/**
 * Meta (Facebook/Instagram) Lead Ads. Meta POSTs a `leadgen` webhook with only ids; we verify
 * the X-Hub-Signature-256 HMAC with the app secret, then fetch the form answers from the Graph API
 * with a Page access token (leads_retrieval). Docs: developers.facebook.com/docs/marketing-api/guides/lead-ads
 */
const GRAPH = "https://graph.facebook.com/v21.0";

export const metaLeadsConfigured = () => isMock() || Boolean(process.env.META_APP_SECRET && process.env.META_VERIFY_TOKEN && process.env.META_PAGE_ACCESS_TOKEN);

/** `sha256=<hex>` over the raw request body. */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string | undefined = process.env.META_APP_SECRET): boolean {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return safeEqual(header.slice(7), expected);
}

const webhookSchema = z.object({
  object: z.string(),
  entry: z.array(z.object({ id: z.string().optional(), changes: z.array(z.object({ field: z.string(), value: z.object({ leadgen_id: z.union([z.string(), z.number()]).optional(), form_id: z.union([z.string(), z.number()]).optional(), ad_id: z.union([z.string(), z.number()]).optional(), page_id: z.union([z.string(), z.number()]).optional(), created_time: z.number().optional() }).passthrough() })).default([]) })).default([]),
});

export type LeadgenRef = { leadgenId: string; formId: string | null; adId: string | null; createdAt: Date | null };

export function parseLeadgenWebhook(body: unknown): LeadgenRef[] {
  const p = webhookSchema.safeParse(body);
  if (!p.success || p.data.object !== "page") return [];
  return p.data.entry.flatMap((e) => e.changes.filter((c) => c.field === "leadgen" && c.value.leadgen_id != null).map((c) => ({ leadgenId: String(c.value.leadgen_id), formId: c.value.form_id == null ? null : String(c.value.form_id), adId: c.value.ad_id == null ? null : String(c.value.ad_id), createdAt: c.value.created_time ? new Date(c.value.created_time * 1000) : null })));
}

const leadSchema = z.object({ id: z.string(), created_time: z.string().optional(), field_data: z.array(z.object({ name: z.string(), values: z.array(z.string()).default([]) })).default([]), ad_name: z.string().optional(), form_id: z.string().optional() });

/** Graph API lead → flat field map (field names as set on the Instant Form, e.g. full_name, phone_number). */
export async function fetchMetaLead(leadgenId: string, f: typeof fetch = fetch): Promise<{ fields: Record<string, string>; createdAt: Date | null; adName: string | null }> {
  if (isMock()) return { fields: { full_name: "Ashley Romero", phone_number: "+14805550147", email: "ashley.r@example.com", city: "Gilbert", "how_many_windows?": "about 25, two story" }, createdAt: new Date(), adName: "Fall window special" };
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error("META_PAGE_ACCESS_TOKEN is not set");
  const url = new URL(`${GRAPH}/${encodeURIComponent(leadgenId)}`);
  url.searchParams.set("fields", "id,created_time,field_data,ad_name,form_id");
  url.searchParams.set("access_token", token);
  const res = await f(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Meta Graph API returned ${res.status} for lead ${leadgenId}`);
  const lead = leadSchema.parse(await res.json());
  return { fields: Object.fromEntries(lead.field_data.map((d) => [d.name, d.values.join(", ")])), createdAt: lead.created_time ? new Date(lead.created_time) : null, adName: lead.ad_name ?? null };
}
