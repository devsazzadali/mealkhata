# Mealkhata — Code Audit + Cleanup (branch prisma-neon-migration)

**Date:** 2026-11-04 · **Scope:** `src/` (views, components, lib, API routes) +
`prisma/schema.prisma`. No behaviour, role rule, or financial formula was
changed except bug B1 below (listed separately). No commit was made by this
audit — changes are left uncommitted on `prisma-neon-migration` for review.
No password, key, or connection string was saved, repeated, or committed;
`prisma validate` used placeholder env values only.

## Baseline (before cleanup)
- `npx tsc -p tsconfig.app.json --noEmit`: **PASS, 0 errors**
  (project config has `strict: false`, `noUnusedLocals: false`,
  `noUnusedParameters: false`, `noImplicitAny: false` — so the strict
  check below was run as a diagnostic only, config untouched).
- `npm run build`: **PASS**
- `prisma validate` (placeholder env): **PASS**
- `grep -rni supabase src/ prisma/ package.json .env.example`: **0**
- `console.log` / `console.debug` in `src/`: **0**
  (`console.warn` in `src/lib/rice.ts` is intentional server logging — kept.)

## Phase 1 — Problems found (numbered)

### TypeScript / build errors: 0
The project builds clean under its own (lenient) config. The stricter
diagnostic below is what the lenient config hides.

### Unused code — diagnostic count: 29
**U1–U24. `tsc --noUnusedLocals --noUnusedParameters` diagnostics (24):**
- `src/components/EmergencyNoticePopup.tsx:5` — `apiPatch`
- `src/components/ui/calendar.tsx:45,46` — `_props` (shadcn spread-omit
  pattern; intentionally NOT removed, see below)
- `src/stores/authStore.ts:30` — zustand `get` parameter
- `src/views/Chat.tsx:158` — `callPath` variable (built, never used;
  navigation uses `target` directly)
- `src/views/admin/Balance.tsx:5` — `apiPatch`, `apiDelete`
- `src/views/admin/Boarders.tsx:3` — `Wallet`
- `src/views/admin/MealRequests.tsx:6` — `apiDelete`
- `src/views/admin/Meals.tsx:7` — `format` (date-fns)
- `src/views/admin/MessDashboard.tsx:1,4,21` — whole `useEffect, useState`
  import, `apiPost`, `apiPatch`, `apiDelete`, `startOfMonth` variable
- `src/views/admin/MessProfile.tsx:5` — `apiPost`, `apiDelete`
- `src/views/admin/MonthlyBills.tsx:5` — `apiDelete`
- `src/views/admin/Reports.tsx:4` — `apiPost`, `apiPatch`, `apiDelete`
- `src/views/admin/RiceManagement.tsx:13` — `Minus`
- `src/views/boarder/MyBills.tsx:3` — `TrendingDown`
- `src/views/boarder/MyDashboard.tsx:5` — `UserIcon`

**U25–U29. Unused exports (grep-verified, 0 uses outside definition):**
- `src/lib/auth.ts` — `requireAuth`, `hasAnyRole`
- `src/lib/permissions.ts` — `canApproveBill` (`canApproveFine` IS used — kept)
- `src/lib/period.ts` — `daysInMonth`
- `src/lib/prisma-fields.ts` — `MODEL_BY_TABLE` (32-line table→model map;
  `clientProp()` does not use it — it lowercases the model name directly)

### Genuine bugs found: 1 fixed, 2 reported-not-fixed
- **B1 (FIXED). `src/lib/period.ts` — `periodRange` timezone shift.**
  It built local-midnight dates then took `toISOString().slice(0,10)`.
  In a +06 browser (Dhaka) that yields the *previous* UTC day, so the
  month filter in Deposits / Expenses / ExtraBills (string-compare
  against ISO datetimes) included the last day of the previous month and
  excluded the last day of the current month. Fixed by constructing the
  range in UTC (`Date.UTC`), matching `stats.monthRange` and the API's
  UTC date handling. No other caller changed: `currentPeriod` still uses
  local year/month (correct — it answers "which month is it here?").
