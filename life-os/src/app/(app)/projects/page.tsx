import { PageHeader } from "@/components/shell/page-header";
import { ProjectBoard } from "@/components/projects/project-board";
import { db } from "@/lib/db";
import { isMock } from "@/lib/integrations/mode";
import { listProjects } from "@/lib/services/projects";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const [projects, last] = await Promise.all([listProjects(), db.project.findFirst({ where: { syncedAt: { not: null } }, orderBy: { syncedAt: "desc" } })]);
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return (
    <>
      <PageHeader title="Projects" description="Everything you're building with Claude Code: GitHub, Vercel, and local folders." />
      <ProjectBoard
        githubReady={isMock() || Boolean(process.env.GITHUB_TOKEN)}
        lastSync={iso(last?.syncedAt ?? null)}
        projects={projects.map((p) => ({ ...p, lastCommitAt: iso(p.lastCommitAt), deployedAt: iso(p.deployedAt) }))}
      />
    </>
  );
}
