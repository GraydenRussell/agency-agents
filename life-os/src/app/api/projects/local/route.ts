import { z } from "zod";
import { safeEqual } from "@/lib/crypto";
import { localProjectSchema, upsertLocalProjects } from "@/lib/services/projects";

/** Receives local project metadata from `npm run sync:local` on your machine (Bearer PROJECTS_SYNC_TOKEN). */
export async function POST(request: Request) {
  const token = process.env.PROJECTS_SYNC_TOKEN;
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token || token.length < 16 || !got || !safeEqual(got, token)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = z.object({ projects: z.array(localProjectSchema).max(500) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid payload", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  return Response.json(await upsertLocalProjects(parsed.data.projects));
}
