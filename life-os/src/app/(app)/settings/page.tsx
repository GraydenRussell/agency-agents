import { PageHeader } from "@/components/shell/page-header";
import { GoogleCard } from "@/components/settings/google-card";
import { AssistantSettings, MemoryEditor } from "@/components/settings/assistant-settings";
import { AutomationsCard, NotificationSettings, RemindersCard } from "@/components/settings/notification-settings";
import { JOBS } from "@/lib/automations";
import { BusinessSettings } from "@/components/settings/business-settings";
import { quickLinks } from "@/lib/services/business";
import { channelStatus } from "@/lib/notify";
import { describeRrule } from "@/lib/recurrence";
import { formatDateTime } from "@/lib/time";
import { aiConfigured, spentToday } from "@/lib/ai/client";
import { APPROVAL_ACTIONS } from "@/lib/assistant/policy";
import { getAllSettings } from "@/lib/services/settings";
import { addDays, today } from "@/lib/time";
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
  const links = await quickLinks();
  const [reminders, devices, runs] = await Promise.all([
    db.reminder.findMany({ where: { OR: [{ status: "SCHEDULED" }, { status: "FAILED" }] }, orderBy: { nextFireAt: "asc" }, take: 50 }),
    db.pushSubscription.count(),
    db.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 200 }),
  ]);
  return (
    <>
      <PageHeader title="Settings" />
      {sp.connected === "google" && <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">Google connected. Your calendar is syncing.</p>}
      {typeof sp.google_error === "string" && <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">Google connection failed: {sp.google_error}</p>}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
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
        <NotificationSettings status={channelStatus()} briefChannels={settings["notifications.briefChannels"]} quiet={settings["notifications.quietHours"]} threshold={settings["notifications.highPriorityThreshold"]} devices={devices} />
        <RemindersCard reminders={reminders.map((r) => ({ id: r.id, title: r.title, next: r.nextFireAt && r.nextFireAt.getFullYear() < 9999 ? formatDateTime(r.nextFireAt) : null, recurring: r.rrule ? describeRrule(r.rrule) : null, channels: r.channels, status: r.status, lastError: r.lastError }))} />
        <AutomationsCard
          jobs={Object.entries(JOBS).map(([name, j]) => {
            const last = runs.find((r) => r.job === name);
            return { name, label: j.label, schedule: j.schedule, last: last ? { at: formatDateTime(last.startedAt), ok: last.ok, summary: last.summary, error: last.error } : null };
          })}
        />
        <BusinessSettings links={links} adminConfigured={isMock() || Boolean(process.env.ADMIN_DASH_URL && process.env.LIFE_OS_API_TOKEN)} github={isMock() || Boolean(process.env.GITHUB_TOKEN)} vercel={isMock() || Boolean(process.env.VERCEL_TOKEN)} />
      </div>
    </>
  );
}
