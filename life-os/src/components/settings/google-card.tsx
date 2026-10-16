"use client";
import { CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/components/ui/use-action";
import { setCalendarEnabledAction } from "@/app/(app)/calendar/actions";
import { disconnectGoogleAction, refreshCalendarsAction } from "@/app/(app)/settings/actions";

type Props = {
  status: "CONNECTED" | "NEEDS_REAUTH" | "ERROR" | "DISCONNECTED" | null;
  email: string | null;
  lastError: string | null;
  mock: boolean;
  configured: boolean;
  calendars: Array<{ calendarId: string; summary: string | null; enabled: boolean; writable: boolean; lastSyncAt: string | null }>;
};

export function GoogleCard({ status, email, lastError, mock, configured, calendars }: Props) {
  const { pending, run } = useAction();
  const connected = status === "CONNECTED";
  return (
    <Card id="integrations">
      <CardHeader>
        <div>
          <CardTitle className="text-foreground">Google (Gmail + Calendar)</CardTitle>
          <CardDescription className="mt-1">
            {connected ? (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-400" /> Connected as {email}
              </span>
            ) : status === "NEEDS_REAUTH" ? (
              <span className="flex items-center gap-1.5 text-amber-400">
                <TriangleAlert className="size-4" /> Needs reconnecting{lastError ? ` (${lastError})` : ""}
              </span>
            ) : (
              "Not connected"
            )}
          </CardDescription>
        </div>
        {mock && <Badge variant="warning">Mock mode</Badge>}
      </CardHeader>
      <CardContent className="space-y-4">
        {!mock && !configured && <p className="text-sm text-amber-400">Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable connecting (see README → Google OAuth).</p>}
        <div className="flex flex-wrap gap-2">
          <Button asChild disabled={!mock && !configured}>
            <a href="/api/google/connect">{connected ? "Reconnect" : status === "NEEDS_REAUTH" ? "Reconnect Google" : "Connect Google"}</a>
          </Button>
          {connected && (
            <>
              <Button variant="outline" disabled={pending} onClick={() => run(() => refreshCalendarsAction(), { success: (n) => `Found ${n} calendars` })}>
                <RefreshCw /> Refresh calendars
              </Button>
              <Button variant="ghost" className="text-red-400" disabled={pending} onClick={() => confirm("Disconnect Google? Sync stops until you reconnect.") && run(() => disconnectGoogleAction(), { success: "Disconnected" })}>
                Disconnect
              </Button>
            </>
          )}
        </div>
        {calendars.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Calendars to sync</p>
            <ul className="space-y-2">
              {calendars.map((c) => (
                <li key={c.calendarId} className="flex items-center gap-3 text-sm">
                  <Switch checked={c.enabled} onCheckedChange={(v) => run(() => setCalendarEnabledAction(c.calendarId, v))} aria-label={`Sync ${c.summary ?? c.calendarId}`} />
                  <span className="flex-1">{c.summary ?? c.calendarId}</span>
                  {!c.writable && <Badge variant="outline">read-only</Badge>}
                  <span className="text-xs text-muted-foreground">{c.lastSyncAt ? `synced ${new Date(c.lastSyncAt).toLocaleString()}` : "never synced"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
