import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getUserOrNull } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isMock } from "@/lib/integrations/mode";
import { buildAuthUrl } from "@/lib/integrations/google/oauth";

export async function GET(request: Request) {
  if (!(await getUserOrNull())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (isMock()) {
    // Mock mode: pretend the consent screen succeeded.
    const existing = await db.integrationAccount.findFirst({ where: { provider: "GOOGLE" } });
    const data = { accountEmail: "grayden@sample.test", status: "CONNECTED" as const, scopes: ["mock"], lastError: null };
    if (existing) await db.integrationAccount.update({ where: { id: existing.id }, data });
    else await db.integrationAccount.create({ data: { provider: "GOOGLE", ...data } });
    return NextResponse.redirect(new URL("/settings?connected=google", request.url));
  }
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set("g_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/api/google" });
  return res;
}
