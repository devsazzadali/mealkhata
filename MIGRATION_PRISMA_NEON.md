# Migration: Supabase -> Prisma + NeonDB (no Supabase left)

## Problems Solved — 2026-11-04 (this branch, before push)
- **Button-hiding now matches the server (no server check weakened).**
  Server rules were already enforced in `src/lib/api-server.ts` and the
  stats/fines routes; the UI lagged behind. Fixed in the views, using new
  helpers `isMessAdmin` / `canManageMoney` in `src/lib/permissions.ts`:
  - Monthly Bills: "Generate" is now mess_admin/super_admin only
    (server: `stats/generate-bills`); "Mark Paid" now requires
    `edit_money` or `close_month` (server: `MonthlyBills` guard) — previously
    any non-monitor admin view user saw both buttons and got 403.
  - Balance: "Close Month" is now mess_admin/super_admin only
    (server: `stats/close-month`).
  - Join Requests: Approve/Reject are now mess_admin/super_admin only
    (server: `auth/approve-join-request`).
  - Read-only `mess_monitor` writes are now hidden/disabled in: Notices,
    Gallery, Deposits, Expenses, Stocks, Daily Menu (incl. the empty-slot
    "add" button — previously a monitor with an existing menu fell through
    to the add button), Settings, Mess Profile, Boarders, Meal Requests,
    Rice Management. Meals, Bazar Schedule, Fines, Extra Bills and Monthly
    Bills were already gated and were verified, not changed.
  - No API route, guard, or role rule was weakened to match the UI.
- **Upload production path.** `src/app/api/upload/route.ts` now uses a
  provider abstraction: if `BLOB_READ_WRITE_TOKEN` is set it uses Vercel
  Blob via a lazy import of `@vercel/blob` (type-only declaration in
  `src/types/vercel-blob.d.ts`, so the build passes without the package);
  if the token is set but the package is missing it returns 501 instead
  of crashing or silently writing to local disk. Without a token it keeps
  the local `public/uploads` behaviour (dev only — ephemeral on
  serverless hosts). Production step: `npm i @vercel/blob`, then set
  `BLOB_READ_WRITE_TOKEN` in the host env. No token was invented.
- **AUTH_SECRET documented as REQUIRED.** `.env.example` is now names-only
  (all values empty), the "to be decided" wording is removed, and
  `AUTH_SECRET` is marked required with the generation command
  (`openssl rand -hex 32`) as a comment. `src/lib/auth.ts` was verified
  to fail closed without it (it throws; there is no default secret) and
  was not changed.
- **"Bosi bill" made explicit, not invented.** The Extra Bills category
  `rent` is now labelled in the UI as "বাসা ভাড়া / সিট ভাড়া (বসি বিল)".
  The interpretation stays as it was — bosi bill = seat rent, entered
  under `rent` (see the updated comment in `src/lib/stats.ts`) — and is
  ASSUMED pending the owner's confirmation. No new bill type was created.
- **Old-password path made honest.** Both login copies
  (`src/views/Login.tsx`, `src/app/login/page.tsx`) now show a note:
  users of the old login system cannot have their passwords transferred
  and should sign up again with the same mobile number. The signup path
  already exists (`/signup`); no fake password-reset flow was built.
- **Verification 2026-11-04 (placeholder env only, no real credentials):**
  `prisma validate` PASS (schema valid), `npx tsc -p tsconfig.app.json
  --noEmit` PASS, `npm run build` PASS, `vitest` PASS (1/1 — only the
  pre-existing example test exists; there are no stats/rice/fines unit
  tests in the repo, so those formulas were not unit-tested here).
  `grep -rni supabase src/ prisma/ package.json .env.example` still
  returns nothing. No `.env` file exists or was committed.
