import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export type JobOutcome = { status: "ran"; summary: string } | { status: "skipped"; reason: string } | { status: "failed"; error: string };

/**
 * Runs `fn` at most once per (job, slot). A failed run may be retried in the same slot;
 * a successful one is never repeated (pg_cron/Vercel retries and double-fires are harmless).
 */
export async function runJob(job: string, slot: string, fn: () => Promise<string>): Promise<JobOutcome> {
  let run;
  try {
    run = await db.jobRun.create({ data: { job, slot } });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    const existing = await db.jobRun.findUniqueOrThrow({ where: { job_slot: { job, slot } } });
    if (existing.ok !== false) return { status: "skipped", reason: existing.ok ? "already ran for this slot" : "already running" };
    // Retry a failed slot: claim it atomically.
    const claimed = await db.jobRun.updateMany({ where: { id: existing.id, ok: false }, data: { ok: null, startedAt: new Date(), error: null, finishedAt: null } });
    if (claimed.count === 0) return { status: "skipped", reason: "another retry is in progress" };
    run = existing;
  }
  try {
    const summary = await fn();
    await db.jobRun.update({ where: { id: run.id }, data: { ok: true, finishedAt: new Date(), summary: summary.slice(0, 1000) } });
    return { status: "ran", summary };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[job:${job}]`, e);
    await db.jobRun.update({ where: { id: run.id }, data: { ok: false, finishedAt: new Date(), error: error.slice(0, 1000) } });
    return { status: "failed", error };
  }
}
