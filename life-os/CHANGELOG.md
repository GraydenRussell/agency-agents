# Changelog

All notable changes to Life OS. Dates are America/Phoenix.

## [11.6] Referral tracker + your dashboard inside Life OS — 2026-10-20
### Added
- **Business → Referrals**: who referred whom, “waiting to book” → “reward owed” → “paid”, rewards owed and
  paid, and a top-referrers leaderboard. Leads marked Referral with a customer's name (“Referred by Priya Patel”)
  become referrals automatically (exact or unambiguous first-name + last-initial match only). A reward is earned
  when the referred person completes a job or their lead is marked won; you get a heads-up with what you owe.
  Reward amount and type (credit / cash / gift card) are set on the page (default $25 credit).
- Assistant: `referral_list`, `referral_add` (undoable while pending).
- **Business → Dashboard**: your Rapid Window dashboard (https://rapid-window-dashboard.vercel.app by default,
  changeable) shown inside Life OS, with Reload and Open-in-new-tab. It's also the first Business quick link.
  The tracker page's Business screen links to it too.
### Couldn't verify
- The dashboard address didn't load from here (blocked by this environment's network rules, and a separate fetch
  couldn't resolve the hostname), so whether it allows being shown inside another app is untested. If the frame is
  blank, use Open in new tab.
- Its numbers can't flow into briefs/KPIs yet: the GitHub repo `Rapid-Windows-dash` is still empty, so the
  `/api/life-os/summary` endpoint (docs/admin-dashboard-endpoint.md) can't be added to it from here.

## [11.5] Review engine — 2026-10-19
### Added
- **Business → Reviews**: Google rating and review count (with growth over the last 30 days), new reviews per
  month, a “Need a reply” queue with a drafted reply on each (AI when available, a template otherwise; 1–3★ are
  flagged “needs care” and get an own-it-and-take-it-offline draft), Redraft, and **Post reply** (public on Google;
  pressing it is the approval; logged).
- **Review requests after every job**: each job Housecall Pro marks complete (1 h–3 days ago) queues one
  “would you leave us a quick Google review?” text with your review link. It waits in **Approvals** (new toggle
  “Text customers asking for a Google review”, default OFF; when on, they go out automatically between 9 AM and
  7 PM). Skipped automatically: no textable phone, or the customer was asked in the last 6 months. Send or skip
  from the Reviews page too.
- Hourly `reviews` job: queue + dispatch requests, sync Google reviews, alert on new unanswered ones
  (⚠️ for 1–3★), record daily totals for the trend.
- Assistant: `review_list`, `review_reply` and `review_request_send`, both of which wait in Approvals.
- Setup page item for Google reviews. Setting GBP_ACCOUNT_ID/GBP_LOCATION_ID adds the Business Profile permission to
  the Google connection (reconnect Google once); without them nothing about your Google sign-in changes.
### Needs from you
- Google must approve your Cloud project for the Business Profile APIs before reviews can be read or replied to
  (a request form; usually a few days). Review-request texts only need your “Ask for reviews” link + Twilio.

## [11.4] Customer re-booking — 2026-10-19
### Added
- **Business → Re-book**: customers due for their next cleaning, grouped Overdue / Due now (2 weeks) / Coming up
  (~6 weeks), from their last completed job and their interval (per customer, or the default of 6 months).
  Customers with work already booked are left off.
