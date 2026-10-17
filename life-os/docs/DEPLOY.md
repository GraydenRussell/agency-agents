# Deploying Life OS

Target: **Vercel** (app) + **Supabase** (Postgres, Auth, pg_cron). About 45 minutes end to end, most of it waiting on
Google/Twilio consoles. Every step says what to copy where. Secrets only ever go into Vercel env vars or `.env.local`.

**Two helpers do most of the checking for you:**

- `npm run setup:secrets` generates every secret you don't need an account for (encryption key, cron secret,
  sync/API tokens, web-push keys). `-- --write` adds any missing ones to `.env.local` without touching existing values.
- `npm run doctor -- --live` lists each account in order (✔ connected, ○ not set up, ✖ needs a fix), says exactly
  which variable is missing and what to do, and makes a read-only test call to every configured service.
  The same checklist is in the app at **/setup**, with a **Test** button per service.

> Start Twilio registration (step 4) first if you want SMS: carriers take days to weeks to approve it.

> Life OS currently lives in the `life-os/` folder of the `agency-agents` repo. To give it its own repo first:
> create an empty `GraydenRussell/life-os` on GitHub, then from the `agency-agents` checkout run
> `git subtree split --prefix=life-os -b life-os-only && git push git@github.com:GraydenRussell/life-os.git life-os-only:main`.
> History is preserved. (Or keep it here and set Vercel's Root Directory to `life-os`.)

## 1. Supabase

1. Create a **new** project (separate from the admin dashboard's). Region: `us-west-1` is closest to Phoenix.
2. **Project Settings → API**: copy *Project URL* → `NEXT_PUBLIC_SUPABASE_URL`, *anon public* key →
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. **Project Settings → Database → Connection string**:
   - *Transaction pooler* (port 6543) → `DATABASE_URL`
   - *Session pooler* or direct (port 5432) → `DIRECT_URL` (used for migrations)
4. **Authentication → Providers → Email**: enabled. **Authentication → Sign In / Up**: after step 6, turn **off**
   "Allow new users to sign up".
5. **Authentication → Multi-Factor**: enable **TOTP** (app authenticator).
6. **Authentication → Users → Add user**: your email (`ALLOWED_EMAIL`) + a strong password; mark confirmed.
7. From your machine, with `DIRECT_URL`/`DATABASE_URL` pointing at Supabase:
   ```bash
   npm ci
   npm run db:deploy        # applies prisma/migrations
   ```
   Do **not** run `npm run db:seed` against production (it wipes data).
8. **SQL editor**: run `prisma/sql/rls.sql` (locks every table from Supabase's public APIs).
9. **Database → Extensions**: enable `pg_cron` and `pg_net` (cron SQL comes in step 6).

## 2. Google (Gmail + Calendar)

See README → *Google OAuth*. Redirect URI: `https://<your-domain>/api/google/callback`.
Copy `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Workspace account → *Internal* consent screen (recommended).

## 3. Anthropic

Console → API keys → create → `ANTHROPIC_API_KEY`. Defaults: `ANTHROPIC_MODEL=claude-opus-5-5`,
`ANTHROPIC_FAST_MODEL=claude-opus-5-5` (set `claude-haiku-5-5` to cut triage cost). Daily cap is in Settings (default $5).

## 4. Notifications

- Twilio: number + A2P 10DLC or toll-free verification (README → *Notifications*). `TWILIO_*`, `MY_PHONE_NUMBER`.
- Web push: `npx web-push generate-vapid-keys` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

## 5. Vercel

1. **Add New → Project** → import the repo. If it's still inside `agency-agents`, set **Root Directory** = `life-os`.
2. Framework: Next.js (auto). Build command: `npm run build` (runs `prisma generate`). Node 20+.
3. **Environment Variables** (Production + Preview):

   | Variable | Value |
   |---|---|
   | `APP_URL` | `https://<your-domain>` |
   | `DATABASE_URL`, `DIRECT_URL` | from Supabase step 3 |
   | `AUTH_MODE` | `supabase` |
   | `ALLOWED_EMAIL` | your login email |
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase step 2 |
   | `ENCRYPTION_KEY` | `openssl rand -base64 32` (keep forever; rotating it disconnects Google) |
   | `CRON_SECRET` | `openssl rand -hex 32` |
   | `INTEGRATION_MODE` | `live` |
   | `ANTHROPIC_API_KEY` | step 3 |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | step 2 |
   | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `MY_PHONE_NUMBER` | step 4 |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | step 4 |
   | `GITHUB_TOKEN`, `GITHUB_OWNERS` | README → Projects hub |
   | `VERCEL_TOKEN`, `VERCEL_TEAM_ID` | optional |
   | `PROJECTS_SYNC_TOKEN` | `openssl rand -hex 24` (for `npm run sync:local`) |
   | `ADMIN_DASH_URL`, `LIFE_OS_API_TOKEN` | docs/admin-dashboard-endpoint.md |

   The app validates these at startup and logs exactly which one is missing.
4. Deploy, then add your custom domain (Settings → Domains) and update `APP_URL` + the Google redirect URI to match.
5. Fluid Compute (default on new projects) lets the assistant's streaming endpoint run up to 300 s.

## 6. Scheduled jobs

```bash
APP_URL=https://<your-domain> CRON_SECRET=<same as Vercel> npm run cron:sql > cron.sql
```
Run `cron.sql` in the Supabase SQL editor. Check Settings → Automations after the next run (or press **Run now**).

## 7. First login

1. Open `https://<your-domain>` → sign in → scan the TOTP QR code with 1Password/Authy → enter the code.
2. Settings → **Connect Google** → approve. Calendar and inbox sync immediately.
3. Settings → Notifications → **Enable push on this device** → **Test** each channel.
4. On your phone: open the site → Share → **Add to Home Screen** (iOS) or **Install app** (Android).
5. Assistant: “Remember that I prefer customer calls after 10am.” Then: “Plan my day.”

## Updating

- Code: push → Vercel deploys. Migrations: `npm run db:deploy` with production `DIRECT_URL` *before* the deploy
  that needs them.
- Health check: `GET /api/health` → `{ ok: true, db: "up" }`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| “Invalid environment configuration” in logs | Set the variable it names; redeploy |
| Redirect loop to `/login` | `ALLOWED_EMAIL` must match the Supabase user exactly |
| Stuck on `/mfa` | Enable TOTP in Supabase Auth → Multi-Factor |
| “Google needs to be reconnected” banner | Settings → Reconnect (personal Gmail “Testing” apps expire weekly) |
| Jobs never run | `select * from cron.job_run_details order by start_time desc` in Supabase; check `CRON_SECRET` |
| SMS not delivered | Twilio console → Messaging logs (registration status) |
| Assistant says spend cap reached | Settings → Assistant → raise the daily cap |
