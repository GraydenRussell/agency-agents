# Life OS — Build Plan

Personal operating system for Grayden (Rapid Window Cleaning / AZ Rapid Washers LLC, Chandler AZ).
One web app: day, routines, tasks/goals, email, calendar, business, projects, life areas, and an AI
assistant that takes real actions behind an approval gate.

Timezone everywhere: `America/Phoenix` (UTC-7, no DST). All timestamps stored in UTC; all "day"
boundaries computed in Phoenix time via one helper (`lib/time.ts`).

---

## 0. Decisions (confirmed vs. assumed)

| # | Topic | Decision | Status |
|---|---|---|---|
| D1 | Repo | Own repo `life-os`. GitHub blocked automated repo creation, so code lives in `life-os/` on branch `claude/ecstatic-shannon-p0aanr` of `agency-agents` until you create `GraydenRussell/life-os`; then moved with `git subtree split` (history kept). | Confirmed (temporary location) |
| D2 | Business data | Token-protected `GET /api/life-os/summary` on the admin dashboard; Life OS calls it and deep-links into the dashboard. Contract in §6. | Confirmed |
| D3 | Database | New, separate Supabase project for Life OS. | Confirmed |
| D4 | Scheduling | Vercel Hobby → **Supabase pg_cron + pg_net** calls signed Life OS endpoints (`/api/cron/*`). One place for all schedules. | Confirmed |
| D5 | Admin dashboard repo | `GraydenRussell/Rapid-Windows-dash` is the admin dashboard but is **empty on GitHub**, so I can't copy its conventions or add the endpoint yet. I'll ship the endpoint as a drop-in file + spec. | Confirmed / blocked on code push |
| D6 | Gmail account type | Assumed **Google Workspace** (Internal OAuth app, no 7-day token expiry). Personal Gmail also works; the app then shows a "reconnect Google" banner when the token dies. | **Assumed** |
| D7 | Calendars | Primary calendar two-way; others are selectable read-only in Settings. | Assumed |
| D8 | SMS | Twilio. Number + A2P/toll-free registration are on you; SMS stays off until env vars exist (email/push still work). | Assumed |
| D9 | Outgoing email (briefs) | Sent through your own Gmail (no extra service). | Assumed |
| D10 | Brief delivery | Dashboard + email by default; SMS toggle in Settings. Quiet hours 21:30–06:00 (high-priority only). | Assumed |
| D11 | AI | Anthropic `claude-opus-5-5` (current default per Anthropic docs), adaptive thinking, streaming, tool use, server-side `web_search_20260209`, prompt caching, `fallbacks: "default"`. Triage uses the same model at low effort; `ANTHROPIC_FAST_MODEL` can point it at `claude-haiku-5-5` to cut cost. Daily spend cap default **$5**. | Assumed (cap) |
| D12 | Weather | Open-Meteo (free, no key), Chandler 33.3062, -111.8413. | Assumed |
| D13 | Auth | Supabase email + password, **TOTP MFA required** (aal2 enforced in middleware), single allowed email via `ALLOWED_EMAIL`. | Assumed |
| D14 | Tyce | No access. Single user. | Assumed |
| D15 | Projects discovery | GitHub user `GraydenRussell` (+ extra owners in Settings). Local folders via optional `scripts/sync-local-projects.ts` CLI that posts to the app. | Assumed |
| D16 | Mock mode | Every integration has a mock adapter (`INTEGRATION_MODE=mock`) backed by seed data so every phase is clickable/testable before keys exist. | Assumed |
| D17 | Writing style | With your OK at connect time, assistant samples last 200 sent emails into a `style` memory. | Assumed |

Anything marked **Assumed** can be changed by replying; none of them block Phase 1–2.

---

## 1. Architecture

```
Browser / PWA (Next.js App Router, RSC + client islands, shadcn/ui, Tailwind v4)
   │  Server Actions + Route Handlers (Node runtime)
   ▼
lib/services/*      ← domain logic (tasks, goals, notes, calendar, mail, reminders, …)
   │                  pure TS, unit-tested, used by UI AND by assistant tools AND by cron jobs
   ├── lib/integrations/{google,gmail,calendar,twilio,push,github,vercel,weather,business}
   │        each: interface + real adapter + mock adapter (selected by env)
   ├── lib/assistant/  (agent loop, tool registry, approval gate, memory, spend/rate limiter)
   └── Prisma → Supabase Postgres (RLS on; app connects as service role server-side only)

Supabase pg_cron ──(pg_net HTTP POST + HMAC header)──► /api/cron/{inbox,reminders,brief,wrap,weekly,calendar-sync}
```

