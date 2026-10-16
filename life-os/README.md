# Life OS

Grayden's personal operating system: day, routines, tasks & goals, Gmail, Google Calendar, Rapid Window Cleaning
business numbers, all Claude Code projects, health/money/people — plus an AI assistant that takes real actions
behind an approval queue. See [PLAN.md](./PLAN.md) for architecture and phases, [CHANGELOG.md](./CHANGELOG.md) for
what's done.

## Quick start (local, no accounts needed)

Requirements: Node 20.9+, PostgreSQL 15+ (local install, Docker, or a Supabase project).

```bash
cp .env.example .env.local
# Minimum for local dev with sample data:
#   DATABASE_URL=postgresql://postgres@localhost:5432/lifeos
#   DIRECT_URL=postgresql://postgres@localhost:5432/lifeos
#   AUTH_MODE=dev
#   INTEGRATION_MODE=mock
#   ALLOWED_EMAIL=you@example.com
#   ENCRYPTION_KEY=$(openssl rand -base64 32)
#   CRON_SECRET=$(openssl rand -hex 32)
npm install
npm run db:migrate      # creates tables
npm run db:seed         # realistic sample data
npm run dev             # http://localhost:3000
```

`AUTH_MODE=dev` skips login locally. `INTEGRATION_MODE=mock` swaps every external service (Google, Twilio, GitHub,
Vercel, Anthropic, admin dashboard, weather) for deterministic fakes so you can click everything offline.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production build / serve |
| `npm run typecheck` | Route type generation + `tsc --noEmit` |
| `npm run lint` | ESLint (`no-explicit-any` is an error) |
| `npm test` | Vitest unit/integration tests (uses `lifeos_test` DB; override with `TEST_DATABASE_URL`) |
| `npm run test:e2e` | Playwright against a production build (uses `lifeos_e2e`; override with `E2E_DATABASE_URL`). Run `npm run build` first. Set `PLAYWRIGHT_CHROMIUM_PATH` to use a preinstalled Chromium. |
| `npm run db:migrate` | Create/apply migrations (dev) |
| `npm run db:deploy` | Apply migrations (prod) |
| `npm run db:seed` | Wipe + reseed sample data (never point this at production) |
| `npm run check` | typecheck + lint + unit tests |

## Environment variables

All variables are documented in [`.env.example`](./.env.example). Highlights:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | yes | Supabase pooled (6543) + direct (5432) URLs |
| `AUTH_MODE` | yes | `supabase` in production |
| `ALLOWED_EMAIL` | yes | The only account allowed to sign in |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod | Supabase Auth |
| `ENCRYPTION_KEY` | yes | 32 bytes base64; encrypts OAuth tokens at rest |
| `CRON_SECRET` | yes | Shared secret for scheduled job endpoints |
| `INTEGRATION_MODE` | yes | `mock` or `live` |
| `ANTHROPIC_API_KEY` | Phase 4+ | Assistant + email triage |
| `GOOGLE_CLIENT_ID/SECRET` | Phase 3+ | Gmail + Calendar OAuth |
| `TWILIO_*`, `MY_PHONE_NUMBER` | Phase 6 | SMS reminders/briefs |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Phase 6 | Web push |
| `GITHUB_TOKEN`, `VERCEL_TOKEN` | Phase 7 | Projects hub |
| `ADMIN_DASH_URL`, `LIFE_OS_API_TOKEN` | Phase 8 | Business hub |

## Production setup (summary — full guide lands in Phase 10)

1. **Supabase**: create a new project. Copy URL + anon key, and the pooled/direct DB URLs.
   Auth → Providers: enable Email; disable sign-ups after creating your user. Auth → MFA: enable TOTP.
2. Run `npm run db:deploy` with the production `DIRECT_URL`, then run `prisma/sql/rls.sql` in the SQL editor.
3. **Vercel**: import the repo, set the env vars above (`AUTH_MODE=supabase`), deploy.
4. First visit: sign in → scan the 2FA QR code → done.

## The assistant

- Set `ANTHROPIC_API_KEY` and `INTEGRATION_MODE=live`. Model: `ANTHROPIC_MODEL` (default `claude-opus-5-5`);
  high-volume work (email triage, capture filing) uses `ANTHROPIC_FAST_MODEL` (same default; set
  `claude-haiku-5-5` to cut cost).
- Without a key (or in mock mode) an offline demo model handles a few phrasings so you can try the flows.
- Safety defaults: sending email, deleting anything, and events with other people go to **Approvals**. Change
  per-action auto-approve, the daily spend cap (default $5), tool-call rate limits, and effort in **Settings**.
