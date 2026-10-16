/**
 * Rule-based quick-capture parser. Turns "call Linda tomorrow 3pm !1 #business" into a structured item.
 * Pure and deterministic (takes `now`), so it's unit-tested. The assistant (Phase 5) can refine
 * captures this parser marks as low-confidence.
 */
import { addDays, atLocalMinutes, isoWeekday, localDateOf, localMinutes, today, type LocalDate } from "@/lib/time";
import type { Area } from "@/generated/prisma/enums";

export type CaptureKind = "task" | "note" | "journal" | "reminder" | "event";

export type ParsedCapture = {
  kind: CaptureKind;
  title: string;
  body?: string;
  priority?: number;
  area?: Area;
  tags: string[];
  /** Task due / reminder fire time / event start. */
  at?: Date;
  /** Event end. */
  end?: Date;
  /** True when a date was given without a time. */
  allDay?: boolean;
  confidence: "high" | "low";
};

const AREA_TAGS: Record<string, Area> = {
  business: "BUSINESS",
  biz: "BUSINESS",
  work: "BUSINESS",
  rwc: "BUSINESS",
  personal: "PERSONAL",
  home: "PERSONAL",
  health: "HEALTH",
  fitness: "HEALTH",
  money: "MONEY",
  finance: "MONEY",
  learning: "LEARNING",
  learn: "LEARNING",
};

const WEEKDAYS: Record<string, number> = {
  mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, sat: 6, saturday: 6, sun: 7, sunday: 7,
};
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const TIME = String.raw`(?:noon|midnight|\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?)`;

function parseTimeToken(raw: string, meridiemHint?: "am" | "pm"): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (s === "noon") return 12 * 60;
  if (s === "midnight") return 0;
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  const mer = m[3] ? (m[3].startsWith("a") ? "am" : "pm") : meridiemHint;
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  // Bare hour with no meridiem and no colon: assume business hours (1–7 → PM).
  if (!mer && !m[2] && h >= 1 && h <= 7) h += 12;
  return h * 60 + min;
}

type Extracted = { text: string; date?: LocalDate; startMin?: number; endMin?: number };

function extractDateTime(input: string, now: Date): Extracted {
  let text = ` ${input} `;
  const t = today(now);
  let date: LocalDate | undefined;
  let startMin: number | undefined;
  let endMin: number | undefined;

  const take = (re: RegExp, fn: (m: RegExpExecArray) => boolean | void) => {
    const m = re.exec(text);
    if (m && fn(m) !== false) text = text.replace(m[0], " ");
  };

  // Relative offsets: "in 2 hours", "in 30 min", "in 3 days"
  take(/\bin\s+(\d+)\s*(minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w)\b/i, (m) => {
    const n = Number(m[1]);
    const unit = (m[2] ?? "").toLowerCase();
    if (unit.startsWith("d")) date = addDays(t, n);
    else if (unit.startsWith("w")) date = addDays(t, n * 7);
    else {
      const ms = unit.startsWith("h") ? n * 3_600_000 : n * 60_000;
      const target = new Date(now.getTime() + ms);
      date = localDateOf(target);
      startMin = localMinutes(target);
    }
  });

  take(/\b(today|tonight|tomorrow|tmrw|tmr)\b/i, (m) => {
    const w = (m[1] ?? "").toLowerCase();
    date = w.startsWith("tom") || w.startsWith("tm") ? addDays(t, 1) : t;
    if (w === "tonight" && startMin === undefined) startMin = 20 * 60;
  });

  take(/\b(next\s+)?(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:s|nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i, (m) => {
    const wd = WEEKDAYS[(m[2] ?? "").toLowerCase()];
    if (!wd) return false;
    let diff = (wd - isoWeekday(t) + 7) % 7;
    if (diff === 0) diff = 7;
    if (m[1]) diff += diff < 7 ? 7 : 0;
    date = addDays(t, diff);
  });

  take(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, (m) => {
    const mo = Number(m[1]);
    const d = Number(m[2]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : Number(t.slice(0, 4));
    let candidate = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!m[3] && candidate < t) candidate = `${y + 1}${candidate.slice(4)}`;
    date = candidate;
  });

  take(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i, (m) => {
    const mo = MONTHS[(m[1] ?? "").toLowerCase()];
    const d = Number(m[2]);
    if (!mo || d < 1 || d > 31) return false;
    const y = Number(t.slice(0, 4));
    let candidate = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (candidate < t) candidate = `${y + 1}${candidate.slice(4)}`;
    date = candidate;
  });

  // Ranges: "12-1pm", "2pm-3:30pm", "from 9 to 11am"
  take(new RegExp(String.raw`\b(?:from\s+)?(${TIME})\s*(?:-|–|to)\s*(${TIME})\b`, "i"), (m) => {
    const endRaw = m[2] ?? "";
    const endMer = /p/i.test(endRaw) ? "pm" : /a/i.test(endRaw) ? "am" : undefined;
    const e = parseTimeToken(endRaw);
    let s = parseTimeToken(m[1] ?? "", /[ap]/i.test(m[1] ?? "") ? undefined : endMer);
    if (s === null || e === null) return false;
    if (s > e && s - 12 * 60 >= 0) s -= 12 * 60; // "11-1pm" → 11am–1pm
    startMin = s;
    endMin = e;
  });

  if (startMin === undefined) {
    take(new RegExp(String.raw`\b(?:at|@)\s*(${TIME})\b`, "i"), (m) => {
      const v = parseTimeToken(m[1] ?? "");
      if (v === null) return false;
      startMin = v;
    });
  }
  if (startMin === undefined) {
    take(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2}|noon|midnight)\b/i, (m) => {
      const v = parseTimeToken(m[1] ?? "");
      if (v === null) return false;
      startMin = v;
    });
  }

  // "on" / "by" / "due" left dangling after removing a date
  text = text.replace(/\b(on|by|due|at)\s*$/i, " ");
  return { text: text.replace(/\s+/g, " ").trim(), date, startMin, endMin };
}