- **B3 / B2 residual / Q1 — fixed 2026-11-05 (uncommitted, for parent review).**
  - **B3 closeMonth is now transactional:** the locked-period upsert and all
    per-boarder balance updates run in one Prisma `$transaction`
    (`src/lib/stats.ts`; `getMonthStats`/`getBoarderMonthSummary` accept an
    optional `db` client). New `src/test/close-month.test.ts` proves a
    mid-loop crash rolls the period + balances back and re-close never
    double-applies. Residual: two simultaneous closes could still both pass
    the locked check under Read Committed — needs row locking + a live
    concurrency test.
  - **B2 residual closed:** `listHandler` now scopes MessageReads/NoticeAcks
    by their parent's mess (`scopedParentIds`/`parentScopeFor` in
    `src/lib/api-server.ts`); Chat and the emergency-notice popup still get
    every own-mess row they filter in JS. New `src/test/parent-scoping.test.ts`
    (8 tests, listHandler-level). Write paths for those two models were
    deliberately left as-is (list path only was in scope).
  - **Q1 verified against the ORIGINAL SQL in git history** (commit
    `966922c`, `supabase/migrations/20260429113026_….sql` and
    `…/20260429134232_….sql`): close_month balance `deposits − meals × rate`
    is an EXACT MATCH, as are get_month_stats and the boarder summary.
    generate_monthly_bills payable matches except the Prisma port adds
    approved fines (`+ fine_total`) — the original SQL has no fines term;
    fines were added as a migration feature, so this is a documented
    extension, not a porting error. No formula was changed. The original
    had no `locked` column/guard at all — the Prisma locked guard is a
    safety addition, not a mismatch.
  - Verification this batch: vitest **37/37**, tsc PASS (0 errors),
    `prisma validate` PASS (placeholder env only), `npm run build` PASS.
- **Still open (not faked):** live Neon runtime smoke test (login / meal /
  bill / chat against a live DB) — no Mealkhata Neon credential is saved
  anywhere in this workspace; the owner must supply it via secure vault
  or host env at deploy time, then the smoke test can run. Realtime
  polling (15s) is a deliberate tradeoff, not a bug, and is unchanged.

## Status — 2026-11-02 (end of day pass)
- Branch: `prisma-neon-migration` (local, NOT pushed to GitHub)
- Cloned from: devsazzadali/mealkhata-dashboard @ 966922c
- **Code migration is COMPLETE except for the Prisma engine / Neon validation below.**
- `grep -rni "supabase" src/ prisma/ package.json .env.example` returns NOTHING.
  Only this file keeps the word "Supabase" as history notes.
- Typecheck: `npx tsc -p tsconfig.app.json --noEmit` **passes (exit 0)**.
  Note: bare `npx tsc --noEmit` checks nothing (root tsconfig has `"files": []`) — use the
  `tsconfig.app.json` form for real checks.
- Build: `npm run build` **does NOT pass yet**, solely because `@prisma/client` was never
  generated (see Blocker below). It fails at page-data collection with
  "@prisma/client did not initialize yet. Please run prisma generate".

## Decisions applied (task defaults, NOT user choices — confirm with user if they want changes)
- **Auth: custom JWT (jose) + bcryptjs, httpOnly cookie `mealkhata_token`, 7-day expiry,
  helper in `src/lib/auth.ts`.** Profile extended with `email` (unique) + `passwordHash`.
  **Old Supabase Auth passwords CANNOT be migrated** — only hashes exist in the old auth
  system, so old users will need a password reset / new signup. Do not present this as a
  user decision; it is a technical fact.
- **Realtime: polling/refetch (15s) instead of channels.** No extra service.
- **Storage: `POST /api/upload` saving to `public/uploads` for local dev, returning a URL
  stored in `image_url` / `photo_url`. TODO for production: swap to Vercel Blob / S3 /
  Cloudinary. No S3 credentials were invented.**
- **Edge functions + RPCs: Next.js API routes under `src/app/api/` with Prisma
  transactions/aggregations, with mess_id + role checks (application-level, replacing RLS).**

