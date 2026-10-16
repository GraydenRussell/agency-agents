"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, BookOpen, CalendarPlus, CheckSquare, Loader2, StickyNote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/ui/use-action";
import { useShell } from "@/components/shell/shell-context";
import { parseCapture, type CaptureKind } from "@/lib/capture/parse";
import { AREA_META, PRIORITY_META } from "@/lib/labels";
import { formatDateTime, formatLocalDate, localDateOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { captureAction } from "@/app/(app)/capture-actions";

const KINDS: Array<{ kind: CaptureKind; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { kind: "task", label: "Task", icon: CheckSquare },
  { kind: "event", label: "Event", icon: CalendarPlus },
  { kind: "reminder", label: "Reminder", icon: Bell },
  { kind: "note", label: "Note", icon: StickyNote },
  { kind: "journal", label: "Journal", icon: BookOpen },
];

export function QuickCapture() {
  const { open, setOpen, captureDefault } = useShell();
  return (
    <Dialog open={open.capture} onOpenChange={(v) => setOpen("capture", v)}>
      <DialogContent className="sm:max-w-xl">
        {open.capture && <CaptureForm initial={captureDefault} onDone={() => setOpen("capture", false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CaptureForm({ initial, onDone }: { initial: string; onDone: () => void }) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [override, setOverride] = useState<CaptureKind | null>(null);
  const { pending, run } = useAction();
  const parsed = useMemo(() => (text.trim() ? parseCapture(text) : null), [text]);
  const kind = override ?? parsed?.kind ?? "task";

  const submit = () => {
    if (!text.trim()) return;
    run(() => captureAction(text, override ?? undefined), {
      onSuccess: (r) => {
        onDone();
        toast.success(r.message, { description: r.title, action: { label: "Open", onClick: () => router.push(r.href) } });
      },
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Quick capture</DialogTitle>
        <DialogDescription>Type anything. Dates, times, !1–!4 priority, and #area are understood.</DialogDescription>
      </DialogHeader>
      <Textarea
        autoFocus
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={"call Linda tomorrow 3pm !1 #business\nlunch with Tyce fri 12-1pm\nremind me to move the truck in 2 hours\nnote: pricing idea"}
        aria-label="Capture text"
      />
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type">
        {KINDS.map(({ kind: k, label, icon: Icon }) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setOverride(k === parsed?.kind ? null : k)}
            className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors", kind === k ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-accent")}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>
      {parsed && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm" aria-live="polite">
          <p className="font-medium">{kind === "journal" ? "Add to today's journal" : parsed.title}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {parsed.at && kind !== "note" && kind !== "journal" && <Badge variant="cyan">{parsed.allDay ? formatLocalDate(localDateOf(parsed.at), { weekday: true }) : formatDateTime(parsed.at)}{parsed.end ? ` → ${formatDateTime(parsed.end).split(", ")[1]}` : ""}</Badge>}
            {parsed.priority && <Badge variant="outline">{PRIORITY_META[parsed.priority]?.label}</Badge>}
            {parsed.area && <Badge variant="outline">{AREA_META[parsed.area].label}</Badge>}
            {parsed.tags.map((t) => (
              <Badge key={t} variant="secondary">
                #{t}
              </Badge>
            ))}
            {kind === "reminder" && <Badge variant="warning">Delivery (push/SMS) is enabled in Phase 6</Badge>}
            {kind === "event" && <Badge variant="secondary">Syncs to Google once connected</Badge>}
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending || !text.trim()}>
          {pending && <Loader2 className="animate-spin" />} Save <kbd className="ml-1 border-white/30 bg-white/10 text-white">↵</kbd>
        </Button>
      </div>
    </>
  );
}
