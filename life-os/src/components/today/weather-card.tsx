import { CloudSun, Wind } from "lucide-react";
import type { Weather } from "@/lib/integrations/weather";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function WeatherCard({ weather }: { weather: Weather | { error: string } }) {
  if ("error" in weather) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Chandler weather</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Weather unavailable right now ({weather.error}).</CardContent>
      </Card>
    );
  }
  const work = weather.hours.filter((h) => {
    const hr = Number(h.time.slice(11, 13));
    return hr >= 6 && hr <= 18 && hr % 2 === 0;
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Chandler weather</CardTitle>
        {weather.source === "mock" && <span className="text-[10px] text-muted-foreground uppercase">sample</span>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4">
          <CloudSun className="size-10 text-brand-cyan" />
          <div>
            <p className="font-display text-4xl leading-none">{Math.round(weather.current.tempF)}°</p>
            <p className="text-xs text-muted-foreground">
              {weather.current.label} · feels {Math.round(weather.current.feelsF)}°
            </p>
          </div>
          <div className="ml-auto text-right text-xs text-muted-foreground">
            <p>
              H {Math.round(weather.today.highF)}° / L {Math.round(weather.today.lowF)}°
            </p>
            <p className="flex items-center justify-end gap-1">
              <Wind className="size-3" /> {Math.round(weather.today.windMaxMph)} mph · UV {Math.round(weather.today.uv)}
            </p>
            <p>
              ☀ {weather.today.sunrise} – {weather.today.sunset}
            </p>
          </div>
        </div>
        <div className="flex justify-between gap-1 text-center text-[11px]">
          {work.map((h) => (
            <div key={h.time} className="flex-1 rounded-md bg-muted/50 py-1">
              <p className="text-muted-foreground">{Number(h.time.slice(11, 13)) % 12 || 12}{Number(h.time.slice(11, 13)) < 12 ? "a" : "p"}</p>
              <p className="font-medium">{Math.round(h.tempF)}°</p>
              {h.precipPct >= 20 && <p className="text-sky-400">{h.precipPct}%</p>}
            </div>
          ))}
        </div>
        <ul className="space-y-1 text-xs">
          {weather.advice.map((a) => (
            <li key={a} className="rounded-md border border-border/60 px-2 py-1.5">
              {a}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
