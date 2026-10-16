"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import * as goals from "@/lib/services/goals";

const refresh = () => revalidatePath("/", "layout");

export async function createGoalAction(input: goals.GoalInput) {
  return runAction(async () => {
    const g = await goals.createGoal(input);
    refresh();
    return g.id;
  });
}
export async function updateGoalAction(id: string, input: Partial<goals.GoalInput>) {
  return runAction(async () => {
    await goals.updateGoal(id, input);
    refresh();
    return undefined;
  });
}
export async function deleteGoalAction(id: string) {
  return runAction(async () => {
    await goals.deleteGoal(id);
    refresh();
    return undefined;
  });
}
