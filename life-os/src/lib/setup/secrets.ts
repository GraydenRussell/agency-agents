import { randomBytes } from "node:crypto";
import webpush from "web-push";

/** Secrets Life OS needs that you generate yourself (no account required). */
export function generateSecrets(): Record<string, string> {
  const vapid = webpush.generateVAPIDKeys();
  return {
    ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    CRON_SECRET: randomBytes(32).toString("hex"),
    PROJECTS_SYNC_TOKEN: randomBytes(24).toString("hex"),
    LIFE_OS_API_TOKEN: randomBytes(24).toString("hex"),
    LEAD_WEBHOOK_SECRET: randomBytes(24).toString("hex"),
    META_VERIFY_TOKEN: randomBytes(16).toString("hex"),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
  };
}

/** Keys already set (non-empty, uncommented) in a dotenv file's text. */
export function definedKeys(dotenv: string): Set<string> {
  const out = new Set<string>();
  for (const line of dotenv.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && m[1] && m[2] && m[2].trim() !== "" && m[2].trim() !== '""') out.add(m[1]);
  }
  return out;
}

/**
 * Lines to append so every generated secret is present, never touching keys that already have a value.
 * Dev placeholders are left alone too (they're valid locally); production values belong in Vercel.
 */
export function linesToAppend(existing: string, secrets: Record<string, string>): string[] {
  const have = definedKeys(existing);
  return Object.entries(secrets)
    .filter(([k]) => !have.has(k))
    .map(([k, v]) => `${k}=${v}`);
}
