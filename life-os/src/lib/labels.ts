import type { Area, TaskStatus } from "@/generated/prisma/enums";

export const AREAS: Area[] = ["BUSINESS", "PERSONAL", "HEALTH", "MONEY", "LEARNING"];

export const AREA_META: Record<Area, { label: string; dot: string; text: string }> = {
  BUSINESS: { label: "Business", dot: "bg-brand-azure", text: "text-sky-400" },
  PERSONAL: { label: "Personal", dot: "bg-violet-400", text: "text-violet-400" },
  HEALTH: { label: "Health", dot: "bg-emerald-400", text: "text-emerald-400" },
  MONEY: { label: "Money", dot: "bg-amber-400", text: "text-amber-400" },
  LEARNING: { label: "Learning", dot: "bg-pink-400", text: "text-pink-400" },
};

export const PRIORITY_META: Record<number, { label: string; short: string; className: string }> = {
  1: { label: "P1 · Urgent", short: "P1", className: "text-red-400 border-red-500/40" },
  2: { label: "P2 · High", short: "P2", className: "text-amber-400 border-amber-500/40" },
  3: { label: "P3 · Normal", short: "P3", className: "text-sky-400 border-sky-500/40" },
  4: { label: "P4 · Low", short: "P4", className: "text-muted-foreground border-border" },
};

export const STATUS_META: Record<TaskStatus, { label: string }> = {
  TODO: { label: "To do" },
  DOING: { label: "Doing" },
  DONE: { label: "Done" },
  CANCELED: { label: "Canceled" },
};

export const KANBAN_COLUMNS: TaskStatus[] = ["TODO", "DOING", "DONE"];
