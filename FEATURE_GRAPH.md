# Feature graph — mealkhata-dashboard vs mess-management research

Source research: `~/workspace/research_notes/mess-management-software-research-20261102-1845/report.md`
and the built research page `mess-management-software-research` (Bangla blueprint).
Branch: `prisma-neon-migration`. Neon DB is NOT connected yet — all new work below is
code + Prisma schema only, no `prisma db push`, no push to GitHub without user approval.

## Core formula (from research, confirmed by existing code)
Meal rate = Total bazar ÷ Total meal units
Member bill = meals × rate + fixed-cost share (rent, utilities, cook salary) + extras + fines − deposits − bazar fronted

## Already present in this repo
Meals / meal entries / meal requests, deposits, expenses / expense categories, extra bills,
monthly bills / monthly periods, bazar schedule, stocks / stock transactions, rice management,
daily menus, rooms, boarders, mess profile / mess settings, notices / notice acks,
messages / message reads, join requests, events, feedback, gallery, advertisements,
reports, chat, profile, super-admin mess list.

## Gaps found by comparing research to the repo (2026-11-03)
1. **No fine engine at all** — no Fines model, no fine catalogue, no configurable fine rules.
   ExtraBills is generic and is not a fine ledger. Research fines to support (configurable,
   never a universal BD tariff): late meal-off (meal still charged), late payment,
   missed bazar/cooking duty, leaving without notice, damage at cost, noise/misconduct,
   missing meeting. Each fine needs: type, basis, amount/rate, boarder, month, status,
   approved-by, and inclusion in the monthly bill.
2. **Roles are only 3** — `super_admin, mess_admin, boarder`. Research asks for 7 distinct
   roles with separation of duties and self-approval bans:
   Owner / Super Admin, Mess Manager / Mess Admin, Meal Manager, Bazar Manager,
   Fine / Accounts Manager, Mess Monitor (view + report, no money edits), Boarder.
   Existing apps only have 2–3 roles; this is a differentiator, not a copy.
3. **Rice stock auto-deduction is not configurable** — RiceManagement / Stocks exist,
   but there is no `kg_per_meal` setting in MessSettings and no automatic stock
   transaction when meals are entered. Research found no small-mess app does true
   per-meal auto-deduction, so this must be a mess-level configurable setting,
   never a hard-coded kg figure (no authoritative kg/meal figure was found).
4. **Guardian-aware onboarding is partial** — Boarders already have guardian_name/phone,
   but no local guardian, NID / student ID, rules-acceptance, or onboarding checklist.
   JoinRequests also lack those fields.
5. **Month close is not locked/auditable** — MonthlyPeriods + close-month stats exist,
   but there is no explicit locked flag + audit trail showing how a bill was calculated
   (bazar total, meal total, rate, fixed share, extras, fines, deposits).
6. **Money is recorded, not moved** — consistent with research: no tool moves money via
   a payment gateway for member bills. Keep this: record cash / bKash / Nagad / bank
   only, never claim gateway payments. Do NOT invent payment credentials.

## Role–permission matrix (target, Phase 1–2)
- Owner / Super Admin: all messes, create mess, assign mess admin, view all, cannot
  approve their own fines/bills.
- Mess Manager / Admin: own mess — boarders, rooms, settings, notices, bills, close month.
- Meal Manager: meal entries, meal on/off, guest meals, daily menu. No money edits.
- Bazar Manager: bazar schedule, bazar expenses, receipts. No bill closing.
- Fine / Accounts Manager: fines, deposits, expenses, extra bills, reports. Cannot
  approve their own fine.
- Mess Monitor: read-only dashboard, reports, feedback, notices. No creates/edits/deletes.
- Boarder: own meals, own bills, own deposits, bazar duty view, chat, feedback, notices.

## Member onboarding / offboarding (target)
Join: full name, photo, phone, NID / student ID, guardian name + phone, local guardian
name + phone, room / seat, monthly deposit, seat rent, rules acceptance, start date.
Leave: notice date, final meal count, final bill, deposit refund / adjustment, seat release,
status change to `left` (never delete history).

## Development phases (Neon-ready, DB test still pending)
- Phase 1 (DONE in code, 2026-11-03, Neon test still pending): Fines model + API + admin UI + bill inclusion;
  role enum expansion + permission helper + UI gating; `kg_per_meal` setting +
  auto stock transaction on meal entry; guardian/local-guardian/NID fields.
- Phase 2 (DONE in code, 2026-11-03, Neon test still pending): bill catalogue
  (cleaner, garbage, generator/fuel, maintenance fund, feast fund; water in
  auto-bill + Settings recurring water field); monthly bill fixed-breakdown
  (khala, rent, electricity, gas, wifi, water, service, other) with total
  payable unchanged; server-side role gating for meal PATCH/DELETE and all
  bazar routes + mess_monitor read-only (server + sidebar + ExtraBills/
  MonthlyBills UI); rice delta adjustment on meal PATCH; MonthlyPeriods
  locked flag + bill/period audit breakdown (re-close of a locked month no
  longer double-applies balances; regenerating a locked month returns 423
  until a mess_admin unlocks it); onboarding checklist view + rules_accepted
  hard blocker for create-boarder and join-approval (old pending requests
  without rules_accepted must be rejected + re-applied); redundant schema
  casts removed (dynamic-model delegate + password-strip casts remain, as
  they are not schema casts).
- Phase 2 still open: monitor read-only on other /app admin pages is enforced
  by sidebar + server write guard, but individual admin views (Boarders,
  Settings, etc.) still render their create/edit buttons for a monitor who
  navigates directly by URL — the server will reject the write with 403,
  but the buttons are not hidden everywhere yet.
- Phase 3 (only after Neon URL arrives): `prisma validate`, `prisma generate`,
  `prisma db push`, smoke test signup → login → mess → boarder → meal → bazar →
  rice → fine → bill → close month → chat + upload, then push only after approval.

## Bill catalogue checked 2026-11-03 (user: khala bill, bosi bill, etc.)
Already in ExtraBills UI + auto-bill from MessSettings recurring:
- Khala / bua bill (cook/maid salary) — category service, split equal, auto-bill
- Electricity, gas, Wi-Fi, water — categories electricity/gas/wifi/water
- House rent / seat rent — category rent; seat rent can also differ by room/seat
- Service charge — category service
- Meal bill — meal cost from bazar total ÷ meals
- Bazar bill — expenses / bazar, NOT a fixed bill, goes into meal rate
- Deposits, extra bills, fines — already in monthly bill: meal_cost + extra_share + fine_total − deposits

Missing / to add in Phase 2 (do not invent amounts):
- Cleaner, garbage, generator/fuel, maintenance fund, feast fund — add as extra-bill
  categories, split equal by default
- Water in auto-bill (currently auto-bill only does khala, electricity, wifi, gas)
- Monthly bill breakdown: show each fixed bill (khala, rent, electricity, etc.)
  separately in the bill details, not only a single extra_share total
- Seat rent as its own bill section vs flat rent, with pro-rating for mid-month
  join/leave, where the mess policy is stated on the bill

Clarification still needed: "bosi bill" — if this means seat rent / flat rent, it is
already covered as rent; if it means something else, the user needs to name it.
