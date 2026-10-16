import "server-only";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

export type ToolContext = { actor: "ASSISTANT" | "AUTOMATION"; conversationId?: string | null; toolUseId?: string | null };
export type UndoSpec = { actionType: string; payload: Record<string, unknown> };
export type ApprovalNeed = { key: string; emailCategory?: string | null };
export type ToolOutcome = { result: unknown; summary?: string; undo?: UndoSpec };

/**
 * One assistant capability. `actionType` is the policy key used for approvals, auto-approve
 * settings, rate limits, and the activity log.
 */
export type ToolDef<S extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  schema: S;
  actionType: string;
  kind: "read" | "write";
  /**
   * Returns an approval policy key (see policy.ts APPROVAL_ACTIONS) when this input must wait in the
   * Approvals queue unless auto-approved; null to run immediately.
   */
  approval?: (input: z.infer<S>) => Promise<ApprovalNeed | null> | ApprovalNeed | null;
  /** Short human description for approval cards and the activity log. */
  summarize: (input: z.infer<S>) => string | Promise<string>;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<ToolOutcome>;
};

export function defineTool<S extends z.ZodType>(def: ToolDef<S>): ToolDef<S> {
  return def;
}

/** Zod → Anthropic tool definition. */
export function toAnthropicTool(def: ToolDef): Anthropic.Tool {
  const schema = z.toJSONSchema(def.schema, { target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  return {
    name: def.name,
    description: def.description,
    input_schema: { type: "object", ...schema } as Anthropic.Tool.InputSchema,
  };
}
