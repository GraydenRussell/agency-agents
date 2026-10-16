"use client";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/ui/use-action";
import { cn } from "@/lib/utils";
import { syncInboxAction } from "@/app/(app)/inbox/actions";

export function SyncInboxButton() {
  const { pending, run } = useAction();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => syncInboxAction(), { success: (m) => m })}>
      <RefreshCw className={cn(pending && "animate-spin")} /> Sync
    </Button>
  );
}