Key principles
- **One service layer.** UI, assistant tools, and cron all call the same `lib/services` functions,
  so a tool "create task" is the same code path as the button. Tests target this layer.
- **Every assistant side-effect goes through `executeAction()`**: rate-limit → policy check
  (auto-approve vs. queue) → run → write `ActivityLog` (with inverse/undo payload when possible).
- **Integrations behind interfaces** with mock adapters → deterministic tests, offline dev, seed demo.
- **Secrets only in env.** OAuth refresh tokens stored encrypted (AES-256-GCM, `ENCRYPTION_KEY`).
- **Single user**: middleware rejects any session whose email ≠ `ALLOWED_EMAIL` or whose AAL < aal2.

Stack: Next.js 16 (App Router, TS strict), Tailwind v4, shadcn/ui, Prisma, Supabase (Postgres,
Auth, Storage, pg_cron), `@anthropic-ai/sdk`, `googleapis`, `twilio`, `web-push`, Octokit,
Vercel REST, Zod, TanStack Query (client caching where needed), `cmdk` (palette), `@dnd-kit`
(kanban + time-blocking), Vitest + Testing Library, Playwright, MSW for HTTP mocks.

Design: dark default (light toggle), tokens on CSS vars — Azure `#007ACE` primary, Cyan `#66DDFA`
accent, Carbon `#303030` surfaces. Bebas Neue headings, Poppins UI (next/font). Mobile-first;
bottom tab bar on phone, sidebar on desktop. `Cmd/Ctrl+K` palette, `g t` / `g c` / `g i` … nav
chords, `c` quick capture, `/` search, `?` shortcut sheet.

---

## 2. Data model (Prisma, abbreviated)

Core
- `Setting` (key, json) — feature toggles, auto-approve policies, spend cap, quiet hours, delivery prefs
- `IntegrationAccount` (provider, accountEmail, encryptedTokens, scopes, status, lastSyncAt, syncCursor)

Planning
- `Area` enum: BUSINESS | PERSONAL | HEALTH | MONEY | LEARNING
- `Goal` (title, level YEAR|QUARTER|WEEK, parentId, area, period start/end, targetMetric?, status)
- `Task` (title, notes, status TODO|DOING|DONE|CANCELED, priority 1–4, area, dueAt, scheduledStart/End,
  isTop3Date, goalId, parentId (subtasks), recurrenceRule (RRULE), recurrenceParentId, sortOrder, completedAt)
- `RoutineTemplate` (name, dayType WEEKDAY|WEEKEND|CUSTOM, days[]) → `RoutineBlock` (title, start, end, kind, color)
- `Checklist` (MORNING|EVENING|custom) → `ChecklistItem`; `ChecklistRun` (date, checkedItemIds)
- `Habit` (name, cadence, target, area) → `HabitLog` (date, value)

Calendar & mail
- `CalendarEvent` (googleId, calendarId, etag, title, start, end, allDay, location, attendees json,
  source GOOGLE|LOCAL|ROUTINE|TASK, taskId?, deletedAt) + `CalendarSyncState` (calendarId, syncToken)
- `EmailThread` (gmailThreadId, subject, from, snippet, lastMessageAt, labels[], unread, category,
  priority 0–100, summary, needsReply, snoozedUntil, historyId)
- `EmailMessage` (gmailMessageId, threadId, from, to, cc, date, bodyText, bodyHtmlRef)
- `EmailDraft` (threadId, body, model, status DRAFT|QUEUED|SENT|DISCARDED)

Assistant
- `Conversation` → `ChatMessage` (role, content json, tokens, costUsd)
- `Memory` (kind FACT|PREFERENCE|STYLE|PERSON, key, value, source, updatedAt)
- `PendingApproval` (actionType, payload json, summary, risk, status PENDING|APPROVED|REJECTED|EXPIRED, conversationId, decidedAt)
- `ActivityLog` (actor ASSISTANT|AUTOMATION|USER, actionType, input json, result json, undo json?, undoneAt, approvalId?)
- `ApiUsage` (date, model, inputTokens, outputTokens, cacheRead, costUsd) — spend cap source
- `RateLimitBucket` (key, windowStart, count)

Reminders & automations
- `Reminder` (title, body, channels[] SMS|PUSH|EMAIL, fireAt, rrule?, nextFireAt, status, linkedType/Id)
- `PushSubscription` (endpoint, keys json, userAgent)
- `Brief` (type DAILY|EVENING|WEEKLY, date, content json, markdown, deliveredVia[])
- `JobRun` (job, startedAt, finishedAt, ok, error) — cron observability + idempotency (unique job+slot)

