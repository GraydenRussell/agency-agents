"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import type { BlockKind, ChecklistKind, DayType } from "@/generated/prisma/enums";
import * as habits from "@/lib/services/habits";
import * as routines from "@/lib/services/routines";

const refresh = () => revalidatePath("/", "layout");
const done = <T,>(fn: () => Promise<T>) =>
  runAction(async () => {
    const r = await fn();
    refresh();
    return r;
  });

export async function logHabitAction(habitId: string, delta: number) {
  return done(() => habits.logHabit(habitId, delta));
}
export async function createHabitAction(input: { name: string; target?: number; unit?: string | null; cadence?: "DAILY" | "WEEKLY" }) {
  return done(async () => (await habits.createHabit(input)).id);
}
export async function archiveHabitAction(id: string) {
  return done(async () => void (await habits.updateHabit(id, { archived: true })));
}
export async function toggleChecklistItemAction(checklistId: string, itemId: string) {
  return done(async () => void (await routines.toggleChecklistItem(checklistId, itemId)));
}
export async function addChecklistItemAction(checklistId: string, label: string) {
  return done(async () => void (await routines.addChecklistItem(checklistId, label)));
}
export async function deleteChecklistItemAction(id: string) {
  return done(async () => void (await routines.deleteChecklistItem(id)));
}
export async function createChecklistAction(name: string, kind: ChecklistKind) {
  return done(async () => void (await routines.createChecklist(name, kind)));
}
export async function createTemplateAction(input: { name: string; dayType: DayType; days: number[] }) {
  return done(async () => void (await routines.createTemplate(input)));
}
export async function updateTemplateAction(id: string, input: { name?: string; days?: number[]; active?: boolean }) {
  return done(async () => void (await routines.updateTemplate(id, input)));
}
export async function deleteTemplateAction(id: string) {
  return done(async () => void (await routines.deleteTemplate(id)));
}
export async function addBlockAction(templateId: string, input: { title: string; kind: BlockKind; start: string; end: string }) {
  return done(async () => void (await routines.addBlock(templateId, { title: input.title, kind: input.kind, startMin: routines.parseHhmm(input.start), endMin: routines.parseHhmm(input.end) })));
}
export async function updateBlockAction(id: string, input: { title: string; kind: BlockKind; start: string; end: string }) {
  return done(async () => void (await routines.updateBlock(id, { title: input.title, kind: input.kind, startMin: routines.parseHhmm(input.start), endMin: routines.parseHhmm(input.end) })));
}
export async function deleteBlockAction(id: string) {
  return done(async () => void (await routines.deleteBlock(id)));
}
