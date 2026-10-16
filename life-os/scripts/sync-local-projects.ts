/**
 * Sends metadata about local project folders to Life OS (a hosted app can't read your disk).
 *
 *   LIFE_OS_URL=https://life.example.com PROJECTS_SYNC_TOKEN=... npx tsx scripts/sync-local-projects.ts ~/Projects
 *
 * Scans the immediate subfolders that are git repos: name/description from package.json, git remote,
 * last commit, and a rough stack. Nothing else (no code) leaves your machine.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? join(homedir(), "Projects"));
const url = (process.env.LIFE_OS_URL ?? "").replace(/\/$/, "");
const token = process.env.PROJECTS_SYNC_TOKEN ?? "";
if (!url || !token) {
  console.error("Set LIFE_OS_URL and PROJECTS_SYNC_TOKEN");
  process.exit(1);
}

const git = (dir: string, args: string[]) => {
  try {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

const STACK: Array<[string, string]> = [["next", "Next.js"], ["react", "React"], ["@prisma/client", "Prisma"], ["@supabase/supabase-js", "Supabase"], ["tailwindcss", "Tailwind"], ["@anthropic-ai/sdk", "Claude API"], ["express", "Express"], ["vue", "Vue"]];

const projects = readdirSync(root)
  .map((name) => join(root, name))
  .filter((dir) => statSync(dir).isDirectory() && existsSync(join(dir, ".git")))
  .map((dir) => {
    let pkg: { name?: string; description?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {};
    try {
      pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    } catch {
      /* not a node project */
    }
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const stack = STACK.filter(([d]) => d in deps).map(([, l]) => l);
    if (existsSync(join(dir, "tsconfig.json"))) stack.push("TypeScript");
    if (existsSync(join(dir, "pyproject.toml")) || existsSync(join(dir, "requirements.txt"))) stack.push("Python");
    const [date, ...msg] = git(dir, ["log", "-1", "--format=%cI%x09%s"]).split("\t");
    return { name: pkg.name ?? dir.split("/").pop() ?? dir, path: dir, description: pkg.description ?? null, remote: git(dir, ["remote", "get-url", "origin"]) || null, lastCommitAt: date || null, lastCommitMsg: msg.join("\t") || null, stack };
  });

const res = await fetch(`${url}/api/projects/local`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ projects }) });
console.log(res.status, await res.text());
