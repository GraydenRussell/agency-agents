import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, MapPinOff, Navigation } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/shell/page-header";
import { RouteMap } from "@/components/business/route-map";
import { isMock } from "@/lib/integrations/mode";
import { routeDay, weekRoutes } from "@/lib/services/routes";
import { addDays, formatLocalDate, formatTime, today } from "@/lib/time";
import { cn, formatUsd } from "@/lib/utils";

export const metadata = { title: "Route" };

const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);

export default async function RoutePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const t = today();
  const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : t;
  const [r, week] = await Promise.all([routeDay(d), weekRoutes(t)]);
  const href = (x: string) => (x === t ? "/business/route" : `/business/route?date=${x}`);
  return (
    <>
      <PageHeader
        title="Route"
        description={<span className="flex flex-wrap items-center gap-2">{formatLocalDate(d, { weekday: true })} · drive times {r.source === "google" ? "from Google (traffic-aware)" : "estimated from distance (add a Google Maps key on Setup for real ones)"}{isMock() && <Badge variant="warning">sample data</Badge>}</span>}
        actions={
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="icon" aria-label="Previous day"><Link href={href(addDays(d, -1))}><ChevronLeft /></Link></Button>
            {d !== t && <Button asChild variant="outline" size="sm"><Link href="/business/route">Today</Link></Button>}
            <Button asChild variant="outline" size="icon" aria-label="Next day"><Link href={href(addDays(d, 1))}><ChevronRight /></Link></Button>
            {r.directionsUrl && <Button asChild size="sm"><a href={r.directionsUrl} target="_blank" rel="noreferrer"><Navigation /> Google Maps</a></Button>}
          </div>
        }
      />
      <nav aria-label="This week" className="mb-4 grid grid-cols-7 gap-1">
        {week.map((w) => (
          <Link key={w.date} href={href(w.date)} aria-current={w.date === d ? "page" : undefined} className={cn("rounded-lg border p-2 text-center text-xs", w.date === d ? "border-primary bg-primary/10" : "border-border hover:bg-accent/40")}>
            <span className="block font-medium">{formatLocalDate(w.date, { weekday: true }).split(",")[0]}</span>
            <span className="block text-muted-foreground">{w.jobs} job{w.jobs === 1 ? "" : "s"}</span>
            {w.jobs > 0 && <span className={cn("block tabular-nums", w.flags ? "text-amber-500" : "text-muted-foreground")}>{hm(w.driveMinutes)}{w.flags ? " ⚠" : ""}</span>}
          </Link>
        ))}
      </nav>
      {r.stops.length === 0 && r.unmapped.length === 0 ? (
        <EmptyState icon={Navigation} title="No jobs this day" description="Jobs from Housecall Pro show up here as a route with drive times." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[["Stops", String(r.stops.length + r.unmapped.length)], ["Driving", hm(r.driveMinutes)], ["Miles", String(r.driveMiles)], ["Best possible", hm(r.bestMinutes)]].map(([l, v]) => (
              <Card key={l}><CardContent className="p-4"><p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{l}</p><p className="mt-1 font-display text-3xl tabular-nums">{v}</p></CardContent></Card>
            ))}
          </div>
          {r.flags.length > 0 && (
            <div className="mt-4 space-y-2" data-testid="route-flags">
              {r.flags.map((f) => (
                <p key={f.text} className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" /> {f.text}</p>
              ))}
            </div>
          )}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3 [&>*]:min-w-0">
            <div className="lg:col-span-2">
              {r.stops.length > 0 && <RouteMap base={{ ...r.base, label: r.base.label }} stops={r.stops.map((s) => ({ lat: s.lat, lng: s.lng, label: s.label }))} />}
              <p className="mt-1 text-xs text-muted-foreground">Lines connect stops in booked order (straight lines, not road paths). Use Google Maps for turn-by-turn.</p>
            </div>
            <Card>
              <CardHeader><CardTitle>Stops</CardTitle></CardHeader>
              <CardContent>
                <ol className="space-y-3 text-sm" data-testid="route-stops">
                  <li className="text-xs text-muted-foreground">⌂ {r.base.label}</li>
                  {r.stops.map((s, i) => (
                    <li key={s.id}>
                      <span className="block text-xs text-muted-foreground tabular-nums">↓ {s.driveIn} min · {s.milesIn} mi</span>
                      <span className="flex items-start gap-2">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                        <span className="min-w-0 flex-1"><span className="block font-medium">{s.label}</span><span className="block truncate text-xs text-muted-foreground">{s.start ? formatTime(s.start) : "No time"}{s.end ? `–${formatTime(s.end)}` : ""} · {formatUsd(s.total)}{s.address ? ` · ${s.address}` : ""}</span></span>
                      </span>
                    </li>
                  ))}
                  {r.stops.length > 0 && <li className="text-xs text-muted-foreground tabular-nums">↓ {r.backHome.minutes} min · {r.backHome.miles} mi back to ⌂</li>}
                </ol>
                {r.unmapped.length > 0 && (
                  <div className="mt-4 border-t border-border pt-3 text-sm">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><MapPinOff className="size-3.5" /> No map location (add it in Housecall Pro)</p>
                    <ul className="mt-1 space-y-1">{r.unmapped.map((u) => <li key={u.id}>{u.label}{u.address ? <span className="text-xs text-muted-foreground"> · {u.address}</span> : null}</li>)}</ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
