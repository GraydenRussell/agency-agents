"use client";
import { useState } from "react";
import Link from "next/link";
import { BellOff, Clock, MessageSquare, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/ui/use-action";
import { rebookOptOutAction, sendRebookAction, snoozeRebookAction } from "@/app/(app)/business/actions";

export type RebookRowView = { customerId: string; name: string; city: string | null; lastCleanedLabel: string; dueLabel: string; daysUntil: number; bucket: "overdue" | "due" | "soon"; lastTotal: string; intervalMonths: number; canText: boolean; draft: string };

export function RebookRow({ r, smsReady }: { r: RebookRowView; smsReady: boolean }) {
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(r.draft);
  const when = r.daysUntil < 0 ? `${-r.daysUntil} days overdue` : r.daysUntil === 0 ? "due today" : `due in ${r.daysUntil} days`;
  return (
    <li className="py-3" data-testid="rebook-row">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1">
          <Link href={`/business/customers/${r.customerId}`} className="font-medium hover:underline">{r.name}</Link>
          <span className="block text-xs text-muted-foreground">{[r.city, `last cleaned ${r.lastCleanedLabel} (${r.lastTotal})`, `every ${r.intervalMonths} mo`].filter(Boolean).join(" · ")}</span>
        </span>
        <Badge variant={r.bucket === "overdue" ? "danger" : r.bucket === "due" ? "warning" : "outline"}>{when}</Badge>
        <div className="flex gap-1">
          <Button size="sm" disabled={!r.canText || !smsReady} onClick={() => setOpen(!open)} title={!r.canText ? "No textable phone number" : !smsReady ? "Set up Twilio to text customers" : undefined}><MessageSquare /> Text</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => snoozeRebookAction(r.customerId, 30), { success: `${r.name} snoozed 30 days` })} aria-label={`Snooze ${r.name} 30 days`}><Clock /></Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => rebookOptOutAction(r.customerId, true), { success: `Won't suggest ${r.name} again` })} aria-label={`Don't suggest ${r.name} again`}><BellOff /></Button>
        </div>
      </div>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg bg-muted/50 p-3">
          <Label htmlFor={`rb-${r.customerId}`}>Text to {r.name}</Label>
          <Textarea id={`rb-${r.customerId}`} rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={pending || !body.trim()} onClick={() => run(() => sendRebookAction(r.customerId, body), { success: (m) => m, onSuccess: () => setOpen(false) })}><Send /> Send</Button>
          </div>
        </div>
      )}
    </li>
  );
}