## What was completed (2026-11-02)
- `prisma/schema.prisma`: 27 models, 9 enums. Fixes vs original types:
  `MessageReads` composite `@@id([message_id, user_id])`, `MessSettings.mess_id @id`,
  `Profiles.email @unique` + `passwordHash`, `Boarders.rice_balance Float @default(0)`
  (app code used it; it was missing from the old types), `BazarSchedule.boarder_id2 String?`
  (original UI used a second-member FK; old types were stale — see Caveats).
- `src/lib/prisma.ts` (client), `src/lib/auth.ts` (JWT + bcrypt + guards),
  `src/lib/stats.ts` (ports of get_month_stats, get_boarder_month_summary, close_month,
  generate_monthly_bills), `src/lib/prisma-fields.ts` (field-type map for API coercion),
  `src/lib/api-server.ts` (generic list/create/update/delete with auth + mess-access checks,
  passwordHash stripping), `src/lib/api.ts` (client helper apiGet/apiPost/apiPatch/apiDelete).
- `src/app/api/` — 68 route files, 30 route groups: generic routes for all 27 tables,
  plus auth (login, signup, logout, me, bootstrap-mess, create-boarder, super-create-mess,
  approve-join-request), stats (month, boarder-summary, close-month, generate-bills),
  mess-settings/find-by-join-key, upload.
  Special case: `MessSettings` PK is `mess_id`, so its `[id]` route passes `"mess_id"` as
  the id field. `MessageReads` `[id]` route exists but is not used by the UI (composite key).
- Auth UI migrated: `src/stores/authStore.ts`, `src/providers/AuthProvider.tsx`,
  `src/views/Login.tsx`, `Signup.tsx`, `Onboarding.tsx`, `Profile.tsx`, `Chat.tsx`,
  `src/app/login/page.tsx`, `src/app/signup/page.tsx`, `src/app/onboarding/page.tsx`.
  Login = POST /api/auth/login {phone, password}; signup = /api/auth/signup then login;
  onboarding create = /api/auth/bootstrap-mess, join = find-by-join-key + join-requests.
- All 22 admin views, 5 boarder views, SuperMesses, Chat, Profile migrated to fetch the
  API routes (no direct DB calls). FK joins are done in JS in the component; date-range,
  multi-order and `.or()` filters are done in JS after a mess-scoped fetch (API supports
  equality filters + one order key only). Realtime channels replaced with 15s polling
  (Chat, JoinRequests, MealRequests, EmergencyNoticePopup, NotificationManager).
- Deleted: `src/integrations/supabase/` (client + types), `supabase/` (config, 5 edge
  functions, migrations). Removed `@supabase/supabase-js` and `@supabase/ssr` from
  `package.json`. No `NEXT_PUBLIC_SUPABASE_*` references remain. No `.env` file committed.
- Pre-existing bugs fixed along the way (not migration regressions):
  ExtraBills.tsx missing closing `</div>`; Settings.tsx icons Building2/Calculator/Zap/Wheat
  used but never imported; MyDashboard.tsx destructured 7 names for 8 queries and referenced
  an undefined `bazarRes`; Settings.tsx trailing stray `); }`.

## What was NOT completed
- **Prisma schema validation + client generation — BLOCKED (see below).**
- **No test against a live Neon DB** — no DATABASE_URL yet, no `prisma db push` run.
- **No push to GitHub** — branch is local only; push only after user approval.
- **No runtime smoke test** — login, upload, chat, meal upsert flows need a manual test
  once Neon + generated client are available (see Tomorrow steps).

## Blocker: Prisma engine download fails in this VM
- `prisma@6.18.0` / `@prisma/client@6.18.0` are in package.json and node_modules, and
  `node_modules/.bin/prisma` exists, but every Prisma CLI invocation (even `--help`)
  crashes with `ECONNRESET` while fetching from the Prisma binaries host
  (`Error: aborted ... attemptNumber: 1, retriesLeft: 2`, Node 24).
