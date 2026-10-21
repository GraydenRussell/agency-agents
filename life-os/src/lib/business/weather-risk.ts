import { localDateOf } from "@/lib/time";

/** Pure: which job days are risky for exterior window work in the Phoenix area, and where to move them. */
export type RiskKind = "heat" | "storm" | "dust" | "wind";
export type Risk = { kind: RiskKind; level: "caution" | "danger"; text: string };
export type DayWeather = { date: string; highF: number; precipPct: number; gustMph: number; code: number };
export type Alert = { id: string; event: string; headline: string; onset: Date | null; ends: Date | null };

const ALERT_KIND: Array<[RegExp, RiskKind, "caution" | "danger"]> = [
  [/dust storm|blowing dust/i, "dust", "danger"],
  [/severe thunderstorm|flash flood|tornado/i, "storm", "danger"],
  [/(extreme|excessive) heat warning/i, "heat", "danger"],
  [/(extreme|excessive) heat watch|heat advisory/i, "heat", "caution"],
  [/high wind|wind advisory/i, "wind", "caution"],
];

/** Alert overlaps the local day (alerts with no times count for today only). */
function covers(a: Alert, date: string): boolean {
  const start = a.onset ? localDateOf(a.onset) : null;
  const end = a.ends ? localDateOf(a.ends) : start;
  if (!start) return false;
  return date >= start && date <= (end ?? start);
}

export function dayRisks(w: DayWeather | undefined, alerts: Alert[], date: string): Risk[] {
  const out: Risk[] = [];
  for (const a of alerts) {
    const m = ALERT_KIND.find(([re]) => re.test(a.event));
    if (m && covers(a, date)) out.push({ kind: m[1], level: m[2], text: `NWS ${a.event}` });
  }
  if (w) {
    if (w.highF >= 110) out.push({ kind: "heat", level: "danger", text: `${Math.round(w.highF)}°F: finish exterior work by ~11 AM or move it` });
    else if (w.highF >= 105) out.push({ kind: "heat", level: "caution", text: `${Math.round(w.highF)}°F: start early, water flash-dries` });
    if (w.code >= 95) out.push({ kind: "storm", level: "danger", text: `Thunderstorms likely (${Math.round(w.precipPct)}%)` });
    else if (w.precipPct >= 60) out.push({ kind: "storm", level: "caution", text: `Rain ${Math.round(w.precipPct)}% likely` });
    if (w.gustMph >= 40) out.push({ kind: "dust", level: "danger", text: `Gusts to ${Math.round(w.gustMph)} mph: haboob/dust risk, no tall pole work` });
    else if (w.gustMph >= 30) out.push({ kind: "wind", level: "caution", text: `Gusts to ${Math.round(w.gustMph)} mph` });
  }
  // One entry per kind: the worse level wins; same-level details are joined ("NWS … · 112°F: …").
  const best = new Map<RiskKind, Risk>();
  for (const r of out) {
    const cur = best.get(r.kind);
    if (!cur || (cur.level === "caution" && r.level === "danger")) best.set(r.kind, r);
    else if (cur.level === r.level) best.set(r.kind, { ...cur, text: `${cur.text} · ${r.text}` });
  }
  return [...best.values()];
}

export const isBadDay = (risks: Risk[]) => risks.some((r) => r.level === "danger");

/**
 * Best day to move a job to: the next days without danger, preferring no cautions, fewer booked jobs,
 * and sooner. Sundays skipped. Null if nothing in the window qualifies.
 */
export function suggestDay(from: string, days: Array<{ date: string; risks: Risk[]; jobCount: number }>, dow: (d: string) => number): string | null {
  const options = days.filter((d) => d.date > from && dow(d.date) !== 7 && !isBadDay(d.risks));
  if (!options.length) return null;
  const score = (d: (typeof options)[number]) => d.risks.length * 10 + d.jobCount * 3 + (Date.parse(d.date) - Date.parse(from)) / 86_400_000;
  return [...options].sort((a, b) => score(a) - score(b))[0]!.date;
}
