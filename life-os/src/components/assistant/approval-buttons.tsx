"use client";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/ui/use-action";
import { approveAction, rejectAction } from "@/app/(app)/approvals/actions";

export function ApprovalButtons({ id }: { id: string }) {
  const { pending, run } = useAction();
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => run(() => approveAction(id), { success: (s) => `Done: ${s.split("\n")[0]}` })}>
        <Check /> Approve
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => rejectAction(id), { success: "Rejected" })}>
        <X /> Reject
      </Button>
    </div>
  );
}
