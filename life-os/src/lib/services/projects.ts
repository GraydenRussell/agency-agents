import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { ProjectStatus } from "@/generated/prisma/enums";

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
