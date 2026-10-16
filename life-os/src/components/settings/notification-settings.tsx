"use client";
import { useState } from "react";
import { Play, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/components/ui/use-action";
import { cancelReminderAction, runJobAction, saveSettingAction, sendTestNotificationAction } from "@/app/(app)/settings/actions";
import { PushToggle } from "./push-toggle";

type Channel = "SMS" | "PUSH" | "EMAIL";

export function NotificationSettings(p: {
  status: Record<Channel, { ready: boolean; reason?: string }>;
  briefChannels: Channel[];
  quiet: { start: string; end: string };
  threshold: number;
  devices: number;
}) {
  const { pending, run } = useAction();
  const [channels, setChannels] = useState(p.briefChannels);
  const [quiet, setQuiet] = useState(p.quiet);
  const [threshold, setThreshold] = useState(String(p.threshold));
  const labels: Record<Channel, string> = { PUSH: "Push", SMS: "SMS", EMAIL: "Email" };
  return (
    <Card id="notifications">
      <CardHeader>
        <div>
          <CardTitle className="text-foreground">Notifications</CardTitle>
          <CardDescription className="mt-1">Reminders, briefs, and important-email alerts.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <ul className="space-y-2">
          {(Object.keys(labels) as Channel[]).map((c) => (
            <li key={c} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-14 font-medium">{labels[c]}</span>
              {p.status[c].ready ? <Badge variant="success">ready</Badge> : <Badge variant="warning" title={p.status[c].reason}>not configured</Badge>}
              {c === "PUSH" && <span className="text-xs text-muted-foreground">{p.devices} device(s)</span>}
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => sendTestNotificationAction(c), { success: (ch) => `Test sent via ${ch}` })}>
                <Send /> Test
              </Button>
              {!p.status[c].ready && <span className="basis-full text-xs text-muted-foreground">{p.status[c].reason}</span>}
            </li>
          ))}
        </ul>
        <PushToggle />
        <div>
          <p className="mb-2 text-sm font-medium">Send briefs via</p>
          <div className="flex flex-wrap gap-4">
            {(Object.keys(labels) as Channel[]).map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <Switch
                  checked={channels.includes(c)}
                  onCheckedChange={(v) => {
                    const next = v ? [...channels, c] : channels.filter((x) => x !== c);
                    setChannels(next);
                    run(() => saveSettingAction("notifications.briefChannels", next), { success: "Saved" });
                  }}
                />
                {labels[c]}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Briefs always appear on the Today page.</p>
        </div>
        <form
          className="grid grid-cols-3 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              async () => {
                const a = await saveSettingAction("notifications.quietHours", quiet);
                if (!a.ok) return a;
                return saveSettingAction("notifications.highPriorityThreshold", Number(threshold));
              },
              { success: "Saved" },
            );
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="qs">Quiet from</Label>
            <Input id="qs" type="time" value={quiet.start} onChange={(e) => setQuiet({ ...quiet, start: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qe">Until</Label>
            <Input id="qe" type="time" value={quiet.end} onChange={(e) => setQuiet({ ...quiet, end: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="th">Alert at priority ≥</Label>
            <Input id="th" type="number" min={0} max={100} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </div>
          <Button type="submit" variant="outline" size="sm" className="col-span-3 justify-self-start" disabled={pending}>
            Save
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">Quiet hours hold SMS and push (email still arrives). Reminders you set explicitly always go through.</p>
      </CardContent>
    </Card>
  );
}

export function RemindersCard({ reminders }: { reminders: Array<{ id: string; title: string; next: string | null; recurring: string | null; channels: string[]; status: string; lastError: string | null }> }) {
  const { run } = useAction();
  return (
    <Card id="reminders">
      <CardHeader>
        <CardTitle className="text-foreground">Reminders</CardTitle>
      </CardHeader>
      <CardContent>
        {reminders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reminders. Capture one with “remind me to … at 5pm” or ask the assistant.</p>
        ) : (
          <ul className="divide-y divide-border">
            {reminders.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.status === "SCHEDULED" ? (r.next ?? "") : r.status.toLowerCase()} {r.recurring ? `· ${r.recurring}` : ""} · {r.channels.join("/")}
                    {r.lastError && <span className="text-red-400"> · {r.lastError}</span>}
                  </p>
                </div>
                {r.status === "SCHEDULED" && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Cancel ${r.title}`} onClick={() => run(() => cancelReminderAction(r.id), { success: "Reminder canceled" })}>
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function AutomationsCard({ jobs }: { jobs: Array<{ name: string; label: string; schedule: string; last: { at: string; ok: boolean | null; summary: string | null; error: string | null } | null }> }) {
  const { pending, run } = useAction();
  return (
    <Card id="automations">
      <CardHeader>
        <div>
          <CardTitle className="text-foreground">Automations</CardTitle>
          <CardDescription className="mt-1">Scheduled by Supabase pg_cron (see README → Scheduled jobs).</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {jobs.map((j) => (
            <li key={j.name} className="flex items-center gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p>
                  {j.label} <span className="text-xs text-muted-foreground">· {j.schedule}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {j.last ? (
                    <>
                      {j.last.ok === false ? <span className="text-red-400">failed: {j.last.error}</span> : j.last.ok ? (j.last.summary ?? "ok") : "running…"} · {j.last.at}
                    </>
                  ) : (
                    "never run"
                  )}
                </p>
              </div>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => runJobAction(j.name), { success: (s) => s })}>
                <Play /> Run now
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
