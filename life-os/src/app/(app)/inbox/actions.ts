"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import * as mail from "@/lib/services/mail";

const refresh = () => revalidatePath("/", "layout");
const act = <T,>(fn: () => Promise<T>) =>
  runAction(async () => {
    const r = await fn();
    refresh();
    return r;
  });

export async function syncInboxAction() {
  return act(async () => {
    const r = await mail.syncAndTriage();
    if ("skipped" in r.sync) return "Google isn't connected yet.";
    return `Inbox synced: ${r.sync.updated} updated, ${r.triaged.length} triaged.`;
  });
}
export async function archiveAction(id: string) {
  return act(async () => void (await mail.archiveThread(id)));
}
export async function unarchiveAction(id: string) {
  return act(async () => void (await mail.unarchiveThread(id)));
}
export async function markReadAction(id: string, read: boolean) {
  return act(async () => void (await mail.markRead(id, read)));
}
export async function labelAction(id: string, name: string) {
  return act(async () => void (await mail.labelThread(id, name)));
}
export async function snoozeAction(id: string, untilIso: string) {
  return act(async () => void (await mail.snoozeThread(id, new Date(untilIso))));
}
export async function trashAction(id: string) {
  return act(async () => void (await mail.trashThread(id)));
}
export async function untrashAction(id: string) {
  return act(async () => void (await mail.untrashThread(id)));
}
export async function draftAction(id: string, instructions?: string) {
  return act(async () => {
    const d = await mail.generateDraft(id, instructions);
    return { body: d.body, ai: Boolean(d.model) };
  });
}
export async function saveDraftAction(id: string, body: string) {
  return runAction(async () => void (await mail.saveDraft(id, body)));
}
export async function discardDraftAction(id: string) {
  return act(async () => void (await mail.discardDraft(id)));
}
/** The user pressing Send in the UI is the approval; assistant sends go through the Approvals queue. */
export async function sendReplyAction(id: string, body: string) {
  return act(async () => {
    const r = await mail.sendReply(id, body);
    const { db } = await import("@/lib/db");
    await db.activityLog.create({ data: { actor: "USER", actionType: "email.send", summary: `Replied to ${r.to.join(", ")}`, input: { threadId: id } } });
    return r;
  });
}
