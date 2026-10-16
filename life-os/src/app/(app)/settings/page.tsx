import { PageHeader } from "@/components/shell/page-header";
import { GoogleCard } from "@/components/settings/google-card";
import { AssistantSettings, MemoryEditor } from "@/components/settings/assistant-settings";
import { aiConfigured, spentToday } from "@/lib/ai/client";
import { APPROVAL_ACTIONS } from "@/lib/assistant/policy";
import { getAllSettings } from "@/lib/services/settings";
import { addDays, today } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { isMock } from "@/lib/integrations/mode";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const sp = await searchParams;
  const [google, calendars, settings, memories, spent, week, byPurpose] = await Promise.all([
    db.integrationAccount.findFirst({ where: { provider: "GOOGLE" } }),
    db.calendarSyncState.findMany({ orderBy: { summary: "asc" } }),
    getAllSettings(),
    db.memory.findMany({ orderBy: [{ kind: "asc" }, { key: "asc" }] }),
    spentToday(),
    db.apiUsage.aggregate({ where: { date: { gte: addDays(today(), -6) } }, _sum: { costUsd: true } }),
    db.apiUsage.groupBy({ by: ["purpose"], where: { date: { gte: addDays(today(), -6) } }, _sum: { costUsd: true } }),
  ]);
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
        <AssistantSettings
          aiConfigured={aiConfigured()}
          cap={settings["ai.dailySpendCapUsd"]}
          perMinute={settings["ai.maxToolCallsPerMinute"]}
          perDay={settings["ai.maxToolCallsPerDay"]}
          effort={settings["ai.effort"]}
          autoApprove={settings["approvals.autoApprove"]}
          autoSendCategories={settings["approvals.autoSendCategories"]}
          approvalActions={APPROVAL_ACTIONS}
          usage={{ today: spent, week: week._sum.costUsd ?? 0, byPurpose: byPurpose.map((b) => ({ purpose: b.purpose, cost: b._sum.costUsd ?? 0 })) }}
        />
        <MemoryEditor memories={memories} />
        <Card>
          <CardHeader>
            <CardTitle>Coming in later phases</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>Reminders, notification channels, quiet hours, brief delivery (Phase 6)</p>
            <p>GitHub + Vercel (Phase 7) · Admin dashboard + quick links (Phase 8)</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
