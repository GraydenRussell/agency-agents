import "server-only";
import { ZodError } from "zod";
import { requireUser } from "@/lib/auth/session";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Wraps a server action body: auth check, error → friendly message (never throws to the client). */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  await requireUser();
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: e.issues.map((i) => i.message).join("; ") };
    if (e instanceof Error) {
      // Next's redirect/notFound use thrown errors with a digest; let them propagate.
      if ("digest" in e && typeof (e as { digest?: unknown }).digest === "string" && String((e as { digest: string }).digest).startsWith("NEXT_")) throw e;
      console.error("[action]", e);
      return { ok: false, error: e.message };
    }
    return { ok: false, error: "Unexpected error" };
  }
}
