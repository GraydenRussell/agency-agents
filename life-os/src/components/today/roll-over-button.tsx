"use client";
import { CalendarArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/ui/use-action";
import { rollOverAction } from "@/app/(app)/tasks/actions";

export function RollOverButton({ ids, to }: { ids: string[]; to: string }) {
  const { pending, run } = useAction();
  return (
    <Button variant="ghost" size="sm" disabled={pending || ids.length === 0} onClick={() => run(() => rollOverAction(ids, to), { success: (n) => `Moved ${n} to today` })}>
      <CalendarArrowDown /> Move all to today
    </Button>
  );
}
