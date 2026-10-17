/**
 * Generates the secrets you'd otherwise make by hand: encryption key, cron secret, sync/API tokens, VAPID keys.
 *
 *   npm run setup:secrets            # print them (paste into Vercel → Settings → Environment Variables)
 *   npm run setup:secrets -- --write # also add any that are missing to .env.local (existing values are kept)
 *
 * Generate once and keep them: changing ENCRYPTION_KEY later disconnects Google.
 */
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { generateSecrets, linesToAppend } from "../src/lib/setup/secrets";

const secrets = generateSecrets();
const write = process.argv.includes("--write");

console.log("# Life OS secrets: generated " + new Date().toISOString());
console.log("# LIFE_OS_API_TOKEN must also be set on the admin dashboard (same value).");
console.log("# Also set VAPID_SUBJECT=mailto:<your email>.\n");
for (const [k, v] of Object.entries(secrets)) console.log(`${k}=${v}`);

if (write) {
  const path = ".env.local";
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = linesToAppend(current, secrets);
  if (lines.length) {
    appendFileSync(path, `${current.endsWith("\n") || current === "" ? "" : "\n"}\n# Added by npm run setup:secrets\n${lines.join("\n")}\n`);
    console.log(`\nAdded ${lines.length} missing value(s) to ${path}; existing values were kept.`);
  } else {
    console.log(`\n${path} already has all of these; nothing changed.`);
  }
}