- Everything the assistant does is in the **Activity Log** with Undo where possible.
- The chat endpoint streams for up to 300 s (`maxDuration`); Vercel Hobby with Fluid Compute allows this.

## Scheduled jobs (Supabase pg_cron)

Vercel Hobby only runs cron once a day, so every schedule runs in Supabase with `pg_cron` + `pg_net`, which call
signed endpoints on the app (`POST /api/cron/<job>` with `x-cron-secret`). Each job is idempotent per time slot.

| Job | Phoenix time | What it does |
|---|---|---|
| `daily-brief` | 6:00 AM | Weather, schedule + jobs, Top 3, emails needing replies, business numbers, overdue, one suggestion |
| `evening-wrap` | 9:00 PM | Done today, what rolls over, tomorrow's events, prompt to plan |
| `weekly-review` | Sun 6:00 PM | Goal progress, wins, habit streaks, next week's focus |
| `inbox` | every 30 min | Gmail sync + triage, AI drafts for important threads, alert only for high-priority mail |
| `reminders` | every minute | Sends due reminders (SMS / push / email), schedules the next occurrence |
| `calendar` | every 10 min | Google Calendar two-way sync |
| `maintenance` | 3:00 AM | Expires old approvals, prunes rate-limit buckets and job history |

Setup: Supabase → Database → Extensions: enable `pg_cron` and `pg_net`. Then
`APP_URL=https://<your-domain> CRON_SECRET=<same as Vercel> npm run cron:sql > cron.sql` and run `cron.sql` in the
SQL editor. Settings → Automations shows the last run of each job and has **Run now**. (On Vercel Pro you can use
Vercel Cron instead: the same endpoints accept `GET` with `Authorization: Bearer $CRON_SECRET`.)

## Notifications

- **SMS (Twilio):** buy a number, then register it for US texting (A2P 10DLC brand + campaign, or toll-free
  verification); carriers block unregistered traffic. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_FROM_NUMBER` (E.164, e.g. +14805550100) and `MY_PHONE_NUMBER`.
- **Web push:** `npx web-push generate-vapid-keys`, set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT=mailto:you@…`, then Settings → **Enable push on this device** (on iPhone: Add to Home Screen first).
- **Email:** sent to yourself through your connected Gmail.
- Quiet hours (default 9:30 PM–6:00 AM) hold SMS/push; reminders you set always go through. Use **Test** buttons in
  Settings to verify each channel.

## Projects hub

- **GitHub:** create a fine-grained token (Settings → Developer settings → Fine-grained tokens) with access to all
  your repositories and read-only *Metadata*, *Contents*, and *Issues*. Set `GITHUB_TOKEN` and `GITHUB_OWNERS`
  (comma-separated users/orgs, default `GraydenRussell`). Repos sync hourly and via **Sync GitHub**; status, next step,
  notes, and launch URL are yours and are never overwritten by sync.
- **Vercel:** create a token (Account → Tokens) as `VERCEL_TOKEN` (+ `VERCEL_TEAM_ID` for a team). Projects linked to a
  GitHub repo show production URL and latest deploy state.
- **Local folders:** set `PROJECTS_SYNC_TOKEN` in Vercel, then on your computer run
  `LIFE_OS_URL=https://<your-domain> PROJECTS_SYNC_TOKEN=… npm run sync:local -- ~/Projects`. Only metadata (name,
  path, remote, last commit, stack) is sent.

## Google OAuth (Gmail + Calendar)

1. Google Cloud Console → create a project → **APIs & Services → Library**: enable *Google Calendar API* and *Gmail API*.
2. **OAuth consent screen**: if your Gmail is a Google Workspace account, choose **Internal** (tokens don't expire
   weekly and no verification is needed). For a personal @gmail.com account choose **External**, add yourself as a
   test user; note Google expires refresh tokens for unverified "Testing" apps after 7 days, so the app will ask you
   to reconnect weekly (a banner appears).
3. **Credentials → Create OAuth client ID → Web application**. Authorized redirect URI:
   `https://<your-domain>/api/google/callback` (and `http://localhost:3000/api/google/callback` for local).
4. Put the client ID/secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, set `INTEGRATION_MODE=live`, then
   Settings → **Connect Google**.

## Security model

- Single user: `proxy.ts` rejects any session that isn't `ALLOWED_EMAIL` at assurance level `aal2` (password + TOTP).
  Server actions and route handlers re-check (`requireUser`).
- Postgres is only reached from the server. RLS is enabled with no policies, so Supabase's public APIs expose nothing.
- OAuth refresh tokens are encrypted with AES-256-GCM before storage.
- No secrets in the repo: everything comes from env (`.env.local` locally, Vercel env in production).
