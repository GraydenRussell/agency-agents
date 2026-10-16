# Changelog

All notable changes to Life OS. Dates are America/Phoenix.

## [Phase 7] Projects hub — 2026-10-16
### Added
- GitHub discovery (fine-grained token): all repos you own/collaborate on for `GITHUB_OWNERS`, with description,
  privacy, open issues, last commit, and a detected stack (package.json frameworks + languages + topics) for repos
  active in the last 180 days.
- Vercel: production URL and latest deploy state matched to repos.
- Local projects: `npm run sync:local -- ~/Projects` CLI posts folder metadata to a token-protected endpoint; matches
  existing repos by git remote or creates local projects.
- Projects page: status filter (active / paused / idea / done) + search, cards with stack, last commit, issues, deploy
  state, inline next step, status select, Launch (launch URL → deploy URL → repo) and repo buttons; detail sheet with
  links, launch URL override, notes; manual add/delete.
- Sync preserves your status/next step/notes; new repos get an initial status from activity. Hourly `projects` job.
- Assistant `project_status` / `project_add_next_step` now operate on synced data.
- Tests: stack detection, remote parsing, Vercel mapping, sync preserving user fields, live GitHub pagination/owner
  filter/enrichment (stubbed fetch), local upsert + token auth; Playwright projects flow.

## [Phase 6] Reminders & automations — 2026-10-16
### Added
- Notification layer: SMS via Twilio REST, web push (VAPID, service worker with click-through), email to yourself
  via Gmail; quiet hours (crossing midnight) for non-urgent notices; every delivery in the Activity Log; mock outbox.
- Reminders: one-off or recurring (RRULE in Phoenix time), any mix of channels, claimed atomically before sending
  (no double sends), next occurrence scheduled after delivery, failures recorded and shown in Settings.
- Scheduled jobs with per-slot idempotency (`JobRun`): daily brief (6 AM), evening wrap-up (9 PM), weekly review
  (Sunday 6 PM), inbox check every 30 min (sync, triage, AI drafts for important threads, alerts only for
  high-priority mail, deduped per message), reminders every minute, calendar sync every 10 min, nightly maintenance.
- Briefs saved to the Today page (rendered) and delivered on configurable channels; SMS gets a condensed version.
  One AI suggestion per brief (rule-based fallback).
- `/api/cron/<job>` (pg_cron POST with `x-cron-secret`, or Vercel Cron GET with Bearer), `npm run cron:sql`
  generator for Supabase pg_cron + pg_net.
- Settings: channel status + test buttons, push enable/disable per device, brief channels, quiet hours, alert
  threshold, reminders list (cancel), automations with last run + Run now. Today: "Generate now" for the brief.
- Tests: job idempotency/retry, reminder dispatch (one-off, recurring, urgent vs quiet hours), inbox alert dedupe,
  brief contents, cron auth; Playwright: generate brief, test notification, run job.

## [Phase 5] AI assistant — 2026-10-16
### Added
- **Assistant** in a ⌘J side panel on every page and a full page with conversation history. Streams responses
  (SSE), shows tool activity inline, renders safe Markdown.
- Agent loop on `claude-opus-5-5` (adaptive thinking, configurable effort, prompt caching on system + memory,
  server-side refusal fallback `fallbacks: "default"`, Anthropic web search tool). Transcript is stored verbatim and
  append-only (thinking blocks and cache prefixes stay valid); per-turn context (Phoenix time, Top 3, counts) rides on
  the user message instead of the system prompt.
- **33 tools**, each a real server function validated with Zod: email (search, read, summarize, draft, send, archive,
  label, trash), calendar (list, create, move, delete, find free time), tasks (list, create, update, complete, delete,
  prioritize, plan day, plan week), reminders (schedule one-off/recurring via SMS/push/email, list, cancel), notes
  (create, search, journal), projects (status, next step), business numbers, memory (write, forget).
