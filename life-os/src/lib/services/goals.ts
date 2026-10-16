import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Goal } from "@/generated/prisma/client";
import { GoalLevel, GoalStatus } from "@/generated/prisma/enums";
import { areaSchema } from "./tasks";

const goalBaseSchema = z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000).nullish(),
    level: z.enum(Object.values(GoalLevel) as [GoalLevel, ...GoalLevel[]]),
    area: areaSchema,
    status: z.enum(Object.values(GoalStatus) as [GoalStatus, ...GoalStatus[]]).optional(),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    targetValue: z.coerce.number().positive().nullish(),
    currentValue: z.coerce.number().min(0).nullish(),
    unit: z.string().max(20).nullish(),
    parentId: z.string().nullish(),
  });
export const goalInputSchema = goalBaseSchema.refine((g) => g.periodEnd >= g.periodStart, { message: "End must be after start", path: ["periodEnd"] });
export type GoalInput = z.infer<typeof goalInputSchema>;

export type GoalNode = Goal & {
  progress: number; // 0–100
  taskCounts: { done: number; total: number };
  children: GoalNode[];
};

type TaskCount = { goalId: string | null; status: string; _count: { _all: number } };

/** Pure: computes progress bottom-up. Exported for tests. */
export function buildGoalTree(goals: Goal[], counts: TaskCount[]): GoalNode[] {
  const byGoal = new Map<string, { done: number; total: number }>();
  for (const c of counts) {
    if (!c.goalId || c.status === "CANCELED") continue;
    const e = byGoal.get(c.goalId) ?? { done: 0, total: 0 };
    e.total += c._count._all;
    if (c.status === "DONE") e.done += c._count._all;
    byGoal.set(c.goalId, e);
  }
  const nodes = new Map<string, GoalNode>();
  for (const g of goals) nodes.set(g.id, { ...g, progress: 0, taskCounts: byGoal.get(g.id) ?? { done: 0, total: 0 }, children: [] });
  const roots: GoalNode[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n);
  }
  const compute = (n: GoalNode): number => {
    const childProgress = n.children.map(compute);
    if (n.status === "ACHIEVED") n.progress = 100;
    else if (n.targetValue && n.targetValue > 0) n.progress = Math.min(100, ((n.currentValue ?? 0) / n.targetValue) * 100);
    else if (n.taskCounts.total > 0 && childProgress.length === 0) n.progress = (n.taskCounts.done / n.taskCounts.total) * 100;
    else if (childProgress.length > 0 || n.taskCounts.total > 0) {
      const parts = [...childProgress];
      if (n.taskCounts.total > 0) parts.push((n.taskCounts.done / n.taskCounts.total) * 100);
      n.progress = parts.reduce((a, b) => a + b, 0) / parts.length;
    } else n.progress = 0;
    return n.progress;
  };
  roots.forEach(compute);
  const order: Record<GoalLevel, number> = { YEAR: 0, QUARTER: 1, WEEK: 2 };
  const sort = (list: GoalNode[]) => {
    list.sort((a, b) => order[a.level] - order[b.level] || a.periodStart.getTime() - b.periodStart.getTime() || a.title.localeCompare(b.title));
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

export async function goalTree(opts: { includeInactive?: boolean } = {}): Promise<GoalNode[]> {
  const [goals, counts] = await Promise.all([
    db.goal.findMany({ where: opts.includeInactive ? {} : { status: { not: "DROPPED" } } }),
    db.task.groupBy({ by: ["goalId", "status"], where: { deletedAt: null, goalId: { not: null } }, _count: { _all: true } }),
  ]);
  return buildGoalTree(goals, counts);
}

export async function listGoalsFlat() {
  return db.goal.findMany({ where: { status: "ACTIVE" }, orderBy: [{ level: "asc" }, { title: "asc" }], select: { id: true, title: true, level: true } });
}

export async function createGoal(input: GoalInput) {
  return db.goal.create({ data: goalInputSchema.parse(input) });
}

export async function updateGoal(id: string, input: Partial<GoalInput>) {
  const data = goalBaseSchema.partial().parse(input);
  return db.goal.update({ where: { id }, data });
}

export async function deleteGoal(id: string) {
  return db.goal.delete({ where: { id } });
}
