"use client";
import { Zap } from "lucide-react";
import { useShell } from "@/components/shell/shell-context";

export function CaptureBox() {
  const { openCapture } = useShell();
  return (
    <button
      type="button"
      onClick={() => openCapture()}
      className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-accent/40"
    >
      <Zap className="size-4 text-brand-cyan" />
      <span className="flex-1">Capture anything: task, note, event, reminder…</span>
      <kbd>C</kbd>
    </button>
  );
}
