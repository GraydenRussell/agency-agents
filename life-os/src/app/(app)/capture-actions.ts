"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import type { CaptureKind } from "@/lib/capture/parse";
import { captureText } from "@/lib/services/capture";

export async function captureAction(text: string, kind?: CaptureKind) {
  return runAction(async () => {
    if (!text.trim()) throw new Error("Nothing to capture");
    const r = await captureText(text, kind);
    revalidatePath("/", "layout");
    return r;
  });
}
