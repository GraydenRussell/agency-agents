# Changelog

All notable changes to Life OS. Dates are America/Phoenix.

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
