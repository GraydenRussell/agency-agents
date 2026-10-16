import { execSync } from "node:child_process";

/** Migrated + freshly seeded database (the seed truncates all tables first) for every E2E run. */
export default function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgresql://postgres@localhost:5432/lifeos_e2e";
  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env });
}
