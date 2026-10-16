import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { JOBS, runNamedJob } from "@/lib/automations";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const header = request.headers.get("x-cron-secret") ?? "";
  return (bearer && safeEqual(bearer, secret)) || (header !== "" && safeEqual(header, secret));
}

/**
 * Scheduled job endpoint. Called by Supabase pg_cron (POST, x-cron-secret) or Vercel Cron
 * (GET, Authorization: Bearer CRON_SECRET). Idempotent per job slot.
 */
async function handle(request: Request, { params }: { params: Promise<{ job: string }> }) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { job } = await params;
  if (!JOBS[job]) return NextResponse.json({ error: `unknown job ${job}`, jobs: Object.keys(JOBS) }, { status: 404 });
  const outcome = await runNamedJob(job);
  return NextResponse.json({ job, ...outcome }, { status: outcome.status === "failed" ? 500 : 200 });
}

export const GET = handle;
export const POST = handle;
