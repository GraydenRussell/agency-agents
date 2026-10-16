"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import type { TaskStatus } from "@/generated/prisma/enums";
import * as tasks from "@/lib/services/tasks";

function refresh() {
  revalidatePath("/", "layout");
}

export async function createTaskAction(input: tasks.TaskInput) {
  return runAction(async () => {
    const t = await tasks.createTask(input);
    refresh();
    return { id: t.id };
  });
}

export async function updateTaskAction(id: string, patch: tasks.TaskUpdate) {
  return runAction(async () => {
    await tasks.updateTask(id, patch);
    refresh();
    return undefined;
  });
}

export async function setTaskStatusAction(id: string, status: TaskStatus) {
  return runAction(async () => {
    const { next } = await tasks.setTaskStatus(id, status);
    refresh();
    return { nextDue: next?.dueAt?.toISOString() ?? null };
  });
}

export async function moveTaskAction(id: string, status: TaskStatus, beforeSort: number | null, afterSort: number | null) {
  return runAction(async () => {
    await tasks.moveTask(id, status, beforeSort, afterSort);
    refresh();
    return undefined;
  });
}

export async function deleteTaskAction(id: string) {
  return runAction(async () => {
    await tasks.deleteTask(id);
    refresh();
    return undefined;
  });
}

export async function restoreTaskAction(id: string) {
  return runAction(async () => {
    await tasks.restoreTask(id);
    refresh();
    return undefined;
  });
}

export async function toggleTop3Action(id: string) {
  return runAction(async () => {
    const r = await tasks.toggleTop3(id);
    refresh();
    return r;
  });
}

export async function rollOverAction(ids: string[], to: string) {
  return runAction(async () => {
    const n = await tasks.rollOverTasks(ids, to);
    refresh();
    return n;
  });
}

export async function getTaskAction(id: string) {
  return runAction(async () => tasks.getTask(id));
}

export async function listGoalOptionsAction() {
  return runAction(async () => (await import("@/lib/services/goals")).listGoalsFlat());
}
