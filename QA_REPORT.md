# Mealkhata — QA Report (TEST ONLY, no code changed)

**Date:** 2026-11-04 · **Branch:** `prisma-neon-migration` · **Commit at test time:** `c22d3d7`
**Scope:** `~/workspace/repos/mealkhata-dashboard/` — build, typecheck, schema, route inventory,
role gating, locked-month, rice, fines, onboarding/rules, auth UI, upload, Supabase cleanliness,
sidebar/nav inventory. Tested against `MIGRATION_PRISMA_NEON.md` behaviour, not against what
the code happens to do.

**Totals: 34 tests — PASS 25 · FAIL 5 · BLOCKED 3 · NOTE 1**
**No source file was edited in this batch** (a concurrent cleanup agent was editing the same
repo; this report is testing + reporting only). Live-DB tests are BLOCKED, not faked:
no Mealkhata Neon credential is saved anywhere and no AUTH_SECRET exists, so no live
login/meal/bill/chat run was attempted and none is claimed.

## Results

| ID | Feature / Test | Expected | Actual | Result | Evidence / Severity |
|---|---|---|---|---|---|
| T01 | `npm run build` | Passes | Passes, all `/app/*`, `/me/*`, `/super/*` routes listed | PASS | Own run, exit 0 (after waiting out a concurrent build lock) |
| T02 | `npx tsc -p tsconfig.app.json --noEmit` | Passes | Passes | PASS | Own run, exit 0 |
| T03 | `prisma validate` (placeholder envs only) | Schema valid | "The schema at prisma/schema.prisma is valid" | PASS | Own run; placeholder `DATABASE_URL`/`DIRECT_URL` only, no real values |
| T04 | `vitest` | Test suite passes | 1/1 passes | PASS (caveat) | Only `src/test/example.test.ts` exists — see T34 |
| T05 | Supabase cleanliness | 0 refs in src/prisma/package.json/.env.example | 0 matches | PASS | `grep -rni supabase` |
| T06 | Route inventory: UI call → API route | Every UI resource maps to a real route | `MealRequests.tsx:87` calls `apiPatch("meal_requests", …)` → `/api/meal_requests/<id>` does **not** exist (route is `meal-requests`) | **FAIL — Major** | Repro: open Meal Requests as admin, click Approve/Reject on one request → `decideOne` PATCHes a non-existent route (404). Fix (not done here): change `"meal_requests"` to `"meal-requests"` in `src/views/admin/MealRequests.tsx:87`. All other inventoried resources (advertisements, bazar-schedule, boarders, daily-menus, deposits, events, expenses, extra-bills, feedback, fines, gallery-items, meal-entries, messages, notices, stock-transactions, stocks, mess-settings, messes, monthly-bills, profiles, join-requests, message-reads, notice-acks, auth/*, stats/*, upload) map to existing routes. |
| T07 | MonthlyBills gating | Generate = mess_admin/super_admin; Mark Paid = edit_money or close_month | `isMessAdmin` / `canManageMoney` used, buttons gated | PASS | `src/views/admin/MonthlyBills.tsx:34-35` |
| T08 | Balance gating | Close Month = mess_admin/super_admin | `isMessAdmin` used | PASS | `src/views/admin/Balance.tsx:23` |
| T09 | JoinRequests gating | Approve/Reject = mess_admin/super_admin | `isMessAdmin` used | PASS | `src/views/admin/JoinRequests.tsx:16` |
| T10 | Monitor read-only views | mess_monitor sees no write buttons in Notices, Gallery, Deposits, Expenses, Stocks, DailyMenu, Settings, MessProfile, Boarders, MealRequests, RiceManagement | All use `isMonitorOnly` (from AppSidebar) + `readOnly` gating, incl. DailyMenu empty-slot Add | PASS | Grep per view; server guard in `src/lib/api-server.ts:37-39` returns 403 for read-only monitor writes (defence in depth) |
| T11 | Meals gating | Edit = meal_manager / mess_admin | `canEditMeals`, buttons disabled + toast guard | PASS | `src/views/admin/Meals.tsx:36,125,215,373` |
| T12 | BazarSchedule gating | Edit = bazar_manager / mess_admin | `canEditBazar`, buttons disabled + toast guards | PASS | `src/views/admin/BazarSchedule.tsx:24,60,79,85,98,157,160` |
| T13 | Fines server gating | Create = fine_manager/mess_admin; approve/waive blocked for own fine | Route returns 403 + self-approval ban enforced server-side | PASS (code) | `src/app/api/fines/route.ts:18`, `[id]/route.ts:18-20`; live run BLOCKED, see T31-T33 |
| T14 | ExtraBills gating | Monitor read-only | `isMonitorOnly` + `readOnly` gating | PASS | `src/views/admin/ExtraBills.tsx:67,141,188,276` |
| T15 | Locked-month regenerate | Regenerating a locked month → 423 | `generateMonthlyBills` throws "This month is locked…", `generate-bills` route maps `locked` → 423 | PASS (code) | `src/lib/stats.ts:207-208`, `src/app/api/stats/generate-bills/route.ts:14`; live run BLOCKED |
| T16 | Locked-month re-close | Re-closing a locked month must not double-apply balances | `closeMonth` returns the existing locked period early — **no double adjustment**, but returns 200 with the period, not 423 | NOTE | Safe behaviour, but inconsistent with a "rejected (423)" reading of the locked-month rule. Documented here, not counted as FAIL. `src/lib/stats.ts:125`, `src/app/api/stats/close-month/route.ts` |
| T17 | Rice: create deduction | New meal entry deducts (breakfast+lunch+dinner+guest) × kg_per_meal, only if set | Logic matches spec in code | PASS (code) | `src/lib/rice.ts` `deductRiceForMealEntry`; live run BLOCKED |
| T18 | Rice: edit delta | PATCH adjusts by (new − old) meals × kg_per_meal, never full re-deduction | Logic matches spec in code | PASS (code) | `src/lib/rice.ts` `adjustRiceForMealEdit`, called from `meal-entries/[id]` PATCH |
| T19 | Rice: no stock row | Never invent a row; log + skip with clear reason | Returns `deducted: false` + "no rice stock row exists…" reason, console.warn only | PASS (code) | `src/lib/rice.ts` `applyRiceKgChange` |
| T20 | Rice: atomicity + negative stock | Deduction must be atomic and must not drive stock negative | `applyRiceKgChange` does `stockTransactions.create` then a separate `stocks.update` (no transaction), and never checks whether quantity goes negative | **FAIL — Major (code review)** | Repro (live, BLOCKED): create a meal entry whose deduction exceeds the rice stock, or kill the process between the two writes → stock row and transaction log can disagree, and stock can go below zero. Fix (not done here): wrap both writes in a Prisma `$transaction` and reject/ clamp when the result would be negative. |
| T21 | Rice: meal-entry delete | Deleting a meal entry must reverse its rice deduction | DELETE goes through generic `deleteHandler` with **no** rice reversal call (create deducts, PATCH adjusts, DELETE does nothing) | **FAIL — Major (code review)** | Repro (live, BLOCKED): create a meal entry (rice deducted), delete it → stock stays deducted, so rice balance is permanently understated. Fix (not done here): on DELETE, add the entry's meals × kg_per_meal back via the rice helper before/inside the delete. |
| T22 | Fines UI | Fines page + routes present, create/approve UI gated | Page + `fines` routes present, `canCreate`/`canApprove` used | PASS | `src/views/admin/Fines.tsx`, `src/app/api/fines/` |
| T23 | Onboarding checklist UI | Checklist page present, items incl. rules | Page present, rules item present | PASS | `src/views/admin/OnboardingChecklist.tsx:15,36`, `src/app/app/onboarding-checklist/page.tsx` |
| T24 | rules_accepted blocker (server) | Boarder create + join-approve blocked without rules_accepted | Both return 400 "Mess rules must be accepted…" | PASS (code) | `src/app/api/auth/create-boarder/route.ts:30-31`, `approve-join-request/route.ts:25-26`; live run BLOCKED |
| T25 | Auth UI pages | Login / signup / onboarding pages exist | All exist | PASS | `src/app/login`, `src/app/signup`, `src/app/onboarding` + `src/views/*` copies |
| T26 | Old-login note on login pages | Both login copies show: old passwords could not be transferred, sign up again | **No such note found** in either copy (grep for old/again/transfer/migrat/legacy returns only headings, placeholders, and a "Need a demo?" line) | **FAIL — Major (doc vs code)** | Repro: open `/login` → no old-password note is rendered. `MIGRATION_PRISMA_NEON.md` claims both copies show it; the claim is false for the current code. Fix (not done here): add the note to both `src/views/Login.tsx` and `src/app/login/page.tsx`. Old users otherwise get a bare "Invalid phone or password" with no explanation. |
| T27 | AUTH_SECRET fail-closed | No secret → login/signing throws, no default | `getSecret()` throws when `AUTH_SECRET` is unset | PASS (code) | `src/lib/auth.ts` `getSecret()`; `.env.example` names-only, values empty, AUTH_SECRET marked REQUIRED |
| T28 | Upload provider abstraction | Token set → Vercel Blob; token set but package missing → 501; no token → local dev fallback | Code matches exactly (lazy `@vercel/blob` import, 501 branch, local `public/uploads` fallback) | PASS (code) | `src/app/api/upload/route.ts`; live upload run BLOCKED |
| T29 | Sidebar /app routes | Every sidebar link maps to an existing page | All 24 `/app/*` sidebar targets exist as `src/app/app/*` pages | PASS | Inventory vs `src/app/app/` listing |
| T30 | Boarder /me routes | Every boarder sidebar link maps to an existing page | All `/me/*` targets exist | PASS | Inventory vs `src/app/me/` listing |
| T31 | LIVE: login / signup / onboarding | Live run against Neon DB | Not run | **BLOCKED** | Needs live Neon DB + AUTH_SECRET (neither saved anywhere). Steps when available: set envs in host/local (never commit), run dev server, signup with a test phone, login, verify cookie + `/api/auth/me`, onboarding create/join with rules_accepted on/off. |
| T32 | LIVE: meal entry, bill generation, close month | Live run against Neon DB | Not run | **BLOCKED** | Steps when available: create meal entry → verify rice deduction row; edit entry → verify delta only; generate bills on unlocked month → verify totals; regenerate on locked month → expect 423; close month → verify period locked + balances; re-close → verify no double adjustment. |
| T33 | LIVE: rice stock, upload, chat | Live run against Neon DB | Not run | **BLOCKED** | Steps when available: set kg_per_meal, create entry with/without a "rice" stock row, delete an entry (see T21), upload an image with and without a Blob token, send a chat message + verify 15s polling delivery. |
| T34 | Unit tests for stats/rice/fines formulas | Formulas covered by unit tests | **No stats/rice/fines tests exist** — only the pre-existing example test | **FAIL — Minor** | `find` returns only `src/test/example.test.ts`. The formulas were code-reviewed (T15-T19) but never unit-tested, so a regression would not be caught. Fix (not done here): add vitest cases for closeMonth/generateMonthlyBills locking, rice create/edit/delete, and fine self-approval. |

## Failure list (to be fixed + re-tested by the developer, in priority order)

1. **T06 — MealRequests approve/reject 404s** (`src/views/admin/MealRequests.tsx:87`, `"meal_requests"` → `"meal-requests"`). Highest user impact: the whole meal-request decision flow is broken in the UI.
2. **T26 — Old-login note missing** on both login copies, contradicting the migration doc. Old users will be confused by a bare invalid-credentials error.
3. **T21 — Meal-entry delete does not reverse rice deduction** (stock permanently understated after a delete).
4. **T20 — Rice deduction is not transactional and can go negative** (two separate writes, no stock floor check).
5. **T34 — No unit tests for stats/rice/fines** (only the example test exists).

## Blocked live-DB test list (run once a live Neon DB + AUTH_SECRET are supplied securely)

T31 login/signup/onboarding · T32 meal entry, bill generation, close month (incl. 423 on locked regenerate) · T33 rice stock, upload, chat. None of these is passed, and none is claimed passed, in this report.

## Verified OK (summary)

Build, typecheck, Prisma validation, Supabase cleanliness (0 refs), role gating across all 18 admin views inventoried, locked-month regenerate guard, rice create/edit/no-stock logic, fines self-approval guard, rules_accepted server blocker, AUTH_SECRET fail-closed, upload provider + 501 path, and all sidebar routes (admin + boarder) exist.

## Re-test 2026-11-04 (after cleanup) — FIX + RE-TEST batch

**Scope of this re-test:** the 5 original failures, the cleanup batch's B2/B3/Q1 items, plus regression (build, tsc, schema, vitest, Supabase grep, role-gating spot-check, locked-month 423 path, B1 timezone check). No live DB was used: no Mealkhata Neon credential is saved anywhere and no AUTH_SECRET exists, so live items stay BLOCKED, not faked. Changes from this batch are left **uncommitted** for parent review — NOT committed, NOT pushed (GitHub push remains blocked on auth).

**New totals for the original 34 tests: PASS 30 · FAIL 0 · BLOCKED 3 · NOTE 1**
(All 5 original failures now pass by code path / mocked tests; the 3 live-DB items are unchanged BLOCKED, and the T16 note is unchanged.)

### Previously failed items — re-test results
| ID | Re-test evidence | New status |
|---|---|---|
| T06 MealRequests approve/reject 404 | `src/views/admin/MealRequests.tsx:87` now calls `apiPatch("meal-requests", …)`; route `meal-requests` exists. Cleanup batch's re-scan (29 resources) found 0 other resources without a matching route. | **PASS (code path)** |
| T26 Old-login note missing | Note now present in BOTH copies, verified by grep: `src/views/Login.tsx:76` and `src/app/login/page.tsx:75` — "if you used the old login system, your password could not be transferred — please sign up again with the same mobile number." | **PASS** |
| T21 Meal delete rice reversal | `src/app/api/meal-entries/[id]/route.ts` DELETE is now custom: role + mess-access re-checked, then meal delete + rice add-back (old → 0 via `adjustRiceForMealEdit`) in one `$transaction`, so a rice-write failure rolls the delete back. | **PASS (code path)** — live delete run still BLOCKED (see below) |
| T20 Rice atomicity + negative stock | `src/lib/rice.ts` `applyRiceKgChange` now re-reads the stock row inside one Prisma `$transaction` and runs `stockTransactions.create` + `stocks.update` together; a deduction that would drive quantity below zero is REJECTED (no log row, quantity unchanged, reason `insufficient rice stock…`), never silently clamped. Add-backs cannot go negative. Covered by mocked tests (see T34). | **PASS (code path + mocked tests)** — live reproduction still BLOCKED |
| T34 No stats/rice/fines unit tests | `src/test/stats-rice-fines.test.ts` (14 tests, mocked Prisma) + pre-existing example = 15/15 after cleanup; with this batch's new tests the full suite is **26/26** (see regression below). | **PASS (mocked, not live-DB proof)** |

### Cleanup items B2 / B3 / Q1 — assessment and action
- **B2 listHandler unscoped list — FIXED (main hole), residual documented.** This batch added `messScopeFragment` in `src/lib/api-server.ts` and wired it into `listHandler`: for non-super callers with no `mess_id` filter, models with a `mess_id` column are now scoped to the caller's messes (profile.mess_id + role mess_ids). ExpenseCategories additionally keep global defaults (`mess_id` null); Profiles additionally always keep the caller's own profile; Messes without an accessible id filter now returns 403 for non-super callers (SuperMesses UI is super-gated, and its callers are super_admins, who are exempt). Verified against every mess-less UI call found: Chat profiles-by-id (same-mess senders), boarders-by-user_id (own mess), and SuperMesses unfiltered lists (super_admin, exempt) all still work under the new rule. New unit tests: 9 scoping cases in `src/test/list-scoping.test.ts`, all passing. **Residual (not hidden):** models with NO `mess_id` column — MessageReads (Chat fetches all read receipts and filters in JS) and NoticeAcks — are unchanged by this fix and can still be listed across messes by an authenticated user. Those rows carry no financial content, but this is a documented gap, not a claim of full scoping; closing it needs per-record checks (e.g. message/notice ownership lookup) + live testing, and is left for a follow-up batch.
- **B3 closeMonth not transactional — STILL OPEN, deliberately not refactored in this batch.** Assessment: the risk is real but narrow — a crash between the period upsert (`locked: true`) and the per-boarder balance loop would leave balances partially applied, and the locked guard would then return the period early on re-close WITHOUT re-applying the missing balances (so partial application is not self-healing, though it can never double-apply). Fixing it properly means threading a Prisma interactive transaction through `closeMonth` + `getMonthStats` + `getBoarderMonthSummary` and re-verifying against a live DB; doing that blind, with no live DB available in this batch, risks breaking the one path (month close) that must never corrupt balances. Left untouched, documented here, to be fixed + live-tested together when a live DB is available.
- **Q1 closeMonth balance formula — MATCHES the ported-SQL comment, formula UNCHANGED.** Code: closeMonth adjusts each boarder's running `balance` by `deposits − meals × meal_rate`; `generateMonthlyBills` computes a different figure, `payable = meal_cost + extra_share + fine_total − deposits`. These are different by design (cash-position change vs amount owed after deposits), not a contradiction, and both match the header comment ("ported from the old migrations SQL", `meal_rate = total_expense / total_meals`, 0 when no meals). Caveat: the original SQL itself is no longer in this repo (the `supabase/` migrations were deleted in the migration), so independent re-verification against the original SQL is impossible from this repo alone. Q1 is therefore recorded as "matches in-repo documentation, original-SQL verification still open" — not a bug, and the formula was not changed on a guess.

### Regression (this batch, own runs)
- `npm run build`: **PASS** (all `/app/*`, `/me/*`, `/super/*` routes listed)
- `npx tsc -p tsconfig.app.json --noEmit`: **PASS, 0 errors**
- `prisma validate` (placeholder envs only, no real values): **PASS** — "schema is valid"
- `npx vitest run`: **PASS 26/26** (3 files: 1 example + 14 stats-rice-fines + 11 new list-scoping/B1 tests)
- B1 timezone check: `TZ=Asia/Dhaka npx vitest run src/test/list-scoping.test.ts` — **PASS 11/11**; `periodRange(2026, 11)` = `2026-11-01` → `2026-12-01`, December rolls to `2027-01-01`
- Supabase grep (`src/`, `prisma/`, `package.json`, `.env.example`): **0 matches**
- Role gating spot-check: MonthlyBills (`isMessAdmin`/`canManageMoney`), Balance (`isMessAdmin`), JoinRequests (`isMessAdmin`), DailyMenu (`isMonitorOnly` + `readOnly`, incl. empty-slot Add) — all present and unchanged in intent
- Locked-month 423 path: `generateMonthlyBills` throws on locked period; `generate-bills` route maps a "locked" message to **423**; close-month route requires mess_admin/super_admin (403 otherwise)

### Residual limitations (honest, not failures of the original 5)
- T20 concurrent race: the in-transaction re-read runs under Prisma's default Read Committed isolation with no row lock, so two simultaneous deductions could still both pass a stale quantity check. Sequential and crash cases are fixed; strict concurrent safety would need row locking (e.g. SELECT FOR UPDATE) + a concurrency test.
- Meal-entry PATCH (and create) deliberately do NOT roll the entry back when a rice adjustment is rejected — the entry is the record of truth and the rice result is reported back (see the POST route comment). This is a documented design choice, not the T20 stock-write atomicity fix.
- T16 note unchanged: re-closing a locked month returns the existing period (200), not 423 — safe (no double adjustment), inconsistent with a strict 423 reading.

### Still blocked / still needs the owner (not faked, not claimed)
- Live DB tests T31 (login/signup/onboarding), T32 (meal/bill/close incl. 423 on locked regenerate), T33 (rice/upload/chat), and live reproductions of T20/T21 — need a live Neon DB + AUTH_SECRET, neither saved anywhere.
- GitHub push auth (commit `c22d3d7` + this batch's uncommitted changes are local only; main untouched).
- AUTH_SECRET value in host env; Vercel Blob token + package if production uploads are wanted; "bosi bill" = seat rent confirmation (still assumed, labelled in UI).
- Follow-ups for later batches: B2 residual (MessageReads/NoticeAcks per-record scoping), B3 transactional closeMonth, Q1 original-SQL verification.

## B3 + B2 residual + Q1 — fix batch 2026-11-05

**Scope:** the three follow-ups left open after the 2026-11-04 re-test. No live DB was used (no credential saved, no AUTH_SECRET), so live items stay BLOCKED, not faked. Changes are left **uncommitted** for parent review — NOT committed, NOT pushed.

### B3 — closeMonth transactional — FIXED
`src/lib/stats.ts`: `closeMonth` now runs entirely inside one Prisma `$transaction` — the locked-period check, `getMonthStats` + `getBoarderMonthSummary` (both now accept an optional `db` client, following the `tx?: any` convention in `src/lib/rice.ts`), the extra-bills read, the period upsert (`locked: true`), and every per-boarder balance update. A crash mid-loop rolls the period and all balances back together. Sequential re-close returns the existing locked period without re-applying. Formula unchanged: `balance + (deposits − meals × meal_rate)`.
Tests: new `src/test/close-month.test.ts` (3 tests, mocked Prisma with snapshot/restore simulating a real rollback) — (a) successful close applies the adjustment exactly once (b1 1000 → 900, b2 2000 → 1700 at rate 100), (b) a simulated crash on the 2nd boarder update rejects and leaves period uncreated + both balances untouched, (c) re-close returns the locked period with balances applied exactly once.
**Residual (honest):** under the default Read Committed isolation, two *simultaneous* closes could both pass the locked check before either commits. Sequential and crash cases are fixed; strict concurrent safety needs row locking + a live concurrency test.

### B2 residual — MessageReads / NoticeAcks cross-mess listing — FIXED
`src/lib/api-server.ts`: `listHandler` now scopes these two models by their parent's mess. New helpers: `accessibleMessIds(ctx)` (shared with `messScopeFragment`), `parentScopeFor(model, ids)` (pure: `message_id` / `notice_id` `IN` fragment), `scopedParentIds(ctx, model)` (super admin exempt → null; otherwise the ids of Messages/Notices in the caller's own messes). A caller with no mess gets an empty list. Verified call sites still work: Chat fetches all reads and filters to its own mess's messages in JS (the scoped list is a superset of what it needs — every read of its own mess's messages); the emergency-notice popup fetches acks by `user_id` and filters to its own mess's emergency notices (also still a superset). `messScopeFragment` itself still returns null for these models (it is pure and cannot do a DB lookup) — the scoping now lives in `listHandler`; the old test wording in `src/test/list-scoping.test.ts` was updated to say so.
Tests: new `src/test/parent-scoping.test.ts` (8 tests, mocked auth + Prisma, listHandler-level) — cross-mess read/ack never returned, own-mess reads all returned, `user_id` filter preserved, super admin unscoped, messless caller gets nothing.

### Q1 — closeMonth balance formula vs ORIGINAL SQL — RESOLVED: MATCHES (with two documented differences)
**Evidence (git history, not the deleted working tree):** the original migrations survive in commit `966922c` (parent of the migration commit `c22d3d7`). File `supabase/migrations/20260429113026_caac6fde-01db-4454-a6ff-77da5e683df8.sql` defines `get_month_stats`, `get_boarder_month_summary`, and `close_month`; file `supabase/migrations/20260429134232_8fbe2bc0-5a06-40ac-80a2-c5d0c8b6947b.sql` defines `generate_monthly_bills` (added in commit `86f08ef`). No later migration changes these functions (`git log -S generate_monthly_bills` shows only `86f08ef` and the migration commit).
- **close_month balance: EXACT MATCH.** Original SQL: `UPDATE boarders SET balance = balance + (r.deposits - (r.meals * v_rate))`. Prisma `closeMonth`: `balance + (deposits − meals × meal_rate)`. Same formula, same per-boarder loop over `get_boarder_month_summary`.
- **get_month_stats / get_boarder_month_summary: EXACT MATCH.** Total meals = SUM(breakfast+lunch+dinner), total expense = SUM(expenses), total deposit = SUM(deposits), `meal_rate = total_expense / total_meals` (0 when no meals); summary covers active boarders only, with per-boarder meals and deposits. All match the Prisma ports.
- **generate_monthly_bills payable: MATCHES except one deliberate extension.** Original SQL: `payable = meal_cost + extra_share − deposits`, where extra_share = equal-split total / active boarders + meal-ratio total × (boarder meals / total meals). The Prisma port computes the same meal_cost, extra_share (via `extraShareByKey`, same equal + meal-ratio split), and payable — **plus approved fines** (`+ fine_total`). The original SQL has no fines term anywhere (no `fine` in any `generate_monthly_bills` version in git history). Fines were added as a Phase 1/2 feature in the Prisma migration, so charging approved fines in the bill is the intended feature, not a porting error. **No formula was changed** — the +fines difference is recorded here as a proposal-free fact; if the owner wants bills without fines, that is a product decision, not a bug fix.
- **Locked handling: Prisma-era improvement, not in the original.** The original `monthly_periods` table had NO `locked` column and `close_month` had NO locked guard — re-running it would re-apply the balance adjustment a second time (ON CONFLICT update + loop again). The Prisma port added the `locked` flag, the early-return guard, and (in `generateMonthlyBills`) the locked-month 423. Those are deliberate safety additions, not mismatches.
**Q1 status: VERIFIED against the original SQL — no mismatch in the close formula; the only payable difference is the documented +approved-fines extension.**

### Regression (this batch, own runs)
- `npx vitest run`: **PASS 37/37** (5 files: 1 example + 14 stats-rice-fines + 11 list-scoping + 3 close-month + 8 parent-scoping)
- `npx tsc -p tsconfig.app.json --noEmit`: **PASS, 0 errors**
- `prisma validate` (placeholder envs only, no real values): **PASS** — "schema is valid"
- `npm run build`: **PASS** (all `/app/*`, `/me/*`, `/super/*` routes listed)
- Supabase grep (`src/`, `prisma/`, `package.json`, `.env.example`): **0 matches**

### Still blocked / still needs the owner (not faked, not claimed)
- Live DB tests T31/T32/T33 and live reproductions of T20/T21/B3 — need a live Neon DB + AUTH_SECRET, neither saved anywhere.
- GitHub push auth (commit `c22d3d7` + uncommitted changes local only; main untouched).
- AUTH_SECRET value in host env; Vercel Blob token + package if production uploads are wanted; "bosi bill" = seat rent confirmation (still assumed, labelled in UI).
- Follow-ups: B3 concurrent-close race (row locking + live concurrency test); B2 create/update/delete paths for MessageReads/NoticeAcks were deliberately left unscoped (only the list path was in scope — a write to another mess's message id is still possible via direct API call, though the UI never does it).
