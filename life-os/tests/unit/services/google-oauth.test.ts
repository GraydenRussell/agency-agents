import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { buildAuthUrl, exchangeCode, getAccessToken, GoogleAuthError, type GoogleTokens } from "@/lib/integrations/google/oauth";
import { resetDb } from "../../setup/db";

const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.y`;

beforeEach(async () => {
  await resetDb();
  process.env.INTEGRATION_MODE = "live";
  process.env.GOOGLE_CLIENT_ID = "cid";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  process.env.APP_URL = "https://life.example.com";
});
afterEach(() => {
  process.env.INTEGRATION_MODE = "mock";
  vi.unstubAllGlobals();
});

describe("Google OAuth", () => {
  it("builds a consent URL with offline access and all scopes", () => {
    const u = new URL(buildAuthUrl("state123"));
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("redirect_uri")).toBe("https://life.example.com/api/google/callback");
    expect(u.searchParams.get("scope")).toContain("gmail.modify");
    expect(u.searchParams.get("state")).toBe("state123");
  });

  it("exchanges a code and stores encrypted tokens", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ access_token: "at1", refresh_token: "rt1", expires_in: 3600, scope: "openid email", id_token: idToken("grayden@example.com") })));
    const { email } = await exchangeCode("code");
    expect(email).toBe("grayden@example.com");
    const acct = await db.integrationAccount.findFirstOrThrow({ where: { provider: "GOOGLE" } });
    expect(acct.encryptedTokens).not.toContain("rt1");
    expect(decryptJson<GoogleTokens>(acct.encryptedTokens as string).refresh_token).toBe("rt1");
    expect(await getAccessToken()).toBe("at1");
  });

  it("refreshes an expired token and persists it", async () => {
    await db.integrationAccount.create({ data: { provider: "GOOGLE", accountEmail: "g@x.com", status: "CONNECTED", encryptedTokens: encryptJson({ access_token: "old", refresh_token: "rt", expires_at: Date.now() - 1000 }) } });
    const fetchMock = vi.fn(async () => Response.json({ access_token: "new", expires_in: 3600 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getAccessToken()).toBe("new");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await getAccessToken()).toBe("new"); // cached now
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marks the account NEEDS_REAUTH on invalid_grant", async () => {
    await db.integrationAccount.create({ data: { provider: "GOOGLE", accountEmail: "g@x.com", status: "CONNECTED", encryptedTokens: encryptJson({ access_token: "old", refresh_token: "revoked", expires_at: 0 }) } });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "invalid_grant" }, { status: 400 })));
    await expect(getAccessToken()).rejects.toBeInstanceOf(GoogleAuthError);
    expect((await db.integrationAccount.findFirstOrThrow({ where: { provider: "GOOGLE" } })).status).toBe("NEEDS_REAUTH");
  });
});
