import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { addDays, today, weekRange, type LocalDate } from "@/lib/time";

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const workoutSchema = z.object({
  date: localDate,
  type: z.string().trim().min(1).max(60),
  durationMin: z.coerce.number().int().min(1).max(600),
  intensity: z.coerce.number().int().min(1).max(5).nullish(),
  notes: z.string().max(1000).nullish(),
});

export async function logWorkout(input: z.input<typeof workoutSchema>) {
  return db.workout.create({ data: workoutSchema.parse(input) });
}
export async function deleteWorkout(id: string) {
  return db.workout.delete({ where: { id } });
}

export async function logSleep(date: LocalDate, hours: number, quality?: number | null) {
  const d = z.object({ date: localDate, hours: z.number().min(0).max(24), quality: z.number().int().min(1).max(5).nullish() }).parse({ date, hours, quality });
  return db.sleepLog.upsert({ where: { date: d.date }, create: d, update: { hours: d.hours, quality: d.quality } });
}

/** Adds (or subtracts) ounces for the day; never below zero. */
export async function addWater(date: LocalDate, ounces: number) {
  const cur = await db.waterLog.findUnique({ where: { date } });
  const next = Math.max(0, (cur?.ounces ?? 0) + Math.round(ounces));
  return db.waterLog.upsert({ where: { date }, create: { date, ounces: next }, update: { ounces: next } });
}

export const WATER_TARGET_OZ = 100; // Phoenix heat + outdoor work
export const SLEEP_TARGET_H = 7.5;

export async function healthSummary(days = 14, end: LocalDate = today()) {
  const start = addDays(end, -(days - 1));
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  const [sleep, water, workouts] = await Promise.all([
    db.sleepLog.findMany({ where: { date: { gte: start, lte: end } } }),
    db.waterLog.findMany({ where: { date: { gte: start, lte: end } } }),
    db.workout.findMany({ where: { date: { gte: addDays(end, -7 * 8 + 1), lte: end } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
  ]);
  const sleepBy = new Map(sleep.map((s) => [s.date, s]));
  const waterBy = new Map(water.map((w) => [w.date, w.ounces]));
  // Weekly workout minutes for the last 8 Monday-start weeks.
  const weeks = Array.from({ length: 8 }, (_, i) => weekRange(addDays(end, -7 * (7 - i))).start);
  const weekly = weeks.map((ws) => ({ week: ws, minutes: workouts.filter((w) => w.date >= ws && w.date <= addDays(ws, 6)).reduce((n, w) => n + w.durationMin, 0) }));
  const sleepVals = dates.map((d) => sleepBy.get(d)?.hours ?? null);
  const logged = sleepVals.filter((v): v is number => v !== null);
  return {
    dates,
    sleep: dates.map((d) => ({ date: d, hours: sleepBy.get(d)?.hours ?? null, quality: sleepBy.get(d)?.quality ?? null })),
    water: dates.map((d) => ({ date: d, ounces: waterBy.get(d) ?? 0 })),
    weekly,
    recentWorkouts: workouts.slice(0, 15),
    avgSleep: logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : null,
    waterToday: waterBy.get(end) ?? 0,
    workoutsThisWeek: workouts.filter((w) => w.date >= weekRange(end).start).length,
  };
}
