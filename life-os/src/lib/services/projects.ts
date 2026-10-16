import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { ProjectStatus } from "@/generated/prisma/enums";
import { GitHubNotConfiguredError, listRepos } from "@/lib/integrations/github";
import { isMock } from "@/lib/integrations/mode";
import { listVercelProjects } from "@/lib/integrations/vercel";

export const projectInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).nullish(),
  stack: z.array(z.string().max(40)).max(20).optional(),
  repoUrl: z.string().url().nullish(),
  deployUrl: z.string().url().nullish(),
  launchUrl: z.string().url().nullish(),
  localPath: z.string().max(500).nullish(),
  status: z.enum(Object.values(ProjectStatus) as [ProjectStatus, ...ProjectStatus[]]).optional(),
  nextStep: z.string().max(500).nullish(),
  notes: z.string().max(20_000).nullish(),
});
export type ProjectInput = z.input<typeof projectInputSchema>;

export async function listProjects(opts: { status?: ProjectStatus } = {}) {
  return db.project.findMany({ where: opts.status ? { status: opts.status } : {}, orderBy: [{ status: "asc" }, { lastCommitAt: { sort: "desc", nulls: "last" } }, { name: "asc" }] });
}

/** Finds a project by id, exact name, repo name, or case-insensitive partial name. */
export async function findProject(ref: string) {
  const r = ref.trim();
  return (
    (await db.project.findUnique({ where: { id: r } }).catch(() => null)) ??
    (await db.project.findFirst({ where: { OR: [{ name: { equals: r, mode: "insensitive" } }, { repoFullName: { equals: r, mode: "insensitive" } }] } })) ??
    (await db.project.findFirst({ where: { OR: [{ name: { contains: r, mode: "insensitive" } }, { repoFullName: { contains: r, mode: "insensitive" } }] } }))
  );
}

export async function createProject(input: ProjectInput) {
  return db.project.create({ data: { ...projectInputSchema.parse(input), source: "MANUAL" } });
}

export async function updateProject(id: string, input: Partial<ProjectInput>) {
  return db.project.update({ where: { id }, data: projectInputSchema.partial().parse(input) });
}

export async function deleteProject(id: string) {
  return db.project.delete({ where: { id } });
}

// ───────────────────────────── Sync ─────────────────────────────


/** Status for newly discovered repos; never overwrites a status you set. */
export function initialStatus(r: { archived: boolean; pushedAt: Date | null }, now = Date.now()): ProjectStatus {
  if (r.archived) return "DONE";
  if (!r.pushedAt) return "IDEA";
  const days = (now - r.pushedAt.getTime()) / 86_400_000;
  return days <= 30 ? "ACTIVE" : "PAUSED";
}

export async function syncProjects() {
  if (!isMock() && !process.env.GITHUB_TOKEN) throw new GitHubNotConfiguredError();
  const [repos, vercel] = await Promise.all([listRepos(), listVercelProjects().catch((e: unknown) => (console.error("[vercel]", e), []))]);
  const byRepo = new Map(vercel.filter((v) => v.repo).map((v) => [v.repo?.toLowerCase(), v]));
  let created = 0;
  let updated = 0;
  for (const r of repos) {
    const v = byRepo.get(r.fullName.toLowerCase());
    const data = {
      name: r.name,
      description: r.description,
      stack: r.stack,
      repoUrl: r.url,
      defaultBranch: r.defaultBranch,
      lastCommitAt: r.lastCommit?.date ?? r.pushedAt,
      lastCommitMsg: r.lastCommit?.message ?? null,
      openIssues: r.openIssues,
      isPrivate: r.isPrivate,
      vercelProjectId: v?.id ?? null,
      deployUrl: v?.productionUrl ?? r.homepage,
      deployState: v?.deployState ?? null,
      deployedAt: v?.deployedAt ?? null,
      syncedAt: new Date(),
    };
    const existing = await db.project.findFirst({ where: { repoFullName: { equals: r.fullName, mode: "insensitive" } } });
    if (existing) {
      // Keep user-owned fields (status, nextStep, notes, launchUrl) and a description you edited.
      await db.project.update({ where: { id: existing.id }, data: { ...data, description: existing.description ?? data.description } });
      updated++;
    } else {
      await db.project.create({ data: { ...data, source: "GITHUB", repoFullName: r.fullName, status: initialStatus(r) } });
      created++;
    }
  }
  return { created, updated, total: repos.length };
}

export const localProjectSchema = z.object({
  name: z.string().min(1).max(120),
  path: z.string().min(1).max(500),
  description: z.string().max(2000).nullish(),
  remote: z.string().max(500).nullish(),
  lastCommitAt: z.coerce.date().nullish(),
  lastCommitMsg: z.string().max(500).nullish(),
  stack: z.array(z.string().max(40)).max(10).optional(),
});

/** "git@github.com:owner/repo.git" / "https://github.com/owner/repo" → "owner/repo". */
export function repoFromRemote(remote: string | null | undefined): string | null {
  if (!remote) return null;
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remote.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

export async function upsertLocalProjects(items: Array<z.input<typeof localProjectSchema>>) {
  let matched = 0;
  let created = 0;
  for (const raw of items) {
    const p = localProjectSchema.parse(raw);
    const repo = repoFromRemote(p.remote);
    const byRepo = repo ? await db.project.findFirst({ where: { repoFullName: { equals: repo, mode: "insensitive" } } }) : null;
    const target = byRepo ?? (await db.project.findFirst({ where: { localPath: p.path } }));
    if (target) {
      await db.project.update({ where: { id: target.id }, data: { localPath: p.path, ...(target.source === "LOCAL" ? { lastCommitAt: p.lastCommitAt, lastCommitMsg: p.lastCommitMsg, stack: p.stack ?? target.stack } : {}) } });
      matched++;
    } else {
      await db.project.create({ data: { source: "LOCAL", name: p.name, localPath: p.path, description: p.description, repoFullName: repo, repoUrl: repo ? `https://github.com/${repo}` : null, lastCommitAt: p.lastCommitAt, lastCommitMsg: p.lastCommitMsg, stack: p.stack ?? [], status: "ACTIVE", syncedAt: new Date() } });
      created++;
    }
  }
  return { matched, created };
}
