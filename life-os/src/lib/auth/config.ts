/**
 * Auth mode helpers. Deliberately free of `server-only` so proxy.ts can import it.
 */
export function isDevAuth(): boolean {
  return process.env.AUTH_MODE === "dev" && !process.env.VERCEL;
}

export function allowedEmail(): string {
  return (process.env.ALLOWED_EMAIL ?? "").trim().toLowerCase();
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  const allowed = allowedEmail();
  return Boolean(allowed) && (email ?? "").trim().toLowerCase() === allowed;
}

export const PUBLIC_PATHS = ["/login", "/mfa", "/auth", "/api/cron", "/api/health", "/manifest.webmanifest", "/sw.js", "/offline"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
