-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('GOOGLE', 'GITHUB', 'VERCEL', 'TWILIO', 'BUSINESS');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('CONNECTED', 'NEEDS_REAUTH', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "Area" AS ENUM ('BUSINESS', 'PERSONAL', 'HEALTH', 'MONEY', 'LEARNING');

-- CreateEnum
CREATE TYPE "GoalLevel" AS ENUM ('YEAR', 'QUARTER', 'WEEK');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'DROPPED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'DOING', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "DayType" AS ENUM ('WEEKDAY', 'WEEKEND', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BlockKind" AS ENUM ('WAKE', 'GYM', 'WORK', 'ADMIN', 'MEAL', 'WIND_DOWN', 'SLEEP', 'OTHER');

-- CreateEnum
CREATE TYPE "ChecklistKind" AS ENUM ('MORNING', 'EVENING', 'CUSTOM');

-- CreateEnum
CREATE TYPE "HabitCadence" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('GOOGLE', 'LOCAL', 'TASK');

-- CreateEnum
CREATE TYPE "EmailCategory" AS ENUM ('CUSTOMER', 'LEAD', 'VENDOR', 'PERSONAL', 'NEWSLETTER', 'SPAM', 'OTHER');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENT', 'DISCARDED');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "MemoryKind" AS ENUM ('FACT', 'PREFERENCE', 'STYLE', 'PERSON');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "Actor" AS ENUM ('ASSISTANT', 'AUTOMATION', 'USER');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('SMS', 'PUSH', 'EMAIL');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('SCHEDULED', 'SENT', 'CANCELED', 'FAILED');

-- CreateEnum
CREATE TYPE "BriefType" AS ENUM ('DAILY', 'EVENING', 'WEEKLY');

-- CreateEnum
CREATE TYPE "ProjectSource" AS ENUM ('GITHUB', 'MANUAL', 'LOCAL');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DONE', 'IDEA');

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "IntegrationAccount" (
    "id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "accountEmail" TEXT,
    "encryptedTokens" TEXT,
    "scopes" TEXT[],
    "status" "IntegrationStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastError" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "syncCursor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "level" "GoalLevel" NOT NULL,
    "area" "Area" NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "targetValue" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION,
    "unit" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "area" "Area" NOT NULL DEFAULT 'PERSONAL',
    "dueAt" TIMESTAMP(3),
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "top3Date" TEXT,
    "estimateMinutes" INTEGER,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "recurrenceRule" TEXT,
    "recurrenceParentId" TEXT,
    "parentId" TEXT,
    "goalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dayType" "DayType" NOT NULL,
    "days" INTEGER[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutineTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineBlock" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "BlockKind" NOT NULL DEFAULT 'OTHER',
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RoutineBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checklist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ChecklistKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistRun" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "checkedItemIds" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Habit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" "Area" NOT NULL DEFAULT 'HEALTH',
    "cadence" "HabitCadence" NOT NULL DEFAULT 'DAILY',
    "target" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT,
    "icon" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Habit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitLog" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "HabitLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "googleId" TEXT,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "etag" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "attendees" JSONB,
    "source" "EventSource" NOT NULL DEFAULT 'LOCAL',
    "taskId" TEXT,
    "dirty" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSyncState" (
    "calendarId" TEXT NOT NULL,
    "summary" TEXT,
    "syncToken" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "writable" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "lastSyncAt" TIMESTAMP(3),

    CONSTRAINT "CalendarSyncState_pkey" PRIMARY KEY ("calendarId")
);

-- CreateTable
CREATE TABLE "EmailThread" (
    "id" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "fromName" TEXT,
    "fromEmail" TEXT NOT NULL,
    "snippet" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "labels" TEXT[],
    "unread" BOOLEAN NOT NULL DEFAULT true,
    "inInbox" BOOLEAN NOT NULL DEFAULT true,
    "category" "EmailCategory",
    "priority" INTEGER,
    "summary" TEXT,
    "needsReply" BOOLEAN NOT NULL DEFAULT false,
    "triagedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "historyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "fromName" TEXT,
    "fromEmail" TEXT NOT NULL,
    "to" TEXT[],
    "cc" TEXT[],
    "date" TIMESTAMP(3) NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "messageIdHeader" TEXT,
    "isFromMe" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDraft" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "model" TEXT,
    "status" "DraftStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" JSONB NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL,
    "kind" "MemoryKind" NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingApproval" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "risk" TEXT NOT NULL DEFAULT 'medium',
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "conversationId" TEXT,
    "toolUseId" TEXT,
    "result" JSONB,
    "error" TEXT,
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "actor" "Actor" NOT NULL,
    "actionType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "input" JSONB,
    "result" JSONB,
    "undo" JSONB,
    "undoneAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "approvalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiUsage" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheRead" INTEGER NOT NULL DEFAULT 0,
    "cacheWrite" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "channels" "Channel"[],
    "fireAt" TIMESTAMP(3) NOT NULL,
    "rrule" TEXT,
    "nextFireAt" TIMESTAMP(3),
    "status" "ReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "lastSentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "linkedType" TEXT,
    "linkedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brief" (
    "id" TEXT NOT NULL,
    "type" "BriefType" NOT NULL,
    "date" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "markdown" TEXT NOT NULL,
    "deliveredVia" "Channel"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Brief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN,
    "summary" TEXT,
    "error" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[],
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "isJournal" BOOLEAN NOT NULL DEFAULT false,
    "journalDate" TEXT,
    "prompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workout" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "intensity" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SleepLog" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "quality" INTEGER,
    "notes" TEXT,

    CONSTRAINT "SleepLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaterLog" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "ounces" INTEGER NOT NULL,

    CONSTRAINT "WaterLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyLimit" DOUBLE PRECISION NOT NULL,
    "color" TEXT,

    CONSTRAINT "BudgetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "merchant" TEXT NOT NULL,
    "categoryId" TEXT,
    "notes" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "autopay" BOOLEAN NOT NULL DEFAULT false,
    "paidThrough" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT,
    "company" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "birthday" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "followUpDays" INTEGER,
    "nextFollowUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "summary" TEXT NOT NULL,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "source" "ProjectSource" NOT NULL,
    "repoFullName" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "stack" TEXT[],
    "repoUrl" TEXT,
    "defaultBranch" TEXT,
    "lastCommitAt" TIMESTAMP(3),
    "lastCommitMsg" TEXT,
    "openIssues" INTEGER,
    "isPrivate" BOOLEAN,
    "vercelProjectId" TEXT,
    "deployUrl" TEXT,
    "deployState" TEXT,
    "deployedAt" TIMESTAMP(3),
    "launchUrl" TEXT,
    "localPath" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "nextStep" TEXT,
    "notes" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationAccount_provider_accountEmail_key" ON "IntegrationAccount"("provider", "accountEmail");

-- CreateIndex
CREATE INDEX "Goal_level_periodStart_idx" ON "Goal"("level", "periodStart");

-- CreateIndex
CREATE INDEX "Task_status_dueAt_idx" ON "Task"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_top3Date_idx" ON "Task"("top3Date");

-- CreateIndex
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistRun_checklistId_date_key" ON "ChecklistRun"("checklistId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "HabitLog_habitId_date_key" ON "HabitLog"("habitId", "date");

-- CreateIndex
CREATE INDEX "CalendarEvent_start_end_idx" ON "CalendarEvent"("start", "end");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_calendarId_googleId_key" ON "CalendarEvent"("calendarId", "googleId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailThread_gmailThreadId_key" ON "EmailThread"("gmailThreadId");

-- CreateIndex
CREATE INDEX "EmailThread_inInbox_lastMessageAt_idx" ON "EmailThread"("inInbox", "lastMessageAt");

-- CreateIndex
CREATE INDEX "EmailThread_needsReply_idx" ON "EmailThread"("needsReply");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_gmailMessageId_key" ON "EmailMessage"("gmailMessageId");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Memory_key_key" ON "Memory"("key");

-- CreateIndex
CREATE INDEX "PendingApproval_status_createdAt_idx" ON "PendingApproval"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "ApiUsage_date_idx" ON "ApiUsage"("date");

-- CreateIndex
CREATE INDEX "Reminder_status_nextFireAt_idx" ON "Reminder"("status", "nextFireAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "Brief_type_date_key" ON "Brief"("type", "date");

-- CreateIndex
CREATE INDEX "JobRun_startedAt_idx" ON "JobRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobRun_job_slot_key" ON "JobRun"("job", "slot");

-- CreateIndex
CREATE INDEX "Note_isJournal_journalDate_idx" ON "Note"("isJournal", "journalDate");

-- CreateIndex
CREATE INDEX "Workout_date_idx" ON "Workout"("date");

-- CreateIndex
CREATE UNIQUE INDEX "SleepLog_date_key" ON "SleepLog"("date");

-- CreateIndex
CREATE UNIQUE INDEX "WaterLog_date_key" ON "WaterLog"("date");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetCategory_name_key" ON "BudgetCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_externalId_key" ON "Transaction"("externalId");

-- CreateIndex
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Project_repoFullName_key" ON "Project"("repoFullName");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_recurrenceParentId_fkey" FOREIGN KEY ("recurrenceParentId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineBlock" ADD CONSTRAINT "RoutineBlock_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RoutineTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "Checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistRun" ADD CONSTRAINT "ChecklistRun_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "Checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitLog" ADD CONSTRAINT "HabitLog_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingApproval" ADD CONSTRAINT "PendingApproval_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BudgetCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
