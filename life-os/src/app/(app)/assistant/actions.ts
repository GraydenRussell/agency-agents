"use server";
import { runAction } from "@/lib/actions";
import { conversationView, recentConversations } from "@/lib/assistant/view";

export async function loadConversationAction(id: string) {
  return runAction(async () => conversationView(id));
}

export async function latestConversationAction() {
  return runAction(async () => {
    const [latest] = await recentConversations(1);
    return latest ? { id: latest.id, items: await conversationView(latest.id) } : null;
  });
}
