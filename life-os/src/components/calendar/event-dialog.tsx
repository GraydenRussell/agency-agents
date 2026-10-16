"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/ui/use-action";
import { addDays, atLocalMinutes, fromLocalInput, localDateOf, toLocalInput } from "@/lib/time";
import { createEventAction, deleteEventAction, restoreEventAction, updateEventAction } from "@/app/(app)/calendar/actions";

export type EventDraft = {
  id?: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location: string;
  description: string;
  attendees: string;
  source: string;
  taskId: string | null;
};

export function parseAttendees(raw: string) {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s))
    .map((email) => ({ email }));
}

export function EventDialog({ draft, onClose }: { draft: EventDraft; onClose: () => void }) {
  const [v, setV] = useState(draft);
  const [startStr, setStartStr] = useState(draft.allDay ? localDateOf(draft.start) : toLocalInput(draft.start));
  const [endStr, setEndStr] = useState(draft.allDay ? localDateOf(new Date(draft.end.getTime() - 1)) : toLocalInput(draft.end));
  const { pending, run } = useAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const start = v.allDay ? atLocalMinutes(startStr.slice(0, 10), 0) : fromLocalInput(startStr);
    const end = v.allDay ? atLocalMinutes(addDays(endStr.slice(0, 10), 1), 0) : fromLocalInput(endStr);
    if (!start || !end) return toast.error("Start and end are required");
    const payload = { title: v.title, start, end, allDay: v.allDay, location: v.location || null, description: v.description || null, attendees: parseAttendees(v.attendees) };
    run(() => (v.id ? updateEventAction(v.id, payload) : createEventAction(payload)), { success: v.id ? "Event updated" : "Event created", onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{v.id ? "Edit event" : "New event"}</DialogTitle>
          <DialogDescription>{v.source === "GOOGLE" ? "Changes sync to Google Calendar." : "Saved here and synced to Google when connected."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ev-title">Title</Label>
            <Input id="ev-title" required autoFocus value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={v.allDay}
              onCheckedChange={(allDay) => {
                setV({ ...v, allDay });
                setStartStr(allDay ? startStr.slice(0, 10) : `${startStr.slice(0, 10)}T09:00`);
                setEndStr(allDay ? endStr.slice(0, 10) : `${endStr.slice(0, 10)}T10:00`);
              }}
            />
            All day
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-start">Start</Label>
              <Input id="ev-start" type={v.allDay ? "date" : "datetime-local"} required value={startStr} onChange={(e) => setStartStr(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-end">End</Label>
              <Input id="ev-end" type={v.allDay ? "date" : "datetime-local"} required value={endStr} onChange={(e) => setEndStr(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-loc">Location</Label>
            <Input id="ev-loc" value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-att">Guests (emails)</Label>
            <Input id="ev-att" value={v.attendees} onChange={(e) => setV({ ...v, attendees: e.target.value })} placeholder="tyce@example.com" />
            {parseAttendees(v.attendees).length > 0 && <p className="text-xs text-amber-400">Guests get a Google Calendar invite/update email when this syncs.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-desc">Description</Label>
            <Textarea id="ev-desc" rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
          </div>
          {v.taskId && (
            <p className="text-xs text-muted-foreground">
              Time block for a{" "}
              <Link className="underline" href={`/tasks?task=${v.taskId}`}>
                task
              </Link>
              .
            </p>
          )}
          <DialogFooter>
            {v.id && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto text-red-400"
                onClick={() =>
                  run(() => deleteEventAction(v.id as string), {
                    onSuccess: () => {
                      onClose();
                      toast("Event deleted", { action: { label: "Undo", onClick: () => void restoreEventAction(v.id as string) } });
                    },
                  })
                }
              >
                Delete
              </Button>
            )}
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
