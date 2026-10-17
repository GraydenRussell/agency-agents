import "server-only";
import { db } from "@/lib/db";

export const EXPORT_VERSION = 1;

/**
 * Everything you'd want back if you left Life OS: plans, notes, health, money, people, assistant memory and
 * history. Excluded on purpose: OAuth tokens, push-subscription keys, rate-limit counters and job bookkeeping
 * (secrets or disposable). Email bodies are included because they are your mail cache.
 */
export async function exportAll() {
  const [
    settings, goals, tasks, routineTemplates, routineBlocks, checklists, checklistItems, checklistRuns, habits, habitLogs,
    calendarEvents, emailThreads, emailMessages, emailDrafts, conversations, chatMessages, memories, approvals, activity,
    apiUsage, reminders, briefs, notes, workouts, sleep, water, budget, transactions, bills, people, interactions, projects, integrations,
  ] = await Promise.all([
    db.setting.findMany(), db.goal.findMany(), db.task.findMany(), db.routineTemplate.findMany(), db.routineBlock.findMany(),
    db.checklist.findMany(), db.checklistItem.findMany(), db.checklistRun.findMany(), db.habit.findMany(), db.habitLog.findMany(),
    db.calendarEvent.findMany(), db.emailThread.findMany(), db.emailMessage.findMany(), db.emailDraft.findMany(),
    db.conversation.findMany(), db.chatMessage.findMany(), db.memory.findMany(), db.pendingApproval.findMany(), db.activityLog.findMany(),
    db.apiUsage.findMany(), db.reminder.findMany(), db.brief.findMany(), db.note.findMany(), db.workout.findMany(), db.sleepLog.findMany(),
    db.waterLog.findMany(), db.budgetCategory.findMany(), db.transaction.findMany(), db.bill.findMany(), db.person.findMany(),
    db.interaction.findMany(), db.project.findMany(),
    // Which accounts were connected, never their tokens.
    db.integrationAccount.findMany({ select: { provider: true, accountEmail: true, status: true, scopes: true, lastSyncAt: true, createdAt: true } }),
  ]);
  const data = {
    settings, goals, tasks, routineTemplates, routineBlocks, checklists, checklistItems, checklistRuns, habits, habitLogs,
    calendarEvents, emailThreads, emailMessages, emailDrafts, conversations, chatMessages, memories, approvals, activity,
    apiUsage, reminders, briefs, notes, workouts, sleep, water, budget, transactions, bills, people, interactions, projects, integrations,
  };
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  return { app: "life-os", version: EXPORT_VERSION, exportedAt: new Date().toISOString(), counts, data };
}
