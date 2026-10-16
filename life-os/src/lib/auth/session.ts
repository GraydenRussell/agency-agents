import "server-only";
import { redirect } from "next/navigation";
import { allowedEmail, isAllowedEmail, isDevAuth } from "./config";
import { createSupabaseServerClient } from "./supabase-server";

export type AppUser = { email: string; mode: "dev" | "supabase" };

/**
 * Defense in depth: proxy.ts already guards every route, but every server action and
 * route handler calls this too so a misconfigured matcher can never expose data.
 */
export async function requireUser(): Promise<AppUser> {
  if (isDevAuth()) return { email: allowedEmail() || "dev@localhost", mode: "dev" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims) redirect("/login");
  const email = typeof claims.email === "string" ? claims.email : null;
  if (!isAllowedEmail(email)) redirect("/login?error=not_allowed");
  if (claims.aal !== "aal2") redirect("/mfa");
  return { email: email as string, mode: "supabase" };
}

/** Variant for route handlers: returns null instead of redirecting. */
export async function getUserOrNull(): Promise<AppUser | null> {
  if (isDevAuth()) return { email: allowedEmail() || "dev@localhost", mode: "dev" };
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims || claims.aal !== "aal2") return null;
    const email = typeof claims.email === "string" ? claims.email : null;
    return isAllowedEmail(email) ? { email: email as string, mode: "supabase" } : null;
  } catch {
    return null;
  }
}
