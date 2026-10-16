"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import * as projects from "@/lib/services/projects";

const refresh = () => revalidatePath("/projects");

export async function syncProjectsAction() {
  return runAction(async () => {
    const r = await projects.syncProjects();
    refresh();
    return `Synced ${r.total} repos (${r.created} new)`;
  });
}
export async function createProjectAction(input: projects.ProjectInput) {
  return runAction(async () => {
    const p = await projects.createProject(input);
    refresh();
    return p.id;
  });
}
export async function updateProjectAction(id: string, input: Partial<projects.ProjectInput>) {
  return runAction(async () => {
    await projects.updateProject(id, input);
    refresh();
    return undefined;
  });
}
export async function deleteProjectAction(id: string) {
  return runAction(async () => {
    await projects.deleteProject(id);
    refresh();
    return undefined;
  });
}