- **Approvals queue**: sending email, deleting anything, and creating/changing events with other people wait for a
  one-tap Approve/Reject (inline card + Approvals page + nav badge). Atomic claim prevents double execution; outcomes
  are fed back to the conversation. Per-action **auto-approve** toggles in Settings (all off by default); auto-send
  additionally requires an allow-listed email category.
- **Activity Log** of every write by the assistant, automations, and you, with **Undo** where an inverse exists
  (tasks, events, email archive/label/trash, notes/journal, reminders, memory, projects).
- **Memory** table (facts, preferences, writing style, people) read before every conversation; editable in Settings;
  the assistant can add/forget items.
- **Safety & cost**: per-minute and per-day tool-call rate limits (atomic DB counters), daily spend cap checked
  before every model call, usage/cost per call, spend shown in Settings and on the assistant page. Email/web content
  is treated as untrusted in the system prompt.
- Quick capture **"AI file"** button: the model classifies and fills in the capture (rule parser fallback).
- **Offline demo model** (mock mode / no API key) that emits real tool calls for common phrasings, so the whole
  pipeline is usable and tested without network access.
- Tests: every tool through the executor (approvals, auto-approve, undo, rate limit, validation), agent loop with a
  scripted model, history normalization, Markdown renderer; Playwright: create via assistant + undo, approval flow,
  ⌘J panel, settings.

### Fixed
- Partial event updates with an explicit `undefined` field no longer blank that field.
- Tool "not found" errors during summarization are returned to the model instead of aborting the turn.

## [Phase 4] Gmail + AI triage — 2026-10-16
### Added
- Gmail REST adapter (threads, history, modify, trash, send, labels) with MIME parsing (multipart, HTML→text,
  quoted-history stripping) and RFC 2822 threaded replies (In-Reply-To/References, UTF-8 headers); mock Gmail with
  10 realistic window-cleaning fixtures.
- Inbox sync: first sync of the last 30 days of inbox threads, then incremental via Gmail history IDs (auto full
  resync when history expires). Runs when the inbox is opened (stale >5 min) or via Sync.
- AI triage per thread: category (customer / lead / vendor / personal / newsletter / spam / other), 0–100 priority,
  one-line summary, needs-reply. Uses structured outputs (`messages.parse` + Zod) on `ANTHROPIC_FAST_MODEL`
  (default `claude-opus-5-5`, low effort), cached system prompt, batched 15 at a time. Deterministic rule-based
  fallback when AI is off, the spend cap is hit, or the model refuses.
- AI-drafted replies in your voice (style + business facts from the memory table), optional instructions,
  never invents prices/dates (uses [placeholders]); template fallback offline.
- Inbox UI: Needs-reply queue (sorted by priority), Inbox, All, category chips, search, thread view with triage
  summary, archive (undo), snooze (Gmail has no snooze API: archive now, return to inbox when due), labels
  (create on the fly), mark unread, trash (undo), draft + edit + send (confirm).
- AI client: usage + cost recorded per call (`ApiUsage`), daily spend cap (default $5) enforced before every call.
- Typed settings store (`Setting` table) for spend cap, rate limits, approval policies, notifications, quick links.
- Email results in the ⌘K search.

### Fixed
- Today page overflowed horizontally on phones (grid columns sized to content), which zoomed the page out and
  made the bottom nav hard to tap. Added a Playwright check for horizontal overflow on every page.

## [Phase 3] Google Calendar two-way sync — 2026-10-16
### Added
- Google OAuth (offline access, consent requests Calendar + Gmail scopes up front), CSRF state cookie, encrypted
  token storage, automatic refresh, revoke on disconnect, and a "reconnect" banner when Google revokes access.
- Calendar REST adapter (no `googleapis` dependency) + deterministic mock adapter for offline dev/tests.
- Two-way sync: incremental pulls with sync tokens (auto full resync on 410), push of local creates/edits/deletes,
  etag-guarded updates; on conflict Google's version wins and the conflict is written to the Activity Log.
  Sync runs on page load when stale (5–10 min), on demand ("Sync"), and right after local edits.
