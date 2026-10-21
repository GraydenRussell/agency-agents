import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/shell/page-header";
import { GoalForm, SpendForm } from "@/components/business/kpi-widgets";
import type { Kpis, PeriodKind } from "@/lib/business/kpis";
import { metaAdsConfigured } from "@/lib/integrations/meta";
import { isMock } from "@/lib/integrations/mode";
import { kpiBoard } from "@/lib/services/kpis";
import { formatLocalDate, today } from "@/lib/time";
import { cn, formatUsd } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "KPIs" };

type Metric = { key: keyof Kpis; label: string; fmt: (v: number) => string; lowerIsBetter?: boolean; hint?: string };
const usd = (v: number) => formatUsd(v);
const METRICS: Metric[] = [
  { key: "revenue", label: "Revenue", fmt: usd },
  { key: "jobs", label: "Jobs done", fmt: (v) => String(v) },
  { key: "avgTicket", label: "Average ticket", fmt: usd },
  { key: "revenuePerHour", label: "Revenue / hour", fmt: usd, hint: "on-site hours from the scheduled job windows" },
  { key: "jobsPerWeek", label: "Jobs / week", fmt: (v) => v.toFixed(1) },
  { key: "leads", label: "Leads", fmt: (v) => String(v) },
  { key: "costPerLead", label: "Cost per lead", fmt: (v) => formatUsd(v, { cents: true }), lowerIsBetter: true, hint: "ad spend ÷ leads" },
  { key: "closeRate", label: "Quote close rate", fmt: (v) => `${Math.round(v * 100)}%`, hint: "won ÷ decided quotes" },
];
const PERIODS: Array<[PeriodKind, string, string]> = [["week", "Week", "last week"], ["month", "Month", "last month"], ["year", "Year", "last year"]];

function Delta({ v, lowerIsBetter, label }: { v: number | null; lowerIsBetter?: boolean; label: string }) {
  if (v == null) return <span className="text-muted-foreground">– {label}</span>;
  const good = lowerIsBetter ? v < 0 : v > 0;
  const flat = Math.abs(v) < 0.005;
  return (
    <span className={cn("tabular-nums", flat ? "text-muted-foreground" : good ? "text-emerald-500" : "text-red-400")}>
      {flat ? "±0%" : `${v > 0 ? "▲" : "▼"} ${Math.abs(Math.round(v * 100))}%`} <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

export default async function KpisPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period } = await searchParams;
  const kind: PeriodKind = period === "week" || period === "year" ? period : "month";
  const t = today();
  const b = await kpiBoard(kind, t);
  const prevLabel = PERIODS.find((p) => p[0] === kind)![2];
  const max = Math.max(1, ...b.trend.map((x) => x.revenue));
  const goalPct = b.goal.monthly ? Math.min(100, (b.goal.monthToDate / b.goal.monthly) * 100) : 0;
  const onPace = b.goal.monthly > 0 && b.goal.projected >= b.goal.monthly;
  return (
    <>
      <PageHeader
        title="KPIs"
        description={<span className="flex flex-wrap items-center gap-2">{formatLocalDate(b.range.start)} – {formatLocalDate(b.range.end < t ? b.range.end : t)} · compared over the same number of days{isMock() && <Badge variant="warning">sample data</Badge>}</span>}
        actions={
          <nav aria-label="KPI period" className="inline-flex h-9 items-center rounded-lg bg-muted p-1">
            {PERIODS.map(([k, l]) => (
              <Link key={k} href={k === "month" ? "/business/kpis" : `/business/kpis?period=${k}`} aria-current={kind === k ? "page" : undefined} className={cn("inline-flex h-7 items-center rounded-md px-3 text-sm font-medium", kind === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>{l}</Link>
            ))}
          </nav>
        }
      />
      <Card className="mb-4">
        <CardContent className="space-y-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">Revenue vs goal this month</span>
            <span className="text-muted-foreground">
              <strong className="text-foreground">{formatUsd(b.goal.monthToDate)}</strong> of {formatUsd(b.goal.monthly)} · day {b.goal.day}/{b.goal.days} · on pace for <strong className={onPace ? "text-emerald-500" : "text-foreground"}>{formatUsd(b.goal.projected)}</strong>
            </span>
          </div>
          <Progress value={goalPct} aria-label="Month-to-date revenue vs goal" indicatorClassName={onPace ? "bg-emerald-500" : undefined} />
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="kpi-grid">
        {METRICS.map((m) => {
          const v = b.current[m.key];
          return (
            <Card key={m.key}>
              <CardContent className="p-4">
                <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase" title={m.hint}>{m.label}</p>
                <p className="mt-1 font-display text-3xl tabular-nums">{v == null ? "–" : m.fmt(v)}</p>
                <div className="mt-1 flex flex-col text-xs">
                  <Delta v={b.deltas[m.key].vsPrevious} lowerIsBetter={m.lowerIsBetter} label={`vs ${prevLabel}`} />
                  <Delta v={b.deltas[m.key].vsLastYear} lowerIsBetter={m.lowerIsBetter} label="vs last year" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="lg:col-span-2 lg:self-start">
          <CardHeader><CardTitle>Revenue by {kind}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex h-44 items-end gap-1.5" role="img" aria-label={b.trend.map((x) => `${x.label}: ${formatUsd(x.revenue)}, ${x.jobs} jobs`).join("; ")}>
              {b.trend.map((x, i) => (
                <div key={x.label + i} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${x.label}: ${formatUsd(x.revenue)} · ${x.jobs} jobs`}>
                  <span className="text-[10px] text-muted-foreground tabular-nums opacity-0 group-hover:opacity-100">{formatUsd(x.revenue)}</span>
                  <div className={cn("w-full rounded-t-[4px]", i === b.trend.length - 1 ? "bg-brand-cyan" : "bg-primary")} style={{ height: `${(x.revenue / max) * 140}px`, minHeight: x.revenue ? 4 : 0 }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1.5">{b.trend.map((x, i) => <span key={x.label + i} className="min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground">{x.label}</span>)}</div>
            <p className="mt-2 text-xs text-muted-foreground">Completed jobs only (from Housecall Pro). The highlighted bar is the current {kind} so far.</p>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Goal</CardTitle></CardHeader>
            <CardContent><GoalForm goal={b.goal.monthly} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Marketing spend</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">{metaAdsConfigured() ? "Meta ad spend syncs every morning." : "Connect Meta ads on the Setup page to pull spend automatically."} Add anything else here so cost per lead is complete.</p>
              <SpendForm today={t} metaReady={metaAdsConfigured()} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
