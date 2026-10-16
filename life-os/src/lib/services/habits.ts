import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { addDays, today, weekRange, type LocalDate } from "@/lib/time";
import { areaSchema } from "./tasks";

// No .default(): Zod 4 applies defaults inside .partial(), which would reset fields on update.
export const habitUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    area: areaSchema,
    cadence: z.enum(["DAILY", "WEEKLY"]),
    target: z.coerce.number().int().min(1).max(100),
    unit: z.string().max(20).nullish(),
    icon: z.string().max(30).nullish(),
  })
  .partial();
export const habitInputSchema = habitUpdateSchema.required({ name: true });

/**
 * Pure streak calculation for daily habits. A day counts when value >= target.
 * Today not being done yet doesn't break the streak (it's still in progress).
 */
export function dailyStreak(logs: Map<LocalDate, number>, target: number, todayDate: LocalDate): number {
  let streak = 0;
  let d = todayDate;
  if ((logs.get(d) ?? 0) < target) d = addDays(d, -1);
  while ((logs.get(d) ?? 0) >= target) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

/** Weekly habits: consecutive Monday-start weeks whose summed value meets the target. */
export function weeklyStreak(logs: Map<LocalDate, number>, target: number, todayDate: LocalDate): number {
  const weekSum = (start: LocalDate) => {
    let s = 0;
    for (let i = 0; i < 7; i++) s += logs.get(addDays(start, i)) ?? 0;
    return s;
  };
  let start = weekRange(todayDate).start;
  let streak = 0;
  if (weekSum(start) < target) start = addDays(start, -7);
  while (weekSum(start) >= target) {
    streak++;
    start = addDays(start, -7);
  }
  return streak;
}

export type HabitStatus = {
  id: string;
  name: string;
  icon: string | null;
  unit: string | null;
  area: string;
  cadence: "DAILY" | "WEEKLY";
  target: number;
  todayValue: number;
  periodValue: number;
  streak: number;
  last7: Array<{ date: LocalDate; value: number }>;
};

export async function habitsWithStatus(date: LocalDate = today()): Promise<HabitStatus[]> {
  const since = addDays(date, -400);
  const habits = await db.habit.findMany({
    where: { archived: false },
    include: { logs: { where: { date: { gte: since } } } },
    orderBy: { sortOrder: "asc" },
  });
  return habits.map((h) => {
    const logs = new Map(h.logs.map((l) => [l.date, l.value]));
    const week = weekRange(date);
    let weekValue = 0;
    for (let i = 0; i < 7; i++) weekValue += logs.get(addDays(week.start, i)) ?? 0;
    return {
      id: h.id,
      name: h.name,
      icon: h.icon,
      unit: h.unit,
      area: h.area,
      cadence: h.cadence,
      target: h.target,
      todayValue: logs.get(date) ?? 0,
      periodValue: h.cadence === "DAILY" ? (logs.get(date) ?? 0) : weekValue,
      streak: h.cadence === "DAILY" ? dailyStreak(logs, h.target, date) : weeklyStreak(logs, h.target, date),
      last7: Array.from({ length: 7 }, (_, i) => {
        const d = addDays(date, i - 6);
        return { date: d, value: logs.get(d) ?? 0 };
      }),
    };
  });
}

/** Adds `delta` to the day's value (clamped at 0). Deletes the log when it reaches 0. */
export async function logHabit(habitId: string, delta: number, date: LocalDate = today()) {
  const existing = await db.habitLog.findUnique({ where: { habitId_date: { habitId, date } } });
  const value = Math.max(0, (existing?.value ?? 0) + delta);
  if (value === 0) {
    if (existing) await db.habitLog.delete({ where: { id: existing.id } });
    return 0;
  }
  await db.habitLog.upsert({ where: { habitId_date: { habitId, date } }, create: { habitId, date, value }, update: { value } });
  return value;
}

export async function createHabit(input: z.input<typeof habitInputSchema>) {
  const max = await db.habit.aggregate({ _max: { sortOrder: true } });
  return db.habit.create({ data: { ...habitInputSchema.parse(input), sortOrder: (max._max.sortOrder ?? 0) + 1 } });
}

export async function updateHabit(id: string, input: z.input<typeof habitUpdateSchema> & { archived?: boolean }) {
  const { archived, ...rest } = input;
  return db.habit.update({ where: { id }, data: { ...habitUpdateSchema.parse(rest), ...(archived === undefined ? {} : { archived }) } });
}