- Calendar page: day / week / month views, routine blocks as background, all-day row, now-line, overlap layout,
  drag events to move them, drag tasks from the tray to time-block them (linked event + task schedule),
  double-click a slot to create, event dialog (all-day, location, guests with invite warning, description, delete
  with undo), per-calendar sync toggles in Settings.
- `findFreeTime` (working hours, routine-aware, weekend skip) ready for the assistant.
- Settings page with the Google integration card.
- Tests: sync/push/conflict/time-block, free-slot math, event mapping, OAuth exchange/refresh/invalid_grant,
  grid layout; Playwright calendar flows.

## [Phase 2] Tasks, goals, notes, routines, Today — 2026-10-16
### Added
- **Today view**: greeting + progress, daily-brief slot, Top 3 priorities (max 3, pinned with ☆), schedule timeline
  (calendar events + routine blocks + time-blocked tasks, "now" marker), due today, overdue with one-click roll-over,
  inbox summary, habit check-ins with streaks and 7-day sparkline, morning/evening checklists, Chandler weather with
  window-cleaning field advice (heat, wind, rain, UV) from Open-Meteo (sample data in mock mode).
- **Tasks**: list and kanban (drag-and-drop with dnd-kit), filters (search, area, due, priority, status) in the URL,
  edit sheet (opens from anywhere via `?task=`) with status/priority/area/due/goal/repeat/time-block/estimate/notes,
  subtasks, RRULE recurrence (next instance spawned on completion, idempotent), soft delete with undo.
- **Goals**: year → quarter → week tree with progress from numeric targets, linked tasks, or sub-goals.
- **Notes & journal**: autosaving editor, tags, pinning, Postgres full-text search (`websearch` syntax) with substring
  fallback, one journal entry per day with a stable daily prompt.
- **Routines & habits**: weekday/weekend/custom templates of time blocks, editable checklists, habits (daily/weekly
  targets, units, streaks).
- **Quick capture** (`C`, ⌘K, or the + button): live-parsed preview; understands dates, times, ranges, relative
  times, `!1`–`!4`, `#area`, and `note:`/`j:`/`event:`/`remind me` prefixes; files tasks, notes, journal lines,
  reminders, and events.
- Service layer (`src/lib/services/*`) shared by UI, future assistant tools, and cron jobs; 46 unit/integration tests,
  15 Playwright tests (desktop + mobile).

### Fixed
- Zod 4 applies `.default()` inside `.partial()`; update schemas no longer use defaults (prevented wiping fields).
- "Due today" query excluded tasks with a NULL Top-3 date (SQL `NOT` + NULL).

## [Phase 1] Foundation — 2026-10-16
### Added
- Next.js 16 (App Router, TypeScript strict + `noUncheckedIndexedAccess`), Tailwind v4, hand-built shadcn/ui-style
  components on Radix (the shadcn registry is unreachable from the build sandbox; components follow shadcn's API).
- Design system: dark default + light toggle, brand tokens (Azure #007ACE, Cyan #66DDFA, Carbon #303030),
  Bebas Neue / Anton headings and Poppins UI, self-hosted via @fontsource (no Google Fonts call at build).
- Full Prisma 7 schema for every module (planning, calendar, mail, assistant, approvals, activity log, reminders,
  briefs, job runs, health, money, people, projects) + initial migration and an RLS lockdown script.
- Auth: Supabase email/password with **required TOTP 2FA** (aal2), single allowed email, enforced in `proxy.ts`
  and again in every server entry point. `AUTH_MODE=dev` for local work (refused on Vercel).
- App shell: desktop sidebar, phone bottom tab bar + "More" sheet, top bar, loading/error/not-found states.
- Command palette (⌘K): navigation, live search across tasks/notes/people/projects, quick actions, theme, sign out.
- Keyboard shortcuts: ⌘K, ⌘J, `c`, `/`, `?`, and `g <letter>` navigation chords, with a shortcut sheet.
- Phoenix time helpers (fixed UTC-7), AES-256-GCM token encryption, env validation, health endpoint.
- Seed script with realistic sample data relative to today.
- Vitest (unit, with a migrated test database) and Playwright (desktop + Pixel 7) suites.
