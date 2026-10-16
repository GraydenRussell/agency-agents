import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { db } from "@/lib/db";

/** Shows when an integration needs the user (e.g. Google refresh token revoked/expired). */
export async function IntegrationBanner() {
  const broken = await db.integrationAccount.findFirst({ where: { status: "NEEDS_REAUTH" } });
  if (!broken) return null;
  return (
    <div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
      <TriangleAlert className="size-4 shrink-0 text-amber-400" />
      <span className="flex-1">{broken.provider === "GOOGLE" ? "Google" : broken.provider} needs to be reconnected; sync is paused.</span>
      <Link href="/settings#integrations" className="font-medium underline">
        Reconnect
      </Link>
    </div>
  );
}
