"use client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NAV } from "@/lib/nav";
import { useShell } from "./shell-context";

const GLOBAL: Array<[string, string]> = [
  ["⌘ K", "Command palette"],
  ["⌘ J", "Assistant panel"],
  ["C", "Quick capture"],
  ["/", "Search"],
  ["?", "This sheet"],
];

export function ShortcutSheet() {
  const { open, setOpen } = useShell();
  return (
    <Dialog open={open.shortcuts} onOpenChange={(v) => setOpen("shortcuts", v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Press G then a letter to jump anywhere.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {GLOBAL.map(([k, label]) => (
            <Row key={k} k={k} label={label} />
          ))}
          {NAV.filter((n) => n.chord).map((n) => (
            <Row key={n.href} k={`G ${n.chord?.toUpperCase()}`} label={n.label} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ k, label }: { k: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/50 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex gap-1">
        {k.split(" ").map((p, i) => (
          <kbd key={i}>{p}</kbd>
        ))}
      </span>
    </div>
  );
}