Life areas
- `Note` (title, body md, tags[], isJournal, journalDate, prompt, tsvector for FTS)
- `Workout`, `SleepLog`, `WaterLog`
- `BudgetCategory`, `Transaction` (manual; `plaidId?` reserved), `Bill` (amount, dueDay, rrule, autopay, paidThrough)
- `Person` (name, relation, phone, email, notes, lastContactedAt, followUpEvery, nextFollowUpAt) → `Interaction`

Projects
- `Project` (source GITHUB|MANUAL|LOCAL, repoFullName, name, description, stack[], lastCommitAt/msg,
  openIssues, deployUrl, deployState, vercelProjectId, launchUrl, status ACTIVE|PAUSED|DONE|IDEA, nextStep, notes, syncedAt)

RLS enabled on every table with deny-all for anon; server uses service role via Prisma.

---

## 3. Assistant design

- Loop: Anthropic TS SDK, streaming, `claude-opus-5-5`, adaptive thinking, `effort` configurable
  (default `medium`), tools with `strict: true`, server `web_search_20260209`.
- System prompt (cached): identity + rules + tool policy. Then a cached "context pack": memory table,
  today's date/time in Phoenix, top priorities. Volatile context comes after the cache breakpoint.
- Tools (each = Zod schema → service function → `executeAction`), grouped:
  - email: `email_search`, `email_read`, `email_summarize`, `email_draft_reply`, `email_send_reply`*, `email_archive`, `email_label`
  - calendar: `calendar_list`, `calendar_create`* (*if attendees), `calendar_move`, `calendar_delete`*, `calendar_find_free_time`
  - tasks: `task_create`, `task_update`, `task_complete`, `task_prioritize`, `plan_day`, `plan_week`
  - reminders: `reminder_schedule` (one-off or RRULE; SMS/push/email)
  - notes: `note_create`, `note_search`, `journal_append`
  - projects: `project_status`, `project_set_next_step`
  - business: `business_summary`
  - memory: `memory_read`, `memory_write`
  - web: `web_search` (server tool)
  - `*` = requires approval by default (send email, any delete, events with other people)
- Approval gate: gated tool returns `{status:"pending_approval", approvalId}` to the model; UI shows a
  card (chat + `/approvals` + push notification). Approve → executes and logs; result posted back.
- Auto-approve policies per action type (and for email: per category), all default OFF.
- Rate limit: per-minute and per-day tool-call buckets; spend cap checked before every model call
  (hard stop + banner when exceeded; cron jobs degrade to non-AI summaries).
- Undo: ActivityLog stores inverse ops (un-archive, restore task, delete created event, etc.); sent
  email is marked non-undoable.

---

## 4. Automations (pg_cron → `/api/cron/*`, HMAC-signed, idempotent via JobRun)

| Job | Schedule (Phoenix) | UTC cron |
|---|---|---|
| Daily brief | 06:00 daily | `0 13 * * *` |
| Evening wrap-up | 21:00 daily | `0 4 * * *` |
| Weekly review | Sun 18:00 | `0 1 * * 1` |
| Inbox triage | every 30 min | `*/30 * * * *` |
| Reminders dispatcher | every minute | `* * * * *` |
| Calendar incremental sync | every 10 min | `*/10 * * * *` |
| Projects sync | hourly | `0 * * * *` |

---

## 5. Phases & checklist

Each phase ends with: typecheck, lint, unit tests, Playwright smoke, app boots, CHANGELOG entry, short summary.

### Phase 1 — Foundation
- [ ] Next.js + TS strict + Tailwind v4 + shadcn/ui, fonts, theme tokens, dark default
- [ ] Prisma schema (full model above) + migrations + Supabase local via docker or any Postgres
- [ ] Supabase auth: login, TOTP enroll/verify, middleware enforcing allowed email + aal2
- [ ] Dev-only auth bypass (`AUTH_MODE=dev`) for local/E2E, refused in production builds
- [ ] App shell: sidebar / mobile tab bar, routes stubbed with loading/empty/error states
- [ ] Command palette (cmdk) + keyboard shortcut system + shortcut sheet
- [ ] `lib/time.ts` (Phoenix helpers), env validation (Zod), crypto helper, logger
- [ ] Seed script skeleton, Vitest + Playwright setup, `.env.example`, README, CHANGELOG

### Phase 2 — Tasks, goals, notes, routines, Today
- [ ] Tasks: CRUD, subtasks, RRULE recurrence, priority/area/due, list + kanban (dnd), filters, search
- [ ] Goals tree (year → quarter → week), task links, progress bars
- [ ] Notes + journal (daily prompt), Postgres full-text search
- [ ] Routine templates + blocks, morning/evening checklists, habits + streaks
- [ ] Today view: timeline (events + routine + jobs + scheduled tasks), Top 3, due/overdue, habits,
      weather card, inbox summary card (mock until Phase 4), brief card (placeholder until Phase 6)
