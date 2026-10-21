"use client";
import { PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/ui/use-action";
import { rescheduleTaskAction } from "@/app/(app)/business/actions";

export function RescheduleButton({ jobId, toDate, who }: { jobId: string; toDate: string | null; who: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => rescheduleTaskAction(jobId, toDate), { success: (t) => `Task added: ${t}` })} aria-label={`Add a task to call ${who} about rescheduling`}>
      <PhoneCall /> Call task
    </Button>
  );
}
