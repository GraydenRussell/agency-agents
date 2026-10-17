/**
 * Setup doctor: shows which accounts/keys are connected and exactly what's missing.
 *
 *   npm run doctor             # checks env vars (reads .env.local, then .env, then the shell)
 *   npm run doctor -- --live   # also tests each configured service over the network (read-only calls)
 *
 * Exit code 1 if anything required for production is missing or invalid.
 */
import { config } from "dotenv";
import pg from "pg";
import { checklist, runTest, summary, type Env } from "../src/lib/setup/checklist";

config({ path: ".env.local" });
config();

const live = process.argv.includes("--live");
const env = process.env as Env;
const icon = { ready: "✔", missing: "○", invalid: "✖" } as const;

async function dbTest(): Promise<string> {
  const url = env.DIRECT_URL || env.DATABASE_URL;
  if (!url) return "skipped (no DATABASE_URL)";
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  try {
    await client.connect();
    const r = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`);
    return `connected; ${r.rows[0]?.n ?? 0} migrations applied`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return /_prisma_migrations/.test(msg) ? "connected, but migrations not applied (run npm run db:deploy)" : `FAILED: ${msg}`;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  const items = checklist(env);
  const s = summary(env);
  console.log(`\nLife OS setup: ${s.ready}/${s.total} connected, ${s.requiredReady}/${s.requiredTotal} required ready (mode: ${env.INTEGRATION_MODE ?? "mock"})\n`);
  let n = 0;
  for (const it of items) {
    n++;
    console.log(`${icon[it.status]} ${n}. ${it.name}${it.required ? "  [required]" : ""}`);
    if (it.status !== "ready") {
      if (it.missing.length) console.log(`     missing: ${it.missing.join(", ")}`);
      for (const p of it.problems) console.log(`     problem: ${p}`);
      console.log(`     powers:  ${it.powers}`);
      it.steps.forEach((st, i) => console.log(`     ${i + 1}) ${st}`));
      if (it.link) console.log(`     → ${it.link.href}`);
    }
    if (live && it.status === "ready") {
      const r = it.id === "database" ? { ok: !(await dbTest().then((d) => (console.log(`     live: ${d}`), d))).startsWith("FAILED"), detail: "" } : await runTest(it.id, env);
      if (it.id !== "database") console.log(`     live: ${r.ok ? "OK" : "FAILED"}: ${r.detail}`);
    }
  }
  console.log(live ? "" : "\nAdd --live to test each configured service.");
  const blocking = items.filter((i) => i.required && i.status !== "ready");
  if (blocking.length) {
    console.log(`\nNot production-ready yet: ${blocking.map((b) => b.name).join(", ")}.`);
    process.exitCode = 1;
  }
}

void main();
