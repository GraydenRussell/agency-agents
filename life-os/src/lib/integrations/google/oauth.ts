import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { isMock } from "../mode";

/**
 * Google OAuth (authorization code flow, offline access). All scopes are requested up front so
 * Gmail (Phase 4) doesn't need a second consent screen.
 */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
] as const;

export type GoogleTokens = { access_token: string; refresh_token?: string; expires_at: number; scope?: string };

export class GoogleAuthError extends Error {
  constructor(message: string, readonly needsReauth = false) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

function clientCreds() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new GoogleAuthError("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set");
  return { id, secret };
}

export function redirectUri(): string {
  return `${process.env.APP_URL ?? "http://localhost:3000"}/api/google/callback`;
}

export function buildAuthUrl(state: string): string {
  const { id } = clientCreds();
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // guarantees a refresh_token
    include_granted_scopes: "true",
    state,
  }).toString();
  return u.toString();
}

const tokenResponse = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
});

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (json as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new GoogleAuthError(`Google token error: ${err}`, err === "invalid_grant");
  }
  return tokenResponse.parse(json);
}

/** Decodes the email claim from an ID token (signature not needed: it came straight from Google over TLS). */
function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string };
    return claims.email ?? null;
  } catch {
    return null;
  }
}

export async function exchangeCode(code: string) {
  const { id, secret } = clientCreds();
  const t = await tokenRequest({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri(), grant_type: "authorization_code" });
  const tokens: GoogleTokens = { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + t.expires_in * 1000, scope: t.scope };
  const email = emailFromIdToken(t.id_token) ?? "unknown";
  const existing = await db.integrationAccount.findFirst({ where: { provider: "GOOGLE" } });
  // Keep the old refresh token if Google didn't send a new one.
  if (!tokens.refresh_token && existing?.encryptedTokens) tokens.refresh_token = decryptJson<GoogleTokens>(existing.encryptedTokens).refresh_token;
  const data = { accountEmail: email, encryptedTokens: encryptJson(tokens), scopes: (t.scope ?? "").split(" ").filter(Boolean), status: "CONNECTED" as const, lastError: null };
  if (existing) await db.integrationAccount.update({ where: { id: existing.id }, data });
  else await db.integrationAccount.create({ data: { provider: "GOOGLE", ...data } });
  return { email };
}

export async function googleAccount() {
  return db.integrationAccount.findFirst({ where: { provider: "GOOGLE" } });
}

/** Returns a valid access token, refreshing (and persisting) when within 60s of expiry. */
export async function getAccessToken(): Promise<string> {
  if (isMock()) return "mock-access-token";
  const account = await googleAccount();
  if (!account?.encryptedTokens || account.status === "DISCONNECTED") throw new GoogleAuthError("Google is not connected", true);
  const tokens = decryptJson<GoogleTokens>(account.encryptedTokens);
  if (tokens.expires_at - 60_000 > Date.now()) return tokens.access_token;
  if (!tokens.refresh_token) {
    await db.integrationAccount.update({ where: { id: account.id }, data: { status: "NEEDS_REAUTH", lastError: "No refresh token" } });
    throw new GoogleAuthError("Google needs to be reconnected", true);
  }
  try {
    const { id, secret } = clientCreds();
    const t = await tokenRequest({ client_id: id, client_secret: secret, refresh_token: tokens.refresh_token, grant_type: "refresh_token" });
    const next: GoogleTokens = { ...tokens, access_token: t.access_token, expires_at: Date.now() + t.expires_in * 1000 };
    await db.integrationAccount.update({ where: { id: account.id }, data: { encryptedTokens: encryptJson(next), status: "CONNECTED", lastError: null } });
    return next.access_token;
  } catch (e) {
    if (e instanceof GoogleAuthError && e.needsReauth) {
      await db.integrationAccount.update({ where: { id: account.id }, data: { status: "NEEDS_REAUTH", lastError: e.message } });
    }
    throw e;
  }
}

export async function disconnectGoogle() {
  const account = await googleAccount();
  if (!account) return;
  if (account.encryptedTokens && !isMock()) {
    const t = decryptJson<GoogleTokens>(account.encryptedTokens);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.refresh_token ?? t.access_token)}`, { method: "POST" }).catch(() => undefined);
  }
  await db.integrationAccount.update({ where: { id: account.id }, data: { status: "DISCONNECTED", encryptedTokens: null } });
}

/** Authenticated JSON fetch against Google APIs with typed errors. */
export class GoogleApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "GoogleApiError";
  }
}

export async function googleFetch(url: string, init: RequestInit & { json?: unknown } = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(url, { ...init, headers, body, signal: init.signal ?? AbortSignal.timeout(15_000) });
  if (res.status === 401) {
    const account = await googleAccount();
    if (account) await db.integrationAccount.update({ where: { id: account.id }, data: { status: "NEEDS_REAUTH", lastError: "401 from Google" } });
    throw new GoogleAuthError("Google rejected the access token", true);
  }
  return res;
}
