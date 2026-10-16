"use client";
import { Bot } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useShell } from "@/components/shell/shell-context";

export function AssistantPanel() {
  const { open, setOpen } = useShell();
  return (
    <Sheet open={open.assistant} onOpenChange={(v) => setOpen("assistant", v)}>
      <SheetContent className="p-5">
        <SheetTitle className="flex items-center gap-2 font-heading text-3xl tracking-wider">
          <Bot className="size-6 text-brand-cyan" /> Assistant
        </SheetTitle>
        <SheetDescription className="mt-2 text-sm text-muted-foreground">The assistant (tools, memory, approvals) is built in Phase 5.</SheetDescription>
      </SheetContent>
    </Sheet>
  );
}
