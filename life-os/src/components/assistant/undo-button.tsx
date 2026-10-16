"use client";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/ui/use-action";
import { undoAction } from "@/app/(app)/approvals/actions";

export function UndoButton({ id }: { id: string }) {
  const { pending, run } = useAction();
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => undoAction(id), { success: "Undone" })}>
      <Undo2 /> Undo
    </Button>
  );
}