- Each row has a drafted text (“It's been about 7 months since we cleaned your windows (Mar 19, 2026)…”) you can
  edit and send (pressing Send is the approval; logged), snooze 30 days, or “don't suggest again”. A customer you
  texted stays off the list for 30 days. The customer page has a “Don't suggest re-booking” switch.
- Monday 7 AM digest: “N customers due for a cleaning” with the repeat-work value (only when someone is due).
- Assistant: `rebook_list` and `rebook_text`, which always waits in Approvals (toggle “Text customers to re-book”, OFF).

## [11.3] Lead inbox — 2026-10-19
### Added
- **Business → Leads**: one queue for website forms, Meta lead ads, lead emails, and calls/referrals you add by
  hand. Unanswered leads sort to the top with a “waiting 23 min” badge (red past your threshold); the Leads tab
  shows how many are waiting.
- Every new lead is **scored 0–100 with a one-line reason** and gets a **drafted first text** in your voice
  (Claude when available; rules otherwise: phone number, service area, commercial/recurring, urgency, job size).
  You get a “New lead” alert right away (push/SMS/email, quiet hours respected).
- **Nudges** if nobody has replied: at 15 min, 1 h, and 4 h (Settings key `leads.nudgeMinutes`), then it stops.
  A nudge held back by quiet hours goes out when they end.
- Lead page: what they said, why the score, edit-and-send reply by text or email (pressing Send is the
  approval; logged), “I called them”, Won/Lost, Re-score, and **Make a quote** (prefilled; the lead moves to
  quoted, then won/lost with the quote).
- **Website webhook** `POST /api/leads/webhook`: JSON, form-encoded, or multipart from any form builder; auth by
  `Authorization: Bearer`, an HMAC signature header, or `?key=` for plain HTML forms (with `?redirect=` to your
  thank-you page). Common field names are matched; extra fields are kept in the message; `_gotcha` honeypot and
  obvious pitches are dropped; repeat submissions and same-person follow-ups within 24 h merge into one lead;
  known customers are linked by phone/email.
- **Meta Lead Ads** `GET/POST /api/leads/meta`: subscription check, `X-Hub-Signature-256` verification, then the
  form answers are fetched from the Graph API after responding.
- Emails the triage marks as LEAD become leads automatically (phone number pulled from the body).
- Assistant: `lead_list`, and `lead_reply`, which always waits in Approvals (toggle “Reply to new leads”, OFF).
- Setup page items for website forms and Meta; `npm run setup:secrets` now generates LEAD_WEBHOOK_SECRET and
  META_VERIFY_TOKEN; new `leads` job every 5 minutes.
### Not possible
- **Google Business Profile messages**: Google shut down Business Profile chat in July 2024, so there is no
  message feed to connect. Leads from your listing arrive by phone, website, or email, which this inbox covers.

## [11.2] Quote builder — 2026-10-19
### Added
- **Business → Quotes**: build a quote in under a minute. Enter panes (outside / inside), screens, tracks,
  hard-water panes, solar screens, stories, and a discount; the price updates as you type (line items → story
  surcharge → discount → minimum charge). Start one from a customer's page and it's prefilled.
- **Pricing** page: your rates, 2-/3-story surcharges, minimum charge, how long quotes stay valid, and the business
  details printed on quotes. Starts at placeholder prices ($6/pane, +$4 inside, $3 screens, $2 tracks, $8 hard water,
  $12 solar screens, +15%/+30% stories, $150 minimum). Old quotes keep the prices they were made with.
- **Branded PDF** (Azure/Cyan header, line items, total, notes, terms) to preview, download, or send.
- **Send to customer** by text (summary + private link to the PDF) and/or email (PDF attached through your Gmail).
  You see and can edit the exact message first; pressing Send is the approval and is logged in the Activity Log.
- Customer link `/q/<token>`: no login needed, the token is a signature of that one quote (can't be guessed or
  changed), not indexed by search engines. Deleting a quote kills its link.
- Quote statuses (draft / sent / won / lost), expiry badges, open pipeline value and close rate.
- Assistant tools: `customer_search`, `quote_create` (draft only, undoable while unsent), and `quote_send`, which
  always waits in **Approvals** (new auto-approve toggle “Send quotes to customers”, default OFF).
### Changed
- Gmail messages can now carry attachments (multipart MIME).
### Needs from you (to send for real)
- Twilio (already on the Setup page) for texts; Google connected for email.
- `APP_URL` must be your public https address, or the link in a quote text won't open for the customer.

## [11.1] Business data foundation: Housecall Pro customers + jobs — 2026-10-18
### Added
- **Customer** and **Job** tables (migration `business_customers_jobs`) with Housecall Pro ids, money owed, crew,
  map coordinates, and two fields only you own: re-book interval (3/4/6/12 months) and notes.
- Housecall Pro adapter (`HOUSECALL_PRO_API_KEY`, read-only): pages through customers and jobs (last 400 days →
  next 90), converts cents to dollars, maps work status, skips malformed rows instead of failing the sync, and
  explains a rejected key. Mock adapter with 8 East Valley customers for sample mode.
- Sync every 30 minutes (`housecall` job, added to `npm run cron:sql`) plus a “Sync Housecall Pro” button.
  Re-sync never overwrites your re-book interval or notes; failures show on the page and in sync state.
- **Business → Customers**: search by name, street, city, email, or phone digits; lifetime value, last cleaned,
  next job, and money owed per customer; add customers by hand. Customer page with contact links, jobs, notes.
- Business section tabs (Overview / Customers); Housecall Pro on the Setup page with a live key test.
- Tests: mapping, paging + auth header, rejected key, idempotent re-sync, roll-up math, validation, phone search;
  Playwright for sync → search → detail → notes, manual add, axe, and phone width.
### Not verified yet
- The live Housecall Pro field mapping is written against their public API docs; it hasn't run against your real
  account. The first live sync will confirm it (the Setup page test checks the key first).

## [Setup] Guided account setup — 2026-10-17
### Added
- **/setup** page (sidebar → System, or `g u`): every external account in setup order with what it powers,
  status (connected / not set up / needs a fix), the exact missing variables, numbered steps, a console link, and a
  live read-only **Test** button (Supabase Auth settings, Anthropic model access, Twilio account status, GitHub,
  Vercel, admin-dashboard endpoint, database migrations). Format checks catch dev placeholders, malformed keys,
  non-E.164 phone numbers, and mock mode before you deploy. Results never include secret values.
- `npm run doctor` (add `-- --live` for network tests): the same checklist in a terminal; exits non-zero until
  everything required for production is ready.
- `npm run setup:secrets`: generates ENCRYPTION_KEY, CRON_SECRET, PROJECTS_SYNC_TOKEN, LIFE_OS_API_TOKEN and a
  VAPID key pair; `-- --write` appends only the missing ones to .env.local.
- **Export my data** (Settings → Your data): one JSON file with every table you own (tasks, goals, calendar, mail
  cache, notes/journal, health, money, people, projects, assistant memory, approvals, activity log) and record
  counts. OAuth tokens, push keys, rate-limit counters and job bookkeeping are excluded. Each export is logged.
- A test that every sidebar entry has a page file in the repo (would have caught the hidden /notes folder).
- Tests: checklist statuses, validators, live-test interpretation with a fake network, secret redaction,
  secret generation and safe .env merging; Playwright for /setup (incl. axe and phone width).

## [Hardening] Security review and CI — 2026-10-16
### Fixed
- The assistant's `memory_forget` deleted without approval; it now goes through the Approvals queue
  (`memory.delete`, auto-approve toggle default OFF) and can be undone.
- Undo is claimed atomically, so a double tap can't run the inverse operation twice; a failed undo releases the claim.
- E2E tests no longer depend on leftover seed data or grab a hidden streamed copy of a form (repeat-safe).
- Pages could stay invisible: the app-wide `loading.tsx` and a few `<Suspense>` wrappers made Next.js stream page
  content into a hidden container that a script reveals later. Newer Chrome sometimes didn't reveal it in time
  (missing buttons, duplicate elements, a 404 after pressing "New note" too early), and without JavaScript the
  page body never showed. Pages now arrive fully rendered; a Playwright test checks them with JavaScript off.
- Tests wait for hydration (`<html data-hydrated>`) instead of network idle, which newer Chrome never reaches.
- **The Notes feature was never committed.** The `agency-agents` repo-wide `.gitignore` has a `notes/` rule that
  silently excluded `src/app/(app)/notes/` and `src/components/notes/`; a fresh clone (CI, Vercel) had no `/notes`
  route. Both folders are now explicitly un-ignored and committed, and page checks require HTTP 200 so a 404 page
  can't pass them.
### Added
- GitHub Actions workflow `.github/workflows/life-os.yml`: Postgres service, typecheck, lint, unit tests, build,
  Playwright (desktop + mobile, axe). Runs only when `life-os/**` changes.

## [Phase 10] PWA, polish, accessibility, deployment — 2026-10-16
### Added
- Installable PWA: generated icons (any + maskable, Apple touch icon), manifest with shortcuts, service worker that
  caches the app shell and static assets, `/offline` fallback, install button in the sidebar.
- `docs/DEPLOY.md`: step-by-step Supabase, Google, Anthropic, Twilio, VAPID, Vercel, pg_cron, first login, and
  how to split Life OS into its own repo.
- Startup env validation (`instrumentation.ts`) that names the missing variable; security headers (frame deny,
  nosniff, referrer policy, permissions policy, HSTS); `DB_POOL_MAX` for serverless pool sizing.
- Playwright: axe WCAG AA scan of every page (desktop + mobile), PWA manifest/service worker checks, mobile
  overflow checks on every page.
### Fixed
- Contrast of primary buttons/links in both themes, unlabeled progress bars and selects, tab lists without panels,
  chart group labels, faded timeline items, and rounding of sleep hours.

## [Phase 9] Health, money, people — 2026-10-16
### Added
- **Health:** water tracker (+8/16/32 oz, 100 oz Phoenix-heat target), sleep log (hours + quality), workout log,
  habit check-ins with streaks, and 14-day sleep / water and 8-week workout-minutes charts (accessible SVG bar charts:
  single hue validated for colorblind/contrast on the dark surface, target lines, hover tooltips, screen-reader tables).
- **Money:** monthly budget by category with pace warnings ("ahead of pace", "over"), manual transactions,
  bills with due-day clamping, autopay, mark-paid, and a bills calendar; month navigation. The schema keeps an
  `externalId` on transactions for a future Plaid import.
- **People:** contacts with relation/company/phone/email/birthday/notes, touchpoint log that resets a per-person
  follow-up interval, follow-up reminders (one tap → scheduled reminder), call/email shortcuts.
- Today "Heads up" card (bills due within 7 days, follow-ups due, birthdays within 14 days) and a "Money & people"
  section in the daily brief.
- Tests: water clamping, sleep upsert, weekly minutes, bill clamping/autopay/paid, month summary, upcoming bills,
  follow-up logic, birthdays across the year boundary; Playwright for all three pages.

## [Phase 8] Business hub — 2026-10-16
### Added
- Business page: revenue today / week / month and last month, month-pace projection, today's jobs, recent leads,
  the admin dashboard's own daily brief (if it provides one), quick links (Google Business Profile, Meta Ads, GA4,
  Housecall Pro, admin dashboard) editable in Settings.
- Integration via a token-protected `GET /api/life-os/summary` on the admin dashboard (Zod-validated contract,
  5-minute cache). `docs/admin-dashboard-endpoint.md` has a drop-in Next.js route handler with the four queries to
  map to your tables (the dashboard repo was empty on GitHub, so table names need confirming).
- Housecall Pro jobs appear on the Today timeline; a business card on Today; numbers feed the daily brief and the
  assistant's `business_numbers` tool.
- Settings: connection status for admin dashboard, GitHub, Vercel; quick-links editor.
- Tests: contract validation, pacing, live fetch auth + error handling, quick links, timeline jobs; Playwright
  business page + quick links.

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
