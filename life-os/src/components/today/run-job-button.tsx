"use client";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/ui/use-action";
import { runJobAction } from "@/app/(app)/settings/actions";

export function RunJobButton({ job, label }: { job: string; label: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => runJobAction(job), { success: (s) => s })}>
      <Sparkles /> {pending ? "Working…" : label}
    </Button>
  );
}
