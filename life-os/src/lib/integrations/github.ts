import "server-only";
import { z } from "zod";
import { isMock } from "./mode";

export type RepoInfo = {
  fullName: string;
  name: string;
  description: string | null;
  url: string;
  homepage: string | null;
  isPrivate: boolean;
  isFork: boolean;
  archived: boolean;
  defaultBranch: string;
  pushedAt: Date | null;
  openIssues: number;
  stack: string[];
  lastCommit: { message: string; date: Date } | null;
};

export class GitHubNotConfiguredError extends Error {
  constructor() {
    super("GITHUB_TOKEN is not set");
    this.name = "GitHubNotConfiguredError";
  }
}

/** Frameworks worth surfacing, detected from package.json dependencies. */
const DEP_LABELS: Array<[RegExp, string]> = [
  [/^next$/, "Next.js"],
  [/^react$/, "React"],
  [/^vue$/, "Vue"],
  [/^svelte$|^@sveltejs\/kit$/, "Svelte"],
  [/^express$/, "Express"],
  [/^prisma$|^@prisma\/client$/, "Prisma"],
  [/^@supabase\/supabase-js$/, "Supabase"],
  [/^tailwindcss$/, "Tailwind"],
  [/^@anthropic-ai\/sdk$/, "Claude API"],
  [/^@modelcontextprotocol\/sdk$/, "MCP"],
  [/^stripe$/, "Stripe"],
  [/^drizzle-orm$/, "Drizzle"],
];

/** Pure: languages (by bytes) + topics + package.json deps → ordered, de-duplicated stack labels. */
export function detectStack(languages: Record<string, number>, topics: string[], pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null): string[] {
  const out: string[] = [];
  const deps = Object.keys({ ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) });
  for (const [re, label] of DEP_LABELS) if (deps.some((d) => re.test(d))) out.push(label);
  const langs = Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([l]) => l);
  out.push(...langs.filter((l) => !["CSS", "HTML", "Shell", "Dockerfile", "PLpgSQL"].includes(l) || langs.length === 1));
  out.push(...topics.slice(0, 3));
  const seen = new Set<string>();
  return out.filter((x) => {
    const k = x.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 8);
}

const repoSchema = z.object({
  full_name: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  html_url: z.string(),
  homepage: z.string().nullable().optional(),
  private: z.boolean(),
  fork: z.boolean(),
  archived: z.boolean().default(false),
  default_branch: z.string(),
  pushed_at: z.string().nullable(),
  open_issues_count: z.number(),
  topics: z.array(z.string()).default([]),
  owner: z.object({ login: z.string() }),
});

async function gh(path: string): Promise<Response> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new GitHubNotConfiguredError();
  return fetch(`https://api.github.com${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "life-os" },
    signal: AbortSignal.timeout(15_000),
  });
}

async function ghJson<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
  const res = await gh(path);
  if (res.status === 404 || res.status === 409) return null; // missing / empty repo
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}`);
  return schema.parse(await res.json());
}

async function enrich(r: z.infer<typeof repoSchema>, deep: boolean): Promise<RepoInfo> {
  let stack: string[] = r.topics.slice(0, 3);
  let lastCommit: RepoInfo["lastCommit"] = null;
  if (deep) {
    const [languages, commits, pkgFile] = await Promise.all([
      ghJson(`/repos/${r.full_name}/languages`, z.record(z.string(), z.number())),
      ghJson(`/repos/${r.full_name}/commits?per_page=1`, z.array(z.object({ commit: z.object({ message: z.string(), committer: z.object({ date: z.string() }).nullable() }) }))),
      ghJson(`/repos/${r.full_name}/contents/package.json`, z.object({ content: z.string(), encoding: z.string() })),
    ]);
    let pkg = null;
    try {
      pkg = pkgFile ? (JSON.parse(Buffer.from(pkgFile.content, "base64").toString("utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }) : null;
    } catch {
      pkg = null;
    }
    stack = detectStack(languages ?? {}, r.topics, pkg);
    const c = commits?.[0];
    if (c) lastCommit = { message: c.commit.message.split("\n")[0] ?? "", date: new Date(c.commit.committer?.date ?? r.pushed_at ?? Date.now()) };
  }
  return {
    fullName: r.full_name,
    name: r.name,
    description: r.description,
    url: r.html_url,
    homepage: r.homepage || null,
    isPrivate: r.private,
    isFork: r.fork,
    archived: r.archived,
    defaultBranch: r.default_branch,
    pushedAt: r.pushed_at ? new Date(r.pushed_at) : null,
    openIssues: r.open_issues_count,
    stack,
    lastCommit,
  };
}

function mockRepos(): RepoInfo[] {
  const d = (days: number) => new Date(Date.now() - days * 86_400_000);
  return [
    { fullName: "GraydenRussell/Rapid-Windows-dash", name: "Rapid-Windows-dash", description: "Admin dashboard: Housecall Pro sync, daily brief, analytics.", url: "https://github.com/GraydenRussell/Rapid-Windows-dash", homepage: null, isPrivate: true, isFork: false, archived: false, defaultBranch: "main", pushedAt: d(2), openIssues: 3, stack: ["Next.js", "Supabase", "Prisma", "TypeScript"], lastCommit: { message: "Add HCP job sync retries", date: d(2) } },
    { fullName: "GraydenRussell/predixyai", name: "predixyai", description: "AI prediction side project.", url: "https://github.com/GraydenRussell/predixyai", homepage: "https://predixy.example.com", isPrivate: true, isFork: false, archived: false, defaultBranch: "main", pushedAt: d(40), openIssues: 1, stack: ["Next.js", "Claude API", "TypeScript"], lastCommit: { message: "Landing page copy", date: d(40) } },
    { fullName: "GraydenRussell/housecallpro-mcp", name: "housecallpro-mcp", description: "MCP server for Housecall Pro (fork).", url: "https://github.com/GraydenRussell/housecallpro-mcp", homepage: null, isPrivate: false, isFork: true, archived: false, defaultBranch: "main", pushedAt: d(480), openIssues: 0, stack: ["MCP", "TypeScript"], lastCommit: { message: "Initial fork", date: d(480) } },
    { fullName: "GraydenRussell/agency-agents", name: "agency-agents", description: "Agent prompt library (fork) — temporary home of Life OS.", url: "https://github.com/GraydenRussell/agency-agents", homepage: null, isPrivate: false, isFork: true, archived: false, defaultBranch: "main", pushedAt: d(0), openIssues: 0, stack: ["Markdown", "Next.js"], lastCommit: { message: "Life OS Phase 6", date: d(0) } },
  ];
}

/**
 * Repos the token can see for the configured owners (comma-separated GITHUB_OWNERS).
 * Deep details (languages, last commit, package.json) are fetched for repos pushed in the last 180 days.
 */
export async function listRepos(): Promise<RepoInfo[]> {
  if (isMock()) return mockRepos();
  const owners = (process.env.GITHUB_OWNERS ?? "").split(",").map((o) => o.trim().toLowerCase()).filter(Boolean);
  const all: Array<z.infer<typeof repoSchema>> = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await ghJson(`/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`, z.array(repoSchema));
    if (!batch?.length) break;
    all.push(...batch);
    if (batch.length < 100) break;
  }
  const mine = owners.length ? all.filter((r) => owners.includes(r.owner.login.toLowerCase())) : all;
  const cutoff = Date.now() - 180 * 86_400_000;
  const out: RepoInfo[] = [];
  for (const r of mine) out.push(await enrich(r, Boolean(r.pushed_at && new Date(r.pushed_at).getTime() > cutoff)));
  return out;
}
