/** Fail fast with a readable message when required environment variables are missing or invalid. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { env } = await import("@/lib/env");
  env();
}
