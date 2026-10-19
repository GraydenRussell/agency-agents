/**
 * The "connect your APIs" checklist: every external account Life OS needs, in the order to set them up,
 * what each one powers, which env vars it reads, and a live connection test.
 *
 * Deliberately free of `server-only`/Next imports so `npm run doctor` (tsx) and the /setup page share it.
 * Results never include secret values.
 */

export type Env = Record<string, string | undefined>;
export type CheckStatus = "ready" | "missing" | "invalid";
export type TestResult = { ok: boolean; detail: string };

export type SetupItem = {
  id: string;
  name: string;
  /** What breaks or stays on sample data without it. */
  powers: string;
  /** Needed before the app can run in production at all. */
  required: boolean;
  vars: string[];
  /** Ordered, concrete steps. */
  steps: string[];
  link?: { label: string; href: string };
  /** Format checks that need no network. Returns problems (empty = fine). */
  validate?: (env: Env) => string[];
  /** Live check against the real service. Only runs when every var is present and valid. */
  test?: (env: Env, fetcher?: typeof fetch) => Promise<TestResult>;
};

export type ItemStatus = { id: string; status: CheckStatus; missing: string[]; problems: string[] };

const has = (env: Env, k: string) => Boolean(env[k]?.trim());
const b64len = (v: string, url = false) => {
  try {
    return Buffer.from(url ? v.replace(/-/g, "+").replace(/_/g, "/") : v, "base64").length;
  } catch {
    return 0;
  }
};
const e164 = /^\+[1-9]\d{7,14}$/;

async function timed(fetcher: typeof fetch, url: string, init: RequestInit = {}): Promise<Response> {
  return fetcher(url, { ...init, signal: AbortSignal.timeout(10_000) });
}

function httpFail(service: string, res: Response): TestResult {
  const hint = res.status === 401 || res.status === 403 ? " (check the key/token)" : res.status === 404 ? " (check the URL)" : "";
  return { ok: false, detail: `${service} answered ${res.status}${hint}` };
}

async function guard(fn: () => Promise<TestResult>): Promise<TestResult> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, detail: /timeout|aborted/i.test(msg) ? "Timed out after 10s" : `Could not connect: ${msg}` };
  }
}

