import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail, isDevAuth, isPublicPath } from "@/lib/auth/config";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isDevAuth()) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return new NextResponse("Auth is not configured (set Supabase env vars or AUTH_MODE=dev).", { status: 500 });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Refreshes the session cookie when needed and verifies the JWT.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (isPublicPath(pathname)) return response;

  const isApi = pathname.startsWith("/api/");
  const deny = (to: string) =>
    isApi
      ? NextResponse.json({ error: "unauthorized" }, { status: 401 })
      : NextResponse.redirect(new URL(to, request.url));

  if (!claims) return deny("/login");
  if (!isAllowedEmail(typeof claims.email === "string" ? claims.email : null)) {
    return deny("/login?error=not_allowed");
  }
  if (claims.aal !== "aal2") return deny("/mfa");

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|fonts/|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
