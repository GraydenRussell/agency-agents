import "server-only";
import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  /** "supabase" (real login + TOTP) or "dev" (no login; refused on Vercel). */
  AUTH_MODE: z.enum(["supabase", "dev"]).default("supabase"),
  ALLOWED_EMAIL: z.string().email(),
  NEXT_PUBLIC_SUPABASE_URL: optional,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optional,

  /** "mock" uses seed-backed adapters for every integration; "live" calls real APIs. */
  INTEGRATION_MODE: z.enum(["mock", "live"]).default("mock"),

  /** base64 encoded 32-byte key for AES-256-GCM token encryption. */
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "ENCRYPTION_KEY must be 32 bytes, base64"),
  CRON_SECRET: z.string().min(16),

  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  ANTHROPIC_FAST_MODEL: z.string().default("claude-opus-5-5"),

  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,

  TWILIO_ACCOUNT_SID: optional,
  TWILIO_AUTH_TOKEN: optional,
  TWILIO_FROM_NUMBER: optional,
  MY_PHONE_NUMBER: optional,

  NEXT_PUBLIC_VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  VAPID_SUBJECT: optional,

  GITHUB_TOKEN: optional,
  GITHUB_OWNERS: z.string().default("GraydenRussell"),
  VERCEL_TOKEN: optional,
  PROJECTS_SYNC_TOKEN: optional,
  VERCEL_TEAM_ID: optional,

  ADMIN_DASH_URL: optional,
  LIFE_OS_API_TOKEN: optional,
  HOUSECALL_PRO_API_KEY: optional,

  WEATHER_LAT: z.coerce.number().default(33.3062),
  WEATHER_LON: z.coerce.number().default(-111.8413),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example.`);
  }
  const e = parsed.data;
  if (e.AUTH_MODE === "dev" && process.env.VERCEL) {
    throw new Error("AUTH_MODE=dev is not allowed on Vercel deployments.");
  }
  if (e.AUTH_MODE === "supabase" && (!e.NEXT_PUBLIC_SUPABASE_URL || !e.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    throw new Error("AUTH_MODE=supabase requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  cached = e;
  return e;
}

/** For tests only. */
export function resetEnvCache() {
  cached = undefined;
}
