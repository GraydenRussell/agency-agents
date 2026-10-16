# Changelog

All notable changes to Life OS. Dates are America/Phoenix.

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
