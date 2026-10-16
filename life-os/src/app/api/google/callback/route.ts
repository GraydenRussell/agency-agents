import { NextResponse, type NextRequest } from "next/server";
import { getUserOrNull } from "@/lib/auth/session";
import { safeEqual } from "@/lib/crypto";
import { exchangeCode } from "@/lib/integrations/google/oauth";
import { refreshCalendarList, syncAll } from "@/lib/services/calendar";

export async function GET(request: NextRequest) {
  if (!(await getUserOrNull())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = request.nextUrl;
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/settings?${q}`, request.url));
    res.cookies.delete({ name: "g_oauth_state", path: "/api/google" });
    return res;
  };
  const error = url.searchParams.get("error");
  if (error) return back(`google_error=${encodeURIComponent(error)}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = request.cookies.get("g_oauth_state")?.value;
  if (!code || !state || !expected || !safeEqual(state, expected)) return back("google_error=state_mismatch");
  try {
    await exchangeCode(code);
    await refreshCalendarList();
    await syncAll();
    return back("connected=google");
  } catch (e) {
    console.error("[google.callback]", e);
    return back(`google_error=${encodeURIComponent(e instanceof Error ? e.message : "unknown")}`);
  }
}
