"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { disconnectGoogle } from "@/lib/integrations/google/oauth";
import { refreshCalendarList } from "@/lib/services/calendar";

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
