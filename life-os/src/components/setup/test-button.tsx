"use client";
import { useState } from "react";
import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/ui/use-action";
import { testSetupItemAction } from "@/app/(app)/setup/actions";

export function SetupTestButton({ id, name }: { id: string; name: string }) {
  const { pending, run } = useAction();
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => testSetupItemAction(id), { onSuccess: setResult })} aria-label={`Test ${name}`}>
        {pending ? <Loader2 className="animate-spin" /> : <PlugZap />} Test
      </Button>
      {result ? (
        <span role="status" className={result.ok ? "inline-flex items-center gap-1 text-xs text-emerald-400" : "inline-flex items-center gap-1 text-xs text-red-400"}>
          {result.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
          {result.detail}
        </span>
      ) : null}
    </div>
  );
}
