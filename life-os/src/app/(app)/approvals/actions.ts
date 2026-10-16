"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { approve, reject, undoActivity } from "@/lib/assistant/executor";

const refresh = () => revalidatePath("/", "layout");

export async function approveAction(id: string) {
  return runAction(async () => {
    const r = await approve(id);
    refresh();
    if (r.status === "error") throw new Error(r.error);
    return r.status === "ok" ? r.summary : "Queued";
  });
}

export async function rejectAction(id: string, reason?: string) {
  return runAction(async () => {
    const ok = await reject(id, reason);
    refresh();
    if (!ok) throw new Error("This request was already handled.");
    return undefined;
  });
}

export async function undoAction(activityId: string) {
  return runAction(async () => {
    await undoActivity(activityId);
    refresh();
    return undefined;
  });
}
