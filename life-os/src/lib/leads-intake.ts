import "server-only";
import { after } from "next/server";
import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/crypto";

/** Run work after the response is sent (webhooks must answer fast); inline when there's no request scope (tests). */
export function runAfter(fn: () => Promise<unknown>) {
  const safe = () => fn().catch((e) => console.error("[after]", e));
  try {
    after(safe);
  } catch {
    void safe();
  }
}

/**
 * Website-form webhook auth, in order of preference:
 * 1. `X-LifeOS-Signature: sha256=<hex HMAC of the raw body>` (Zapier/Make/custom code)
 * 2. `Authorization: Bearer <secret>` (most webhook tools)
 * 3. `?key=<secret>` in the URL (plain HTML forms and builders that can't set headers)
 */
export function websiteWebhookAuthorized(rawBody: string, headers: Headers, url: URL, secret: string | undefined = process.env.LEAD_WEBHOOK_SECRET): boolean {
  if (!secret || secret.length < 16) return false;
  const sig = headers.get("x-lifeos-signature");
  if (sig?.startsWith("sha256=")) return safeEqual(sig.slice(7), createHmac("sha256", secret).update(rawBody, "utf8").digest("hex"));
  const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer) return safeEqual(bearer, secret);
  const key = url.searchParams.get("key");
  return key ? safeEqual(key, secret) : false;
}

/** JSON, urlencoded, or multipart body → flat string map. */
export async function readFields(rawBody: string, contentType: string): Promise<Record<string, unknown>> {
  if (contentType.includes("application/json")) {
    const j = JSON.parse(rawBody || "{}") as unknown;
    if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("Expected a JSON object");
    // Some tools nest the fields: { data: {...} } / { fields: {...} }
    const o = j as Record<string, unknown>;
    const inner = ["data", "fields", "payload", "submission"].map((k) => o[k]).find((v) => v && typeof v === "object" && !Array.isArray(v));
    return { ...o, ...(inner as Record<string, unknown> | undefined) };
  }
  if (contentType.includes("multipart/form-data")) {
    const fd = await new Response(rawBody, { headers: { "content-type": contentType } }).formData();
    return Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));
  }
  return Object.fromEntries(new URLSearchParams(rawBody));
}