- **B2 (REPORTED, NOT FIXED — needs an access-control decision).**
  `src/lib/api-server.ts` `listHandler` only checks `mess_id` when the
  caller supplies one. A direct API call with no `mess_id` returns rows
  from *all* messes for that model. The UI always passes `mess_id`, and
  some legitimate flows fetch without it (own-record lookups by
  `user_id`/`boarder_id`, super-admin views, expense-category defaults),
  so auto-scoping `listHandler` by the caller's mess would break those
  flows. Fixing this properly needs per-model scoping rules + live
  testing, not a cleanup edit — it is left untouched and flagged here.
- **B3 (REPORTED, NOT FIXED — robustness limitation).**
  `src/lib/stats.ts` `closeMonth` is not wrapped in a transaction: the
  period is upserted with `locked: true` and then boarder balances are
  updated one by one. A crash mid-loop would leave balances partially
  applied, and the locked guard would then return the period without
  re-applying. Normal-path arithmetic is unchanged and was not touched;
  a transactional refactor needs a live-DB test to verify safely.

### Open question (not a bug, not changed)
- **Q1.** `closeMonth` adjusts boarder `balance` by
  `deposits − meals × meal_rate` only; extra bills and fines enter the
  `MonthlyBills.payable` figure, not this balance. This matches the
  ported-SQL comment in the file, but it was not re-verified against the
  original SQL in this audit — verify before changing either side.

### Readability: 5 items
- **R1 (FIXED, comment only).** `src/lib/permissions.ts` header said
  "Bazar/meal PATCH/DELETE server gating is Phase 2" — that gating now
  exists in `api-server.ts` `writeGuard`; the header was updated.
- **R2 (FIXED, comment only).** `prisma/schema.prisma` header still said
  "TODO: verify relations … before prisma db push" — db push has
  already succeeded (2026-11-03 and 2026-11-04, see MIGRATION doc), so
  the TODO was replaced with a verified note. No schema field changed.
- **R3 (FIXED).** `api-server.ts` `checkMessAccess` had an
  `allowOwnProfile` parameter that no caller ever passed (always
  `false`); the parameter and its dead branch were removed. The function
  is internal to that file — no caller changed.
- **R4 (NOT REFACTORED, intentional).** `strict: false` /
  `noImplicitAny: false` and 152 `any` casts, concentrated in the
  generic API layer (`api-server.ts`, `prisma-fields.ts`, views using
  `apiGet<any[]>`). Typing that layer properly is a large refactor, not
  a cleanup, and would risk breaking 68 routes — left as-is, recorded
  here so it is a known choice, not an oversight.
- **R5 (NOT SPLIT).** Longest files: `src/components/ui/sidebar.tsx`
  (637 lines, shadcn UI), `src/views/admin/Meals.tsx` (469),
  `src/views/boarder/MyDashboard.tsx` (444),
  `src/lib/prisma-fields.ts` (362, generated field map). Splitting them
  would churn the diff for no behaviour gain — left as-is.
- Comments on the hard logic were already good: `stats.ts` (month
  close, bill generation, locked-month rule), `rice.ts` (deduction,
  edit delta, never-invent-a-row), `fines.ts` (no universal tariff).
  One clarifying comment was added with the B1 fix in `period.ts`.

## Phase 2 — Cleanup applied (safe only)
- Removed U1–U24 except the two `calendar.tsx` `_props` entries (shadcn
  spread-omit pattern — removing them would pass unknown props to the
  icon components; left intentionally).
- Removed U25–U29 (unused exports listed above).
- Fixed B1 (`period.ts` UTC range) and R1–R3 (comments / dead parameter).
- No formatter dependency added; no whole-repo reformat; only edited
  lines were touched. No API route, guard, role rule, or formula changed.

