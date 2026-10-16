import { PageHeader } from "@/components/shell/page-header";
import { GoogleCard } from "@/components/settings/google-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { isMock } from "@/lib/integrations/mode";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const sp = await searchParams;
  const [google, calendars] = await Promise.all([db.integrationAccount.findFirst({ where: { provider: "GOOGLE" } }), db.calendarSyncState.findMany({ orderBy: { summary: "asc" } })]);
  return (
    <>
      <PageHeader title="Settings" />
      {sp.connected === "google" && <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">Google connected. Your calendar is syncing.</p>}
      {typeof sp.google_error === "string" && <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">Google connection failed: {sp.google_error}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <GoogleCard
          status={google?.status ?? null}
          email={google?.accountEmail ?? null}
          lastError={google?.lastError ?? null}
          mock={isMock()}
          configured={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)}
          calendars={calendars.map((c) => ({ calendarId: c.calendarId, summary: c.summary, enabled: c.enabled, writable: c.writable, lastSyncAt: c.lastSyncAt?.toISOString() ?? null }))}
        />
        <Card>
          <CardHeader>
            <CardTitle>Coming in later phases</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>Assistant auto-approve policies, spend cap, and rate limits (Phase 5)</p>
            <p>Reminders, notification channels, quiet hours, brief delivery (Phase 6)</p>
            <p>GitHub + Vercel (Phase 7) · Admin dashboard + quick links (Phase 8)</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
