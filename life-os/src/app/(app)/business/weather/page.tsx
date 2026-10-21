import { AlertTriangle, CloudLightning, Sun, Wind } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states";
import { PageHeader } from "@/components/shell/page-header";
import { RescheduleButton } from "@/components/business/reschedule-button";
import type { RiskKind } from "@/lib/business/weather-risk";
import { isMock } from "@/lib/integrations/mode";
import { weatherLabel } from "@/lib/integrations/weather";
import { weatherPlan } from "@/lib/services/weather-plan";
import { formatLocalDate, formatTime } from "@/lib/time";
import { cn, formatUsd } from "@/lib/utils";

export const metadata = { title: "Weather" };

const ICON: Record<RiskKind, typeof Sun> = { heat: Sun, storm: CloudLightning, dust: Wind, wind: Wind };

export default async function WeatherPage() {
  const { days, alerts, error } = await weatherPlan();
  const risky = days.filter((d) => d.jobs.length && d.risks.some((r) => r.level === "danger"));
  return (
    <>
      <PageHeader
        title="Weather"
        description={<span className="flex flex-wrap items-center gap-2">{risky.length ? `${risky.length} job day${risky.length > 1 ? "s" : ""} at risk this week` : "No job days at risk this week"} · monsoon storms, haboobs, 110°F+ heat, and NWS warnings{isMock() && <Badge variant="warning">sample forecast</Badge>}</span>}
      />
      {error && <ErrorState title="Couldn't load the forecast" description={error} />}
      {alerts.length > 0 && (
        <div className="mb-4 space-y-2" role="alert">
          {alerts.map((a) => (
            <p key={a.id} className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" /> {a.headline}</p>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="weather-days">
        {days.map((d, i) => {
          const danger = d.risks.some((r) => r.level === "danger");
          return (
            <Card key={d.date} className={cn(danger && d.jobs.length > 0 && "border-red-500/50")} data-testid="weather-day">
              <CardHeader>
                <CardTitle className="normal-case tracking-normal">{i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatLocalDate(d.date, { weekday: true })}</CardTitle>
                {d.weather && <span className="text-sm tabular-nums">{Math.round(d.weather.highF)}°F</span>}
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {d.weather && <p className="text-xs text-muted-foreground">{weatherLabel(d.weather.code)} · rain {Math.round(d.weather.precipPct)}% · gusts {Math.round(d.weather.gustMph)} mph</p>}
                {d.risks.length > 0 ? (
                  <ul className="space-y-1">
                    {d.risks.map((r) => {
                      const Icon = ICON[r.kind];
                      return <li key={r.kind} className={cn("flex items-start gap-1.5 text-xs", r.level === "danger" ? "text-red-400" : "text-amber-400")}><Icon className="mt-0.5 size-3.5 shrink-0" /> {r.text}</li>;
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-emerald-500">Good for exterior work</p>
                )}
                {d.jobs.length > 0 ? (
                  <ul className="space-y-1.5 border-t border-border pt-2">
                    {d.jobs.map((j) => (
                      <li key={j.id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate"><span className="text-xs text-muted-foreground tabular-nums">{j.start ? formatTime(j.start) : ""}</span> {j.customer ?? j.title} <span className="text-xs text-muted-foreground">{formatUsd(j.total)}</span></span>
                        {danger && <RescheduleButton jobId={j.id} toDate={d.suggestion} who={j.customer ?? j.title} />}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="border-t border-border pt-2 text-xs text-muted-foreground">No jobs booked</p>
                )}
                {d.suggestion && <p className="rounded-md bg-muted p-2 text-xs">Best day to move these: <strong>{formatLocalDate(d.suggestion, { weekday: true })}</strong></p>}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">“Call task” adds a task to your list to call the customer; Life OS doesn&apos;t change jobs in Housecall Pro. Forecast: Open-Meteo. Warnings: National Weather Service.</p>
    </>
  );
}
