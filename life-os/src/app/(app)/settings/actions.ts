"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { disconnectGoogle } from "@/lib/integrations/google/oauth";
import { refreshCalendarList } from "@/lib/services/calendar";
import { z } from "zod";
import { db } from "@/lib/db";
import { setSetting, type SettingKey, type SettingValue } from "@/lib/services/settings";

export async function disconnectGoogleAction() {
  return runAction(async () => {
    await disconnectGoogle();
    revalidatePath("/", "layout");
    return undefined;
  });
}

export async function refreshCalendarsAction() {
  return runAction(async () => {
    const cals = await refreshCalendarList();
    revalidatePath("/settings");
    return cals.length;
  });
}


export async function saveSettingAction<K extends SettingKey>(key: K, value: SettingValue<K>) {
  return runAction(async () => {
    await setSetting(key, value);
    revalidatePath("/settings");
    return undefined;
  });
}

const memorySchema = z.object({ key: z.string().trim().min(2).max(80).regex(/^[a-z0-9_.-]+$/, "Use lowercase letters, numbers, dots, dashes"), value: z.string().trim().min(1).max(2000), kind: z.enum(["FACT", "PREFERENCE", "STYLE", "PERSON"]) });

export async function saveMemoryAction(input: z.input<typeof memorySchema>) {
  return runAction(async () => {
    const m = memorySchema.parse(input);
    await db.memory.upsert({ where: { key: m.key }, create: { ...m, source: "user" }, update: { value: m.value, kind: m.kind, source: "user" } });
    revalidatePath("/settings");
    return undefined;
  });
}

export async function deleteMemoryAction(key: string) {
  return runAction(async () => {
    await db.memory.delete({ where: { key } });
    revalidatePath("/settings");
    return undefined;
  });
}