- Therefore `prisma validate` and `prisma generate` have NOT run successfully.
- The schema was checked manually only: 27 models, 9 enums, every model has an
  @id / @@id, no unknown field types found by a script scan. This is NOT a substitute
  for `prisma validate`.
- Try again on the user's machine / CI, or after the Neon URL arrives, where the
  Prisma binaries host is reachable.

## Caveats / known simplifications (verify during smoke test)
- Chat message-reads: fetched unscoped and filtered to the chat's message IDs in JS
  (generic list route has no message_id-list filter). Works, but will grow with the
  platform — add a proper filter later.
- MyExpenses expense-categories: fetched unscoped in JS (default categories have
  `mess_id: null`, so a mess-scoped fetch would miss them).
- ExtraBills auto-bill: bulk insert became one POST per bill, so a later failure leaves
  earlier bills created (previously all-or-nothing).
- Meal-entry / daily-menu upserts: GET by (boarder_id, meal_date) / (mess_id, menu_date),
  then PATCH if found else POST (no bulk upsert endpoint).
- Settings save: if no `mess_settings` row exists, a new row is now CREATED (old
  update-by-mess_id was a no-op in that case) — an intentional improvement, verify.
- BazarSchedule `boarder_id2`: added to the Prisma schema, but the old Supabase types
  did not list it. If data is imported from Supabase, check whether that column actually
  exists there; if not, the imported data will simply have it null.
- Date equality queries (e.g. `meal_entries?meal_date=YYYY-MM-DD`) rely on the server's
  DateTime coercion matching `@db.Date` storage — verify against the live API.

## Files changed (summary)
- Added: `prisma/schema.prisma`, `src/app/api/**` (68 routes), `src/lib/api.ts`,
  `src/lib/api-server.ts`, `src/lib/auth.ts`, `src/lib/prisma.ts`, `src/lib/prisma-fields.ts`,
  `src/lib/stats.ts`, `.env.example`, this file.
- Modified: `package.json`, `package-lock.json`, `src/stores/authStore.ts`,
  `src/providers/AuthProvider.tsx`, all files under `src/views/**`, `src/app/login|signup|onboarding/page.tsx`,
  `src/components/EmergencyNoticePopup.tsx`, `src/components/NotificationManager.tsx`,
  `src/components/boarders/CreateBoarderDialog.tsx`, `src/lib/phone.ts` (comment only).
- Deleted: `src/integrations/supabase/*`, `supabase/*` (config, functions, migrations).

## Steps for tomorrow (when the Neon URL arrives)
1. Put the Neon connection string in `.env` (local only, NEVER commit it):
   `DATABASE_URL` = Neon pooled URL, `DIRECT_URL` = Neon direct URL.
   Also set `AUTH_SECRET` to a long random string (used for JWT signing).
2. Run, in the repo, on branch `prisma-neon-migration`:
   ```
   npm install
   npx prisma validate
   npx prisma generate
   npx prisma db push
   ```
   If `prisma db push` reports drift, use `prisma migrate dev` instead and keep the
   migration files in `prisma/migrations/`.
3. Decide data import with the user BEFORE pushing data:
   - Empty Neon DB (fresh start, users re-signup), OR
   - `pg_dump` from Supabase -> import to Neon. Note: old auth passwords cannot be
     imported either way (see above); check `bazar_schedule.boarder_id2` existence first.
4. Verify: `npx tsc -p tsconfig.app.json --noEmit` then `npm run build`, then run the
   dev server and smoke-test: signup -> login -> create mess (bootstrap) -> add boarder
   -> add meal -> close month / generate bills -> chat message + image upload.
5. Only after the user approves: commit and push branch `prisma-neon-migration`
   (never force-push, never delete main), then open a PR / merge to main.