## Phase 2 — Intentionally NOT cleaned (with reasons)
- `calendar.tsx` `_props` — shadcn pattern, see above.
- B2, B3 — see "reported-not-fixed" above.
- R4, R5 — see above.
- `console.warn` in `rice.ts` — intentional server logging.
- `src/components/ui/*` (shadcn) — vendor-style UI code, left alone
  except where it intersected the unused-import list (calendar `_props`
  kept, as above).

## QA failures fixed inside this batch (from QA_REPORT.md, 2026-11-04)
These were confirmed by grep/code-reading during this audit and fixed here,
in addition to the cleanup above. No commit was made for them either.
- **T06 (FIXED).** `src/views/admin/MealRequests.tsx:87` called
  `apiPatch("meal_requests", …)` — route is `meal-requests`, so Approve /
  Reject 404'd. Changed to `"meal-requests"`. Re-scan of all `api*`
  string resources in `src/` found 0 other resources without a matching
  route (29 resources checked).
- **T26 (FIXED, and a doc correction).** The MIGRATION doc claimed both
  login copies showed an old-password note; grep proved neither did.
  The note is now actually present in both `src/views/Login.tsx:76` and
  `src/app/login/page.tsx:75`: old-system passwords could not be
  transferred, sign up again with the same mobile number.
- **T21 (FIXED).** Meal-entry DELETE previously went through the generic
  `deleteHandler` with no rice reversal. DELETE is now custom: it
  re-checks meal role + mess access, then runs the meal delete and the
  rice add-back (old → 0 via `adjustRiceForMealEdit`) in one
  `$transaction`, so a rice-write failure rolls the delete back too.
- **T20 (FIXED).** `src/lib/rice.ts` `applyRiceKgChange` now runs
  `stockTransactions.create` + `stocks.update` together in one Prisma
  `$transaction`, re-reading the stock row inside the transaction. A
  deduction that would drive quantity below zero is REJECTED (no log
  row, quantity unchanged, reason `insufficient rice stock…`) — never
  silently clamped. Add-backs cannot go negative and always pass. The
  DELETE path passes its transaction through to the same helper.
- **T34 (FIXED).** New `src/test/stats-rice-fines.test.ts` (14 tests,
  mocked Prisma — no live DB): locked-month close returns without
  re-applying, locked-month bill generation throws, unlocked close
  upserts locked, zero-meal rate is 0 (never NaN), rice create deducts
  meals × kg_per_meal, negative-stock deduction writes nothing, edit
  adjusts by delta only, delete reversal adds back as an "in"
  transaction, missing stock row invents nothing, kg_per_meal unset
  disables deduction, fine self-approval banned / other-approver allowed
  / no-permission denied, fine labels. Full suite: **15/15 PASS**
  (14 new + 1 pre-existing example).
- **Still open from QA, not fixed here:** T20's live reproduction and
  T21's live delete test remain BLOCKED (no live Neon credential saved;
  not attempted, not faked). T34's tests are mocked-Prisma, not live-DB
  proofs. B2/B3 above remain open for the same reason as before.

## Verification after cleanup
- `npx tsc -p tsconfig.app.json --noEmit`: **PASS, 0 errors**
- `npx tsc … --noUnusedLocals --noUnusedParameters` (diagnostic):
  **only the 2 intentional `calendar.tsx` `_props` entries remain**
  (was 24 before cleanup)
- `npm run build`: **PASS**
- `prisma validate` (placeholder env): **PASS**
- `npx vitest run`: **PASS 15/15** (2 files)
- `git status`: 24 files changed + `CODE_CLEANUP.md` (new) +
  `src/test/stats-rice-fines.test.ts` (new), all **uncommitted** on
  `prisma-neon-migration`, **NOT committed, NOT pushed** (push remains
  blocked on GitHub auth, per the original brief — not attempted here).
  No `.env` file exists or was created; no secret was saved or repeated.
