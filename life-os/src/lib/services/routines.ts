import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { BlockKind, ChecklistKind, DayType } from "@/generated/prisma/enums";
import { isoWeekday, today, type LocalDate } from "@/lib/time";

export const blockInputSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    kind: z.enum(Object.values(BlockKind) as [BlockKind, ...BlockKind[]]).default("OTHER"),
    startMin: z.coerce.number().int().min(0).max(24 * 60),
    endMin: z.coerce.number().int().min(0).max(24 * 60),
    color: z.string().max(20).nullish(),
  })
  .refine((b) => b.endMin > b.startMin, { message: "End must be after start", path: ["endMin"] });

export const templateInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  dayType: z.enum(Object.values(DayType) as [DayType, ...DayType[]]),
  days: z.array(z.number().int().min(1).max(7)).min(1),
});

export function parseHhmm(v: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) throw new Error(`Invalid time "${v}"`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) throw new Error(`Invalid time "${v}"`);
  return h * 60 + min;
}

export function toHhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export async function listTemplates() {
  return db.routineTemplate.findMany({ include: { blocks: { orderBy: { startMin: "asc" } } }, orderBy: { createdAt: "asc" } });
}

/** The active template whose days include the date's weekday (CUSTOM beats WEEKDAY/WEEKEND). */
export async function templateForDate(date: LocalDate = today()) {
  const wd = isoWeekday(date);
  const candidates = await db.routineTemplate.findMany({
    where: { active: true, days: { has: wd } },
    include: { blocks: { orderBy: { startMin: "asc" } } },
  });
  return candidates.find((t) => t.dayType === "CUSTOM") ?? candidates[0] ?? null;
}

export async function createTemplate(input: z.infer<typeof templateInputSchema>) {
  return db.routineTemplate.create({ data: templateInputSchema.parse(input) });
}

export async function updateTemplate(id: string, input: Partial<z.infer<typeof templateInputSchema>> & { active?: boolean }) {
  const { active, ...rest } = input;
  return db.routineTemplate.update({ where: { id }, data: { ...templateInputSchema.partial().parse(rest), ...(active === undefined ? {} : { active }) } });
}

export async function deleteTemplate(id: string) {
  return db.routineTemplate.delete({ where: { id } });
}

export async function addBlock(templateId: string, input: z.input<typeof blockInputSchema>) {
  return db.routineBlock.create({ data: { ...blockInputSchema.parse(input), templateId } });
}

export async function updateBlock(id: string, input: z.input<typeof blockInputSchema>) {
  return db.routineBlock.update({ where: { id }, data: blockInputSchema.parse(input) });
}

export async function deleteBlock(id: string) {
  return db.routineBlock.delete({ where: { id } });
}

// ── Checklists ─────────────────────────────────────────────

export async function checklistsForDate(date: LocalDate = today()) {
  const lists = await db.checklist.findMany({
    include: { items: { orderBy: { sortOrder: "asc" } }, runs: { where: { date } } },
    orderBy: { createdAt: "asc" },
  });
  return lists.map((l) => ({ id: l.id, name: l.name, kind: l.kind, items: l.items, checked: l.runs[0]?.checkedItemIds ?? [] }));
}

export async function toggleChecklistItem(checklistId: string, itemId: string, date: LocalDate = today()) {
  const run = await db.checklistRun.findUnique({ where: { checklistId_date: { checklistId, date } } });
  const current = new Set(run?.checkedItemIds ?? []);
  if (current.has(itemId)) current.delete(itemId);
  else current.add(itemId);
  return db.checklistRun.upsert({
    where: { checklistId_date: { checklistId, date } },
    create: { checklistId, date, checkedItemIds: [...current] },
    update: { checkedItemIds: [...current] },
  });
}

export async function createChecklist(name: string, kind: ChecklistKind) {
  return db.checklist.create({ data: { name: name.trim(), kind } });
}

export async function addChecklistItem(checklistId: string, label: string) {
  const max = await db.checklistItem.aggregate({ where: { checklistId }, _max: { sortOrder: true } });
  return db.checklistItem.create({ data: { checklistId, label: label.trim(), sortOrder: (max._max.sortOrder ?? 0) + 1 } });
}

export async function deleteChecklistItem(id: string) {
  return db.checklistItem.delete({ where: { id } });
}

export async function deleteChecklist(id: string) {
  return db.checklist.delete({ where: { id } });
}
