import { rrulestr } from "rrule";

/**
 * RRULE evaluation in Phoenix wall-clock time. rrule.js evaluates BYDAY/BYHOUR in UTC,
 * so we shift instants into "wall time as UTC", evaluate, then shift back. Phoenix has a
 * fixed -7h offset, which makes this exact.
 */
const OFFSET_MS = -7 * 3_600_000;
const toWall = (d: Date) => new Date(d.getTime() + OFFSET_MS);
const fromWall = (d: Date) => new Date(d.getTime() - OFFSET_MS);

function rule(rrule: string, dtstart: Date) {
  const body = rrule.replace(/^RRULE:/i, "");
  return rrulestr(`RRULE:${body}`, { dtstart: toWall(dtstart) });
}

/** First occurrence strictly after `after`, or null when the rule is exhausted. */
export function nextOccurrence(rrule: string, dtstart: Date, after: Date): Date | null {
  const next = rule(rrule, dtstart).after(toWall(after), false);
  return next ? fromWall(next) : null;
}

export function occurrencesBetween(rrule: string, dtstart: Date, from: Date, to: Date): Date[] {
  return rule(rrule, dtstart)
    .between(toWall(from), toWall(to), true)
    .map(fromWall);
}

export function isValidRrule(rrule: string): boolean {
  try {
    rule(rrule, new Date());
    return /FREQ=/i.test(rrule);
  } catch {
    return false;
  }
}

const DAY_NAMES: Record<string, string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };

/** Short human label for common rules ("Daily", "Weekly on Mon, Thu", "Monthly"). */
export function describeRrule(rrule: string): string {
  const parts = Object.fromEntries(
    rrule
      .replace(/^RRULE:/i, "")
      .split(";")
      .map((p) => p.split("=") as [string, string]),
  );
  const interval = Number(parts.INTERVAL ?? 1);
  const every = (unit: string) => (interval > 1 ? `Every ${interval} ${unit}s` : unit === "day" ? "Daily" : `${unit[0]?.toUpperCase()}${unit.slice(1)}ly`);
  switch (parts.FREQ) {
    case "DAILY":
      return every("day");
    case "WEEKLY": {
      const days = parts.BYDAY ? parts.BYDAY.split(",").map((d: string) => DAY_NAMES[d] ?? d).join(", ") : "";
      if (parts.BYDAY === "MO,TU,WE,TH,FR") return "Weekdays";
      return `${every("week")}${days ? ` on ${days}` : ""}`;
    }
    case "MONTHLY":
      return every("month");
    case "YEARLY":
      return every("year");
    default:
      return "Custom";
  }
}

export const RECURRENCE_PRESETS: Array<{ label: string; rrule: string }> = [
  { label: "Daily", rrule: "FREQ=DAILY" },
  { label: "Weekdays", rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
  { label: "Weekly", rrule: "FREQ=WEEKLY" },
  { label: "Every 2 weeks", rrule: "FREQ=WEEKLY;INTERVAL=2" },
  { label: "Monthly", rrule: "FREQ=MONTHLY" },
];
