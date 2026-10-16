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

export async function captureWithAIAction(text: string) {
  return runAction(async () => {
    if (!text.trim()) throw new Error("Nothing to capture");
    const { aiParseCapture } = await import("@/lib/ai/capture");
    const { commitCapture } = await import("@/lib/services/capture");
    const parsed = await aiParseCapture(text);
    const r = await commitCapture(parsed);
    revalidatePath("/", "layout");
    return { ...r, source: parsed.source };
  });
}
