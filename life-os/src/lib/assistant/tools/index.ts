import "server-only";
import type { ToolDef } from "../registry";
import { calendarTools } from "./calendar";
import { emailTools } from "./email";
import { businessTools, memoryTools, noteTools, projectTools, reminderTools } from "./misc";
import { leadTools } from "./leads";
import { quoteTools } from "./quotes";
import { rebookTools } from "./rebook";
import { referralTools } from "./referrals";
import { reviewTools } from "./reviews";
import { taskTools } from "./tasks";

/** Order is stable (prompt caching: the tool list is part of the cached prefix). */
export const TOOLS: ToolDef[] = [...emailTools, ...calendarTools, ...taskTools, ...reminderTools, ...noteTools, ...projectTools, ...businessTools, ...memoryTools, ...quoteTools, ...leadTools, ...rebookTools, ...reviewTools, ...referralTools] as ToolDef[];

const byName = new Map(TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): ToolDef | undefined {
  return byName.get(name);
}