- [ ] Quick capture (rule-based parser now; AI classification added in Phase 5)
- [ ] Realistic seed data

### Phase 3 — Google Calendar two-way sync
- [ ] Google OAuth connect flow, encrypted token storage, refresh handling, reconnect banner
- [ ] Incremental sync (syncToken), etag-based conflict handling, push local edits
- [ ] Day/week/month views, drag tasks to time-block (creates linked event), resize/move

### Phase 4 — Gmail + AI triage
- [ ] Inbox list/thread view, history-based incremental sync
- [ ] Triage (category, priority, one-line summary, needsReply) via ANTHROPIC_FAST_MODEL, batched, cached by message
- [ ] Needs-reply queue with drafts in your voice; send/reply/archive/label/snooze

### Phase 5 — Assistant
- [ ] Chat panel (every page, `Cmd+J`) + full page, streaming, tool-call cards
- [ ] Tool registry + all tools above with unit tests (mock adapters)
- [ ] Memory table + UI, approvals queue, activity log with undo, settings for auto-approve
- [ ] Rate limiting + daily spend cap + usage page; AI quick-capture filing

### Phase 6 — Reminders & automations
- [ ] Reminders (one-off + recurring) via SMS / web push / email; dispatcher
- [ ] Daily brief, evening wrap, weekly review (dashboard + delivery), inbox 30-min job w/ high-priority alerts
- [ ] pg_cron SQL migration + `/api/cron/*` signed endpoints + JobRun log page

### Phase 7 — Projects hub
- [ ] GitHub discovery (repos, last commit, issues, languages → stack), Vercel deployments/status
- [ ] Status tags, next step, notes, manual add, launch button, local-folder sync CLI

### Phase 8 — Business hub
- [ ] Client for `/api/life-os/summary` (+ mock), revenue/jobs/leads widgets, brief integration
- [ ] Quick links (GBP, Meta Ads, GA4, Housecall Pro, admin dashboard) configurable in Settings
- [ ] Drop-in endpoint file + instructions for the admin dashboard

### Phase 9 — Health, money, people
- [ ] Workouts/sleep/water logs + charts, habit streaks
- [ ] Budget categories, transactions, bills calendar (Plaid seam left in schema/service)
- [ ] People: notes, last contacted, follow-up reminders (feeds Today + reminders)

### Phase 10 — PWA, polish, deploy
- [ ] Manifest, icons, service worker (offline shell, push handler), install prompt
- [ ] Performance pass (RSC streaming, query caching), a11y pass, full test pass
- [ ] Deployment guide: Supabase project, pg_cron, Google Cloud OAuth, Twilio, Vercel env vars

---

## 6. Admin dashboard contract (D2)

`GET {ADMIN_DASH_URL}/api/life-os/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`
Header: `Authorization: Bearer {LIFE_OS_API_TOKEN}`
```json
{
  "asOf": "2026-10-16T13:00:00Z",
  "revenue": { "today": 0, "wtd": 0, "mtd": 0, "lastMonth": 0, "currency": "USD" },
  "jobs": { "today": [{ "id": "", "customer": "", "address": "", "start": "", "end": "", "total": 0, "status": "" }],
            "scheduledThisWeek": 0, "completedThisWeek": 0 },
  "leads": { "new24h": 0, "open": 0, "recent": [{ "id": "", "name": "", "source": "", "createdAt": "", "status": "" }] },
  "dailyBrief": { "markdown": "", "generatedAt": "" },
  "links": { "dashboard": "", "jobs": "", "leads": "" }
}
```
Jobs from this feed also appear on the Today timeline.

---

## 7. Testing & quality
- TS `strict`, `noUncheckedIndexedAccess`; ESLint (no-explicit-any as error)
- Vitest: services, tool functions, integrations (MSW / mock adapters), time helpers, RRULE, approval gate
- Playwright: login (dev mode), quick capture → task, kanban move, approve a queued email send,
  palette navigation, mobile viewport smoke
- CI-ready scripts: `typecheck`, `lint`, `test`, `test:e2e`, `db:seed`

## 8. What you'll need to provide (when we reach that phase)
Supabase project URL/keys + DB URL (P1 deploy) · Google Cloud OAuth client (P3) · Anthropic key (P4/P5)
· Twilio SID/token/number + registration (P6) · VAPID keys (generated by script, P6) · GitHub fine-grained
read token + Vercel token (P7) · admin dashboard URL + shared token (P8) · business quick-link URLs (P8).
