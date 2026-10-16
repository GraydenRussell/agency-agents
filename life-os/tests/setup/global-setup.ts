import { execSync } from "node:child_process";

/** Applies migrations to the test database once per run. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/lifeos_test";
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } });
}