export const SETUP_ITEMS: SetupItem[] = [
  {
    id: "secrets",
    name: "App secrets",
    powers: "Encrypts Google tokens at rest and protects the scheduled-job endpoint.",
    required: true,
    vars: ["ENCRYPTION_KEY", "CRON_SECRET", "PROJECTS_SYNC_TOKEN"],
    steps: ["Run `npm run setup:secrets` and paste the printed lines into Vercel (or add `--write` to fill .env.local).", "Keep ENCRYPTION_KEY forever: changing it disconnects Google."],
    validate: (env) => {
      const p: string[] = [];
      if (has(env, "ENCRYPTION_KEY") && b64len(env.ENCRYPTION_KEY!) !== 32) p.push("ENCRYPTION_KEY must be 32 bytes, base64");
      if (has(env, "CRON_SECRET") && env.CRON_SECRET!.length < 16) p.push("CRON_SECRET must be at least 16 characters");
      if (has(env, "CRON_SECRET") && /change-me|dev-cron/i.test(env.CRON_SECRET!)) p.push("CRON_SECRET is still the development placeholder");
      if (has(env, "PROJECTS_SYNC_TOKEN") && env.PROJECTS_SYNC_TOKEN!.length < 16) p.push("PROJECTS_SYNC_TOKEN must be at least 16 characters");
      return p;
    },
  },
  {
    id: "database",
    name: "Database (Supabase Postgres)",
    powers: "Everything: tasks, calendar cache, inbox, assistant memory, approvals, activity log.",
    required: true,
    vars: ["DATABASE_URL", "DIRECT_URL"],
    steps: [
      "Create a new Supabase project (region us-west-1).",
      "Project Settings → Database → Connection string: Transaction pooler (6543) → DATABASE_URL, Session pooler (5432) → DIRECT_URL.",
      "From your machine: `npm run db:deploy`, then run prisma/sql/rls.sql in the Supabase SQL editor.",
    ],
    link: { label: "Supabase dashboard", href: "https://supabase.com/dashboard" },
    validate: (env) => ["DATABASE_URL", "DIRECT_URL"].filter((k) => has(env, k) && !/^postgres(ql)?:\/\//.test(env[k]!)).map((k) => `${k} must start with postgresql://`),
  },
  {
    id: "auth",
    name: "Login + 2FA (Supabase Auth)",
    powers: "Your sign-in with an authenticator-app code. Without it the app refuses to run on Vercel.",
    required: true,
    vars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "ALLOWED_EMAIL", "AUTH_MODE"],
    steps: [
      "Project Settings → API: copy the Project URL and the anon public key.",
      "Authentication → Users → Add user with your email (mark confirmed). Set ALLOWED_EMAIL to the same address.",
      "Authentication → Multi-Factor: enable TOTP. Sign In / Up: turn off new sign-ups.",
      "Set AUTH_MODE=supabase.",
    ],
    link: { label: "Supabase Auth settings", href: "https://supabase.com/dashboard" },
    validate: (env) => {
      const p: string[] = [];
      if (has(env, "NEXT_PUBLIC_SUPABASE_URL") && !/^https:\/\/.+/.test(env.NEXT_PUBLIC_SUPABASE_URL!)) p.push("NEXT_PUBLIC_SUPABASE_URL must be an https URL");
      if (has(env, "AUTH_MODE") && env.AUTH_MODE !== "supabase") p.push("AUTH_MODE must be supabase in production");
      if (has(env, "ALLOWED_EMAIL") && /example\.com$/i.test(env.ALLOWED_EMAIL!)) p.push("ALLOWED_EMAIL is still a placeholder");
      return p;
    },
    test: (env, f = fetch) =>
      guard(async () => {
        const res = await timed(f, `${env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")}/auth/v1/settings`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } });
        if (!res.ok) return httpFail("Supabase", res);
        const s = (await res.json()) as { disable_signup?: boolean; external?: { email?: boolean } };
        const warn = [s.external?.email === false ? "email login is disabled" : "", s.disable_signup === false ? "new sign-ups are still allowed (turn them off)" : ""].filter(Boolean);
        return warn.length ? { ok: false, detail: `Connected, but ${warn.join("; ")}` } : { ok: true, detail: "Connected; email login on, sign-ups off" };
      }),
  },
  {
    id: "anthropic",
    name: "Claude (Anthropic API)",
    powers: "The assistant, inbox triage, reply drafts, capture parsing, and web search.",
    required: false,
    vars: ["ANTHROPIC_API_KEY"],
    steps: ["console.anthropic.com → API keys → Create key → ANTHROPIC_API_KEY.", "Optional: set ANTHROPIC_FAST_MODEL=claude-haiku-5-5 to make triage cheaper.", "Set the daily spend cap in Settings → Assistant."],
    link: { label: "Anthropic Console", href: "https://console.anthropic.com/settings/keys" },
    validate: (env) => (has(env, "ANTHROPIC_API_KEY") && !env.ANTHROPIC_API_KEY!.startsWith("sk-ant-") ? ["ANTHROPIC_API_KEY should start with sk-ant-"] : []),
    test: (env, f = fetch) =>
      guard(async () => {
        const model = env.ANTHROPIC_MODEL || "claude-opus-5-5";
        const res = await timed(f, `https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`, { headers: { "x-api-key": env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" } });
        if (res.status === 404) return { ok: false, detail: `Key works, but model ${model} isn't available to it` };
        if (!res.ok) return httpFail("Anthropic", res);
        return { ok: true, detail: `Key works; ${model} available` };
      }),
  },
  {
    id: "google",
    name: "Gmail + Google Calendar",
    powers: "Two-way calendar sync, inbox sync/triage, sending approved replies, email briefs.",
    required: false,
    vars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "APP_URL"],
    steps: [
      "Google Cloud console → new project → enable the Gmail API and Google Calendar API.",
      "OAuth consent screen: Internal (Workspace) or External + add yourself as a test user.",
      "Credentials → OAuth client ID (Web). Redirect URI: <APP_URL>/api/google/callback.",
      "After deploying: Settings → Connect Google.",
    ],
    link: { label: "Google Cloud credentials", href: "https://console.cloud.google.com/apis/credentials" },
    validate: (env) => {
      const p: string[] = [];
      if (has(env, "GOOGLE_CLIENT_ID") && !env.GOOGLE_CLIENT_ID!.endsWith(".apps.googleusercontent.com")) p.push("GOOGLE_CLIENT_ID should end with .apps.googleusercontent.com");
      if (has(env, "APP_URL") && !/^https:\/\//.test(env.APP_URL!) && !/localhost/.test(env.APP_URL!)) p.push("APP_URL must be https in production (it builds the OAuth redirect URI)");
      return p;
    },
  },
  {
    id: "push",
    name: "Phone notifications (web push)",
    powers: "Reminders, briefs, and important-email alerts as push notifications.",
    required: false,
    vars: ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
    steps: ["Generated for you by `npm run setup:secrets`.", "After deploying: open the app on your phone → Settings → Enable push on this device."],
    validate: (env) => {
      const p: string[] = [];
      if (has(env, "NEXT_PUBLIC_VAPID_PUBLIC_KEY") && b64len(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, true) !== 65) p.push("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not a valid VAPID public key");
      if (has(env, "VAPID_PRIVATE_KEY") && b64len(env.VAPID_PRIVATE_KEY!, true) !== 32) p.push("VAPID_PRIVATE_KEY is not a valid VAPID private key");
      if (has(env, "VAPID_SUBJECT") && !/^(mailto:|https:\/\/)/.test(env.VAPID_SUBJECT!)) p.push("VAPID_SUBJECT must be mailto:you@… or an https URL");
      return p;
    },
  },
  {
    id: "twilio",
    name: "Text messages (Twilio)",
    powers: "SMS briefs and urgent reminders. Push and email still work without it.",
    required: false,
    vars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "MY_PHONE_NUMBER"],
    steps: [
      "Create a Twilio account and buy a local Arizona number (or toll-free).",
      "Register it: A2P 10DLC (sole proprietor works) or toll-free verification. Texts won't deliver until approved (days to weeks), so start this first.",
      "Copy Account SID + Auth Token; numbers in +1XXXXXXXXXX form.",
    ],
    link: { label: "Twilio console", href: "https://console.twilio.com" },
    validate: (env) => {
      const p: string[] = [];
      if (has(env, "TWILIO_ACCOUNT_SID") && !/^AC[0-9a-f]{32}$/i.test(env.TWILIO_ACCOUNT_SID!)) p.push("TWILIO_ACCOUNT_SID should look like AC + 32 hex characters");
      for (const k of ["TWILIO_FROM_NUMBER", "MY_PHONE_NUMBER"]) if (has(env, k) && !e164.test(env[k]!)) p.push(`${k} must be in +1XXXXXXXXXX form`);
      return p;
    },
    test: (env, f = fetch) =>
      guard(async () => {
        const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
        const res = await timed(f, `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}.json`, { headers: { authorization: `Basic ${auth}` } });
        if (!res.ok) return httpFail("Twilio", res);
        const a = (await res.json()) as { status?: string; type?: string };
        if (a.status !== "active") return { ok: false, detail: `Account status is ${a.status ?? "unknown"}` };
        return { ok: true, detail: `Account active${a.type === "Trial" ? " (trial: texts only reach verified numbers)" : ""}; registration status is in the Twilio console` };
      }),
  },
  {
    id: "github",
    name: "GitHub",
    powers: "Projects hub: your repos, last commit, open issues, detected stack.",
    required: false,
    vars: ["GITHUB_TOKEN", "GITHUB_OWNERS"],
    steps: ["github.com/settings/tokens → Fine-grained token → your repos, read-only: Contents, Metadata, Issues.", "GITHUB_OWNERS = GraydenRussell (comma-separate any orgs)."],
    link: { label: "GitHub tokens", href: "https://github.com/settings/personal-access-tokens" },
    test: (env, f = fetch) =>
      guard(async () => {
        const res = await timed(f, "https://api.github.com/user", { headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "user-agent": "life-os" } });
        if (!res.ok) return httpFail("GitHub", res);
        const u = (await res.json()) as { login?: string };
        return { ok: true, detail: `Token works (signed in as ${u.login ?? "?"})` };
      }),
  },
  {
    id: "vercel",
    name: "Vercel deploy status",
    powers: "Production URL and latest deploy state on each project card. Optional.",
    required: false,
    vars: ["VERCEL_TOKEN"],
    steps: ["vercel.com/account/tokens → Create (read scope is enough).", "Set VERCEL_TEAM_ID only if your projects live in a team."],
    link: { label: "Vercel tokens", href: "https://vercel.com/account/tokens" },
    test: (env, f = fetch) =>
      guard(async () => {
        const res = await timed(f, "https://api.vercel.com/v2/user", { headers: { authorization: `Bearer ${env.VERCEL_TOKEN}` } });
        if (!res.ok) return httpFail("Vercel", res);
        const u = (await res.json()) as { user?: { username?: string } };
        return { ok: true, detail: `Token works (${u.user?.username ?? "?"})` };
      }),
  },
  {
    id: "business",
    name: "Admin dashboard (Rapid Windows)",
    powers: "Business hub numbers, today's jobs, leads, and the business section of your briefs.",
    required: false,
    vars: ["ADMIN_DASH_URL", "LIFE_OS_API_TOKEN"],
    steps: [
      "Add the route from docs/admin-dashboard-endpoint.md to Rapid-Windows-dash and map its four queries to your tables.",
      "Generate a token (`openssl rand -hex 24`), set it as LIFE_OS_API_TOKEN in both apps, deploy the dashboard.",
      "ADMIN_DASH_URL = the dashboard's https URL.",
    ],
    validate: (env) => (has(env, "LIFE_OS_API_TOKEN") && env.LIFE_OS_API_TOKEN!.length < 24 ? ["LIFE_OS_API_TOKEN should be at least 24 characters"] : []),
    test: (env, f = fetch) =>
      guard(async () => {
        const res = await timed(f, `${env.ADMIN_DASH_URL!.replace(/\/$/, "")}/api/life-os/summary`, { headers: { authorization: `Bearer ${env.LIFE_OS_API_TOKEN}` } });
        if (!res.ok) return httpFail("Admin dashboard", res);
        const body = (await res.json()) as { revenue?: unknown };
        return body && typeof body === "object" && "revenue" in body ? { ok: true, detail: "Endpoint answered with business data" } : { ok: false, detail: "Endpoint answered, but not in the expected format (see docs/admin-dashboard-endpoint.md)" };
      }),
  },
  {
    id: "housecall",
    name: "Housecall Pro",
    powers: "Customers and jobs for the Business hub: lifetime value, money owed, re-booking, route view, and review requests.",
    required: false,
    vars: ["HOUSECALL_PRO_API_KEY"],
    steps: [
      "Housecall Pro → App Store → API (needs the MAX plan) → Generate API key.",
      "HOUSECALL_PRO_API_KEY = that key. Life OS only reads customers and jobs; it never writes to Housecall Pro.",
      "Then press “Sync Housecall Pro” on Business → Customers (it also syncs every 30 minutes).",
    ],
    link: { label: "Housecall Pro API docs", href: "https://docs.housecallpro.com/" },
    test: (env, f = fetch) =>
      guard(async () => {
        const res = await timed(f, "https://api.housecallpro.com/customers?page=1&page_size=1", { headers: { authorization: `Token ${env.HOUSECALL_PRO_API_KEY}`, accept: "application/json" } });
        if (!res.ok) return httpFail("Housecall Pro", res);
        const body = (await res.json()) as { total_items?: number };
        return { ok: true, detail: `Key works${typeof body.total_items === "number" ? ` (${body.total_items} customers)` : ""}` };
      }),
  },
  {
    id: "leads",
    name: "Lead inbox: website forms",
    powers: "Website and form-builder leads land in Business → Leads, get scored with a drafted reply, and nudge you if unanswered.",
    required: false,
    vars: ["LEAD_WEBHOOK_SECRET"],
    steps: [
      "`npm run setup:secrets` generates LEAD_WEBHOOK_SECRET (or use `openssl rand -hex 24`).",
      "Point your form at POST {APP_URL}/api/leads/webhook with header `Authorization: Bearer <secret>` (Zapier, Make, Webflow, Wix, WordPress plugins). Plain HTML forms can use {APP_URL}/api/leads/webhook?key=<secret>&redirect=https://your-site/thanks.",
      "Fields are matched by common names (name, phone, email, address, message…); anything else is kept in the message. Add a hidden `_gotcha` field to trap bots.",
      "Google Business Profile chat no longer exists (Google shut it down in July 2024). Leads from your listing arrive by phone, website, or email, which this inbox already covers.",
    ],
    validate: (env) => (has(env, "LEAD_WEBHOOK_SECRET") && env.LEAD_WEBHOOK_SECRET!.length < 16 ? ["LEAD_WEBHOOK_SECRET should be at least 16 characters"] : []),
  },
  {
    id: "meta",
    name: "Meta Lead Ads",
    powers: "Facebook/Instagram lead-form submissions arrive in the lead inbox within seconds.",
    required: false,
    vars: ["META_APP_SECRET", "META_VERIFY_TOKEN", "META_PAGE_ACCESS_TOKEN"],
    steps: [
      "developers.facebook.com → My Apps → Create app (Business). Add the Webhooks product → Page → subscribe to `leadgen`.",
      "Callback URL: {APP_URL}/api/leads/meta. Verify token: META_VERIFY_TOKEN (from `npm run setup:secrets`).",
      "META_APP_SECRET = App settings → Basic → App secret.",
      "META_PAGE_ACCESS_TOKEN = a long-lived Page token with leads_retrieval + pages_manage_metadata (Business Settings → System users is the durable way). Subscribe the Page to the app.",
      "Test with Meta's Lead Ads Testing Tool; the lead should show up in Business → Leads.",
    ],
    link: { label: "Lead Ads webhooks guide", href: "https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving" },
    test: (env, f = fetch) =>
      guard(async () => {
        const res = await timed(f, `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(env.META_PAGE_ACCESS_TOKEN ?? "")}`, {});
        if (!res.ok) return httpFail("Meta", res);
        const me = (await res.json()) as { name?: string };
        return { ok: true, detail: `Page token works (${me.name ?? "?"})` };
      }),
  },
  {
    id: "gbp",
    name: "Google reviews (Business Profile)",
    powers: "Review count and rating over time, alerts for new reviews, and drafted replies you approve and post from Life OS.",
    required: false,
    vars: ["GBP_ACCOUNT_ID", "GBP_LOCATION_ID"],
    steps: [
      "Google Cloud console (same project as your Google sign-in) → request access to the Business Profile APIs (Google reviews the request, usually a few days), then enable “My Business Account Management API” and “Google My Business API”.",
      "Find your ids: Account Management API accounts.list gives accounts/<GBP_ACCOUNT_ID>; Business Information API accounts.locations.list gives locations/<GBP_LOCATION_ID>.",
      "Set both, redeploy, then Settings → reconnect Google (adds the Business Profile permission).",
      "Business → Reviews → paste your “Ask for reviews” short link (Business Profile → Ask for reviews) so review-request texts can go out. That part works even before the API is approved.",
    ],
    link: { label: "Business Profile API access", href: "https://developers.google.com/my-business/content/prereqs" },
    validate: (env) => [...(has(env, "GBP_ACCOUNT_ID") && !/^\d+$/.test(env.GBP_ACCOUNT_ID!) ? ["GBP_ACCOUNT_ID should be the number after accounts/"] : []), ...(has(env, "GBP_LOCATION_ID") && !/^\d+$/.test(env.GBP_LOCATION_ID!) ? ["GBP_LOCATION_ID should be the number after locations/"] : [])],
  },
  {
    id: "golive",
    name: "Go live",
    powers: "Switches every integration from sample data to the real services above.",
    required: true,
    vars: ["INTEGRATION_MODE", "APP_URL"],
    steps: ["Set INTEGRATION_MODE=live and APP_URL to your https domain.", "Run `npm run cron:sql` and execute the output in Supabase to schedule briefs, inbox checks, and reminders."],
    validate: (env) => {
      const p: string[] = [];
      if (has(env, "INTEGRATION_MODE") && env.INTEGRATION_MODE !== "live") p.push("INTEGRATION_MODE is mock (sample data)");
      if (has(env, "APP_URL") && !/^https:\/\//.test(env.APP_URL!)) p.push("APP_URL must be your https domain");
      return p;
    },
  },
];

export function itemStatus(item: SetupItem, env: Env): ItemStatus {
  // GITHUB_OWNERS and VERCEL_TEAM_ID-style vars with defaults never count as missing.
  const missing = item.vars.filter((k) => !has(env, k) && !(k === "GITHUB_OWNERS"));
  const problems = item.validate ? item.validate(env) : [];
  const status: CheckStatus = missing.length ? "missing" : problems.length ? "invalid" : "ready";
  return { id: item.id, status, missing, problems };
}

export function checklist(env: Env): Array<SetupItem & ItemStatus> {
  return SETUP_ITEMS.map((i) => ({ ...i, ...itemStatus(i, env) }));
}

export function summary(env: Env) {
  const items = checklist(env);
  const required = items.filter((i) => i.required);
  return {
    total: items.length,
    ready: items.filter((i) => i.status === "ready").length,
    requiredReady: required.filter((i) => i.status === "ready").length,
    requiredTotal: required.length,
  };
}

export async function runTest(id: string, env: Env, fetcher: typeof fetch = fetch): Promise<TestResult> {
  const item = SETUP_ITEMS.find((i) => i.id === id);
  if (!item) return { ok: false, detail: `Unknown item ${id}` };
  const s = itemStatus(item, env);
  if (s.status === "missing") return { ok: false, detail: `Missing: ${s.missing.join(", ")}` };
  if (s.status === "invalid") return { ok: false, detail: s.problems.join("; ") };
  if (!item.test) return { ok: true, detail: "Configured (no live test for this item)" };
  return item.test(env, fetcher);
}
