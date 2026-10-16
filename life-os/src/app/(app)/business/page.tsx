import { Briefcase, CalendarCheck, ExternalLink, TrendingUp, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { PageHeader } from "@/components/shell/page-header";
import { Markdown } from "@/components/assistant/markdown";
import { isMock } from "@/lib/integrations/mode";
import { businessView } from "@/lib/services/business";
import { formatDateTime, formatTime, localDateOf, relativeDayLabel } from "@/lib/time";
import { formatUsd } from "@/lib/utils";

export const metadata = { title: "Business" };

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
        <p className="mt-1 font-display text-3xl">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default async function BusinessPage() {
  const v = await businessView();
  const linksCard = (
    <Card>
      <CardHeader>
        <CardTitle>Quick links</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {v.links.map((l) => (
          <Button key={l.url} asChild variant="outline" className="justify-between">
            <a href={l.url} target="_blank" rel="noreferrer">
              {l.label} <ExternalLink />
            </a>
          </Button>
        ))}
        <p className="text-xs text-muted-foreground sm:col-span-2">Edit these in Settings → Business.</p>
      </CardContent>
    </Card>
  );

  if (v.state !== "ok") {
    return (
      <>
        <PageHeader title="Business" description="Rapid Window Cleaning" />
        <div className="space-y-4">
          {v.state === "not_configured" ? (
            <EmptyState icon={Briefcase} title="Connect your admin dashboard" description={`${v.message} The dashboard needs the small /api/life-os/summary endpoint (see docs/admin-dashboard-endpoint.md).`} />
          ) : (
            <ErrorState title="Couldn't load business numbers" description={v.message} />
          )}
          {linksCard}
        </div>
      </>
    );
  }

  const { summary: s, pace } = v;
  return (
    <>
      <PageHeader
        title="Business"
        description={
          <span className="flex items-center gap-2">
            Rapid Window Cleaning · updated {formatDateTime(new Date(s.asOf))} {isMock() && <Badge variant="warning">sample data</Badge>}
          </span>
        }
        actions={
          s.links?.dashboard ? (
            <Button asChild variant="outline" size="sm">
              <a href={s.links.dashboard} target="_blank" rel="noreferrer">
                Admin dashboard <ExternalLink />
              </a>
            </Button>
          ) : null
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Revenue today" value={formatUsd(s.revenue.today)} />
        <Kpi label="This week" value={formatUsd(s.revenue.wtd)} sub={`${s.jobs.completedThisWeek}/${s.jobs.scheduledThisWeek} jobs done`} />
        <Kpi label="This month" value={formatUsd(s.revenue.mtd)} sub={`Last month ${formatUsd(s.revenue.lastMonth)}`} />
        <Kpi label="New leads (24h)" value={String(s.leads.new24h)} sub={`${s.leads.open} open`} />
      </div>

      <Card className="mt-4">
        <CardContent className="space-y-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <TrendingUp className="size-4 text-brand-cyan" /> Month pace
            </span>
            <span className="text-muted-foreground">
              Day {pace.dayOfMonth}/{pace.daysInMonth} · on track for <strong className="text-foreground">{formatUsd(pace.projected)}</strong>
              {pace.pctOfLast !== null && ` (${Math.round(pace.pctOfLast)}% of last month)`}
            </span>
          </div>
          <Progress value={pace.pctOfLast ?? 0} indicatorClassName={pace.pctOfLast !== null && pace.pctOfLast >= 100 ? "bg-emerald-500" : undefined} />
        </CardContent>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="size-4" /> Today&apos;s jobs ({s.jobs.today.length})
            </CardTitle>
            {s.links?.jobs && (
              <a className="text-xs underline" href={s.links.jobs} target="_blank" rel="noreferrer">
                All jobs
              </a>
            )}
          </CardHeader>
          <CardContent>
            {s.jobs.today.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs scheduled today.</p>
            ) : (
              <ul className="divide-y divide-border" data-testid="jobs-today">
                {s.jobs.today.map((j) => (
                  <li key={j.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">{formatTime(new Date(j.start))}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{j.customer}</span>
                      {j.address && <span className="block truncate text-xs text-muted-foreground">{j.address}</span>}
                    </span>
                    {j.status && <Badge variant="outline">{j.status}</Badge>}
                    {j.total != null && <span className="w-16 text-right tabular-nums">{formatUsd(j.total)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="size-4" /> Recent leads
            </CardTitle>
            {s.links?.leads && (
              <a className="text-xs underline" href={s.links.leads} target="_blank" rel="noreferrer">
                All leads
              </a>
            )}
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {s.leads.recent.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate">{l.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {l.source ?? "unknown source"} · {relativeDayLabel(l.createdAt.length === 10 ? l.createdAt : localDateOf(new Date(l.createdAt)))}
                    </span>
                  </span>
                  {l.status && <Badge variant={l.status === "new" ? "success" : "outline"}>{l.status}</Badge>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        {s.dailyBrief?.markdown && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Admin dashboard brief</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <Markdown text={s.dailyBrief.markdown} />
            </CardContent>
          </Card>
        )}
        {linksCard}
      </div>
    </>
  );
}
