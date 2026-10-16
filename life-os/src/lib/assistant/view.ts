import "server-only";
import { db } from "@/lib/db";
import { visibleText } from "./agent";

export type ToolView = { id: string; name: string; status: "running" | "ok" | "error" | "pending_approval" | "approved" | "rejected" | "expired" | "failed"; summary?: string; approvalId?: string; error?: string; activityId?: string };
export type ChatItem = { id: string; role: "user" | "assistant" | "notice"; text: string; tools: ToolView[] };

/** Rebuilds the visible transcript from stored API messages + approvals + activity log. */
export async function conversationView(conversationId: string): Promise<ChatItem[]> {
  const [rows, approvals] = await Promise.all([
    db.chatMessage.findMany({ where: { conversationId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    db.pendingApproval.findMany({ where: { conversationId } }),
  ]);
  const approvalByTool = new Map(approvals.filter((a) => a.toolUseId).map((a) => [a.toolUseId as string, a]));
  const results = new Map<string, { isError: boolean; content: string }>();
  for (const r of rows) {
    if (!Array.isArray(r.content)) continue;
    for (const b of r.content as Array<{ type?: string; tool_use_id?: string; is_error?: boolean; content?: unknown }>) {
      if (b.type === "tool_result" && b.tool_use_id) results.set(b.tool_use_id, { isError: Boolean(b.is_error), content: typeof b.content === "string" ? b.content : "" });
    }
  }
  const items: ChatItem[] = [];
  let current: ChatItem | null = null;
  for (const r of rows) {
    const content = Array.isArray(r.content) ? (r.content as Array<Record<string, unknown>>) : [];
    if (r.role === "USER") {
      if (content.every((b) => b.type === "tool_result")) continue;
      const t = visibleText(content);
      if (t.startsWith("[System notice]")) {
        items.push({ id: r.id, role: "notice", text: t.replace("[System notice] ", ""), tools: [] });
        continue;
      }
      current = null;
      items.push({ id: r.id, role: "user", text: t, tools: [] });
      continue;
    }
    if (!current) {
      current = { id: r.id, role: "assistant", text: "", tools: [] };
      items.push(current);
    }
    const txt = visibleText(content);
    if (txt) current.text = current.text ? `${current.text}\n\n${txt}` : txt;
    for (const b of content) {
      if (b.type !== "tool_use") continue;
      const tid = String(b.id);
      const a = approvalByTool.get(tid);
      const res = results.get(tid);
      let status: ToolView["status"] = res ? (res.isError ? "error" : "ok") : "running";
      if (a) status = a.status === "PENDING" ? "pending_approval" : a.status === "APPROVED" ? "approved" : a.status === "REJECTED" ? "rejected" : a.status === "EXPIRED" ? "expired" : "failed";
      current.tools.push({ id: tid, name: String(b.name), status, summary: a?.summary, approvalId: a?.id, error: res?.isError ? res.content : undefined });
    }
  }
  return items;
}

export async function recentConversations(limit = 30) {
  return db.conversation.findMany({ orderBy: { updatedAt: "desc" }, take: limit, select: { id: true, title: true, updatedAt: true } });
}
