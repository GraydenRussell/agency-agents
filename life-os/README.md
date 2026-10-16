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

## Security model

- Single user: `proxy.ts` rejects any session that isn't `ALLOWED_EMAIL` at assurance level `aal2` (password + TOTP).
  Server actions and route handlers re-check (`requireUser`).
- Postgres is only reached from the server. RLS is enabled with no policies, so Supabase's public APIs expose nothing.
- OAuth refresh tokens are encrypted with AES-256-GCM before storage.
- No secrets in the repo: everything comes from env (`.env.local` locally, Vercel env in production).
