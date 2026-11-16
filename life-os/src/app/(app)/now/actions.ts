"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { runAction } from "@/lib/actions";
import { doNowAction } from "@/lib/services/do-now";

export async function doNowItemAction(key: string, op: string) {
  return runAction(async () => {
    const msg = await doNowAction(key, op);
    // Approvals log themselves through the executor; everything else is logged here.
    if (!key.startsWith("approval:")) await db.activityLog.create({ data: { actor: "USER", actionType: `donow.${op}`, summary: `${msg} (${key.split(":")[0]})`, input: { key, op } } });
    revalidatePath("/", "layout");
    return msg;
  });
}
