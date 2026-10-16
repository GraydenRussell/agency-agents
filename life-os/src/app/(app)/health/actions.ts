"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import * as health from "@/lib/services/health";

const done = <T,>(fn: () => Promise<T>) =>
  runAction(async () => {
    const r = await fn();
    revalidatePath("/health");
    revalidatePath("/today");
    return r;
  });

export async function logWorkoutAction(input: { date: string; type: string; durationMin: number; intensity?: number | null; notes?: string | null }) {
  return done(async () => void (await health.logWorkout(input)));
}
export async function deleteWorkoutAction(id: string) {
  return done(async () => void (await health.deleteWorkout(id)));
}
export async function logSleepAction(date: string, hours: number, quality?: number | null) {
  return done(async () => void (await health.logSleep(date, hours, quality)));
}
export async function addWaterAction(date: string, ounces: number) {
  return done(async () => (await health.addWater(date, ounces)).ounces);
}
