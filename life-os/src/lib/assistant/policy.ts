import "server-only";
import { getSetting } from "@/lib/services/settings";

/**
 * Action types that ALWAYS default to needing approval (non-negotiable defaults from the spec):
 * sending email, deleting anything, creating/changing events with other people.
 * Each can be switched to auto-approve per type in Settings (all OFF by default).
 */
export const APPROVAL_ACTIONS: Record<string, string> = {
  "email.send": "Send email replies",
  "email.trash": "Move email to trash",
  "calendar.create.withGuests": "Create events with other people",
  "calendar.update.withGuests": "Change events with other people",
  "calendar.delete": "Delete calendar events",
  "task.delete": "Delete tasks",
  "note.delete": "Delete notes",
  "reminder.cancel": "Cancel reminders",
  "memory.delete": "Forget remembered items",
  "quote.send": "Send quotes to customers (text / email)",
  "lead.reply": "Reply to new leads (text / email)",
};

export async function isAutoApproved(actionType: string, opts: { emailCategory?: string | null } = {}): Promise<boolean> {
  const auto = await getSetting("approvals.autoApprove");
  if (!auto[actionType]) return false;
  if (actionType === "email.send") {
    // Auto-send additionally requires the thread's category to be on the allow-list.
    const cats = await getSetting("approvals.autoSendCategories");
    return Boolean(opts.emailCategory && cats.includes(opts.emailCategory));
  }
  return true;
}
