import { z } from "zod";
import { getUserOrNull } from "@/lib/auth/session";
import { db } from "@/lib/db";

const sub = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) });

export async function POST(request: Request) {
  if (!(await getUserOrNull())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = sub.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid subscription" }, { status: 400 });
  const { endpoint, keys } = parsed.data;
  await db.pushSubscription.upsert({ where: { endpoint }, create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: request.headers.get("user-agent") }, update: { p256dh: keys.p256dh, auth: keys.auth } });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!(await getUserOrNull())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: string };
  if (endpoint) await db.pushSubscription.deleteMany({ where: { endpoint } });
  return Response.json({ ok: true });
}
