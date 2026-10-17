import { describe, expect, it } from "vitest";
import { checklist, itemStatus, runTest, SETUP_ITEMS, summary, type Env } from "@/lib/setup/checklist";
import { definedKeys, generateSecrets, linesToAppend } from "@/lib/setup/secrets";

const item = (id: string) => {
  const i = SETUP_ITEMS.find((x) => x.id === id);
  if (!i) throw new Error(id);
  return i;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A full production-like env built from freshly generated secrets plus plausible fake keys. */
function fullEnv(): Env {
  return {
    ...generateSecrets(),
    DATABASE_URL: "postgresql://u:p@db:6543/postgres",
    DIRECT_URL: "postgresql://u:p@db:5432/postgres",
    NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    ALLOWED_EMAIL: "grayden@rapidwindowcleaning.com",
    AUTH_MODE: "supabase",
    ANTHROPIC_API_KEY: "sk-ant-test-secret-value",
    GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "gsecret",
    APP_URL: "https://life.example.org",
    VAPID_SUBJECT: "mailto:me@example.org",
    TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`,
    TWILIO_AUTH_TOKEN: "twilio-secret-token",
    TWILIO_FROM_NUMBER: "+14805550100",
    MY_PHONE_NUMBER: "+14805550199",
    GITHUB_TOKEN: "ghp_secret",
    VERCEL_TOKEN: "vercel_secret",
    ADMIN_DASH_URL: "https://dash.example.org",
    INTEGRATION_MODE: "live",
  };
}

describe("setup checklist", () => {
  it("an empty env has every item missing and nothing ready", () => {
    const s = summary({});
    expect(s.ready).toBe(0);
    expect(s.requiredReady).toBe(0);
    expect(checklist({}).every((i) => i.status === "missing")).toBe(true);
  });

  it("a complete, valid env is fully ready", () => {
    const env = fullEnv();
    const notReady = checklist(env).filter((i) => i.status !== "ready");
    expect(notReady.map((i) => `${i.id}: ${[...i.missing, ...i.problems].join(", ")}`)).toEqual([]);
  });

  it("generated secrets pass their own validators", () => {
    const env = { ...generateSecrets() };
    expect(itemStatus(item("secrets"), env)).toMatchObject({ status: "ready" });
    expect(itemStatus(item("push"), { ...env, VAPID_SUBJECT: "mailto:a@b.co" }).problems).toEqual([]);
  });

  it("flags dev placeholders and malformed values as invalid", () => {
    const env = { ...fullEnv(), CRON_SECRET: "dev-cron-secret-change-me", AUTH_MODE: "dev", ALLOWED_EMAIL: "grayden@example.com", TWILIO_FROM_NUMBER: "480-555-0100", INTEGRATION_MODE: "mock", ANTHROPIC_API_KEY: "nope" };
    const byId = Object.fromEntries(checklist(env).map((i) => [i.id, i]));
    expect(byId.secrets?.problems.join()).toContain("placeholder");
    expect(byId.auth?.problems).toEqual(expect.arrayContaining([expect.stringContaining("AUTH_MODE"), expect.stringContaining("ALLOWED_EMAIL")]));
    expect(byId.twilio?.problems.join()).toContain("+1XXXXXXXXXX");
    expect(byId.golive?.status).toBe("invalid");
    expect(byId.anthropic?.problems.join()).toContain("sk-ant-");
  });

  it("runTest reports missing/invalid without touching the network", async () => {
    const fetcher = () => Promise.reject(new Error("network must not be called"));
    expect(await runTest("anthropic", {}, fetcher)).toEqual({ ok: false, detail: "Missing: ANTHROPIC_API_KEY" });
    expect((await runTest("twilio", { ...fullEnv(), MY_PHONE_NUMBER: "123" }, fetcher)).ok).toBe(false);
    expect(await runTest("nope", {}, fetcher)).toMatchObject({ ok: false });
  });

  it("live tests interpret service responses", async () => {
    const env = fullEnv();
    const calls: string[] = [];
    const fetcher = (async (url: string | URL | Request) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("anthropic")) return json({ id: "claude-opus-5-5" });
      if (u.includes("supabase")) return json({ disable_signup: false, external: { email: true } });
      if (u.includes("twilio")) return json({ status: "active", type: "Trial" });
      if (u.includes("github")) return json({ login: "GraydenRussell" });
      if (u.includes("vercel")) return json({}, 401);
      if (u.includes("dash")) return json({ revenue: { today: 1 } });
      return json({}, 500);
    }) as typeof fetch;
    expect(await runTest("anthropic", env, fetcher)).toMatchObject({ ok: true });
    expect(await runTest("auth", env, fetcher)).toMatchObject({ ok: false, detail: expect.stringContaining("sign-ups") });
    expect(await runTest("twilio", env, fetcher)).toMatchObject({ ok: true, detail: expect.stringContaining("trial") });
    expect(await runTest("github", env, fetcher)).toMatchObject({ ok: true, detail: expect.stringContaining("GraydenRussell") });
    expect(await runTest("vercel", env, fetcher)).toMatchObject({ ok: false, detail: expect.stringContaining("401") });
    expect(await runTest("business", env, fetcher)).toMatchObject({ ok: true });
    expect(await runTest("google", env, fetcher)).toMatchObject({ ok: true, detail: expect.stringContaining("no live test") });
    expect(calls.some((c) => c.includes("/v1/models/claude-opus-5-5"))).toBe(true);
  });

  it("a missing model and network failures read clearly", async () => {
    const env = fullEnv();
    expect(await runTest("anthropic", env, (async () => json({}, 404)) as unknown as typeof fetch)).toMatchObject({ ok: false, detail: expect.stringContaining("isn't available") });
    expect(await runTest("github", env, (() => Promise.reject(new Error("ECONNREFUSED"))) as typeof fetch)).toMatchObject({ ok: false, detail: expect.stringContaining("Could not connect") });
  });

  it("never echoes secret values in statuses or test results", async () => {
    const env = fullEnv();
    const secrets = [env.ANTHROPIC_API_KEY, env.TWILIO_AUTH_TOKEN, env.ENCRYPTION_KEY, env.GITHUB_TOKEN, env.VAPID_PRIVATE_KEY].filter(Boolean) as string[];
    const results = await Promise.all(SETUP_ITEMS.map((i) => runTest(i.id, env, (async () => json({}, 403)) as unknown as typeof fetch)));
    const text = JSON.stringify([checklist(env), results]);
    for (const s of secrets) expect(text).not.toContain(s);
  });
});

describe("setup secrets", () => {
  it("generates distinct, well-formed values each time", () => {
    const a = generateSecrets();
    const b = generateSecrets();
    expect(Buffer.from(a.ENCRYPTION_KEY!, "base64")).toHaveLength(32);
    expect(a.CRON_SECRET).toMatch(/^[0-9a-f]{64}$/);
    expect(a.ENCRYPTION_KEY).not.toBe(b.ENCRYPTION_KEY);
    expect(a.NEXT_PUBLIC_VAPID_PUBLIC_KEY).not.toBe(b.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  });

  it("only appends keys that have no value yet", () => {
    const existing = ["ENCRYPTION_KEY=keepme", "CRON_SECRET=", "# PROJECTS_SYNC_TOKEN=commented", 'LIFE_OS_API_TOKEN=""', ""].join("\n");
    expect([...definedKeys(existing)]).toEqual(["ENCRYPTION_KEY"]);
    const lines = linesToAppend(existing, { ENCRYPTION_KEY: "new", CRON_SECRET: "c", PROJECTS_SYNC_TOKEN: "p", LIFE_OS_API_TOKEN: "l" });
    expect(lines).toEqual(["CRON_SECRET=c", "PROJECTS_SYNC_TOKEN=p", "LIFE_OS_API_TOKEN=l"]);
  });
});