export function parseCapture(raw: string, now: Date = new Date()): ParsedCapture {
  let input = raw.trim();
  let kind: CaptureKind = "task";
  let explicit = false;

  const prefix = /^(note|n|journal|j|remind(?:er)?|r|event|e|task|t)\s*:\s*/i.exec(input);
  if (prefix) {
    const p = (prefix[1] ?? "").toLowerCase();
    kind = p.startsWith("n") ? "note" : p.startsWith("j") ? "journal" : p.startsWith("r") ? "reminder" : p.startsWith("e") ? "event" : "task";
    input = input.slice(prefix[0].length);
    explicit = true;
  } else if (/^remind\s+me\s+(to\s+)?/i.test(input)) {
    kind = "reminder";
    input = input.replace(/^remind\s+me\s+(to\s+)?/i, "");
    explicit = true;
  }

  // Multi-line note: first line is the title.
  let body: string | undefined;
  if (kind === "note" && input.includes("\n")) {
    const [first, ...rest] = input.split("\n");
    input = first ?? "";
    body = rest.join("\n").trim();
  }
  if (kind === "journal") return { kind, title: "Journal", body: input, tags: [], confidence: "high" };

  let priority: number | undefined;
  input = input.replace(/(?:^|\s)!([1-4])\b/, (_, p: string) => {
    priority = Number(p);
    return " ";
  });
  input = input.replace(/(?:^|\s)(!{1,3})(?=\s|$)/, (_, bangs: string) => {
    priority = 4 - bangs.length;
    return " ";
  });

  let area: Area | undefined;
  const tags: string[] = [];
  input = input.replace(/(?:^|\s)#([\w-]+)/g, (_, tag: string) => {
    const a = AREA_TAGS[tag.toLowerCase()];
    if (a && !area) area = a;
    else tags.push(tag.toLowerCase());
    return " ";
  });

  const dt = kind === "note" ? { text: input.trim() } : extractDateTime(input, now);
  const title = dt.text.replace(/\s+/g, " ").trim() || raw.trim();

  const d = "date" in dt ? dt.date : undefined;
  const s = "startMin" in dt ? dt.startMin : undefined;
  const e = "endMin" in dt ? dt.endMin : undefined;

  if (!explicit && e !== undefined) kind = "event";
  if (!explicit && /\b(meeting|lunch|dinner|call with|appointment|appt|interview)\b/i.test(title) && s !== undefined) kind = "event";

  let at: Date | undefined;
  let end: Date | undefined;
  let allDay: boolean | undefined;
  if (d !== undefined || s !== undefined) {
    const day = d ?? today(now);
    if (s !== undefined) {
      at = atLocalMinutes(day, s);
      // A bare time that's already passed today means tomorrow.
      if (d === undefined && at <= now) at = atLocalMinutes(addDays(day, 1), s);
      if (e !== undefined) end = atLocalMinutes(localDateOf(at), e);
    } else {
      allDay = true;
      at = atLocalMinutes(day, kind === "reminder" ? 9 * 60 : 17 * 60);
    }
  }
  if (kind === "event" && at && !end) end = new Date(at.getTime() + 60 * 60_000);

  const confidence: ParsedCapture["confidence"] =
    explicit || at || priority || area ? "high" : title.split(" ").length <= 12 ? "high" : "low";
  return { kind, title, body, priority, area, tags, at, end, allDay, confidence };
}
