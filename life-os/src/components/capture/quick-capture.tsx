"use client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useShell } from "@/components/shell/shell-context";

export function QuickCapture() {
  const { open, setOpen } = useShell();
  return (
    <Dialog open={open.capture} onOpenChange={(v) => setOpen("capture", v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quick capture</DialogTitle>
          <DialogDescription>Capture is wired up in Phase 2.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
