// Prisma replacements for the old RPCs, ported from the old migrations SQL.
// get_month_stats: total_meals = SUM(breakfast+lunch+dinner) in month,
//   total_expense = SUM(expenses.amount), total_deposit = SUM(deposits.amount),
//   meal_rate = total_expense / total_meals (0 when no meals).
// get_boarder_month_summary, close_month, generate_monthly_bills follow the
// same SQL logic, including extra-bill splits (equal / meal_ratio).
// Q1 (verified 2026-11-05 against the original SQL in git history, commit
// 966922c): the close_month balance formula (deposits - meals x rate) and
// the stats/summary queries match the original exactly. Two deliberate
// Prisma-era additions, not porting errors: (1) the `locked` flag + guard
// (the original had no locked column and would re-apply on re-close);
// (2) generateMonthlyBills adds approved fines to payable (the original
// SQL had no fines term). No formula was changed on a guess.
import { prisma } from "@/lib/prisma";

export function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

/** Fixed-bill key for the bill breakdown. Khala/bua bills are entered with
 * category "service" but titled "খালার বিল", so title wins over category.
 * Seat/flat rent stays "rent": "bosi bill" is ASSUMED to mean seat rent and
 * is therefore entered under the "rent" category, labelled in the UI as
 * "বাসা ভাড়া / সিট ভাড়া (বসি বিল)". This meaning is assumed pending the
 * owner's confirmation — no new bill type is invented for it. */
export function fixedBillKey(b: { category?: string | null; title: string }): string {
  const title = (b.title || "").toLowerCase();
  if (title.includes("খালা") || title.includes("khala") || title.includes("bua")) return "khala";
  return b.category || "other";
}

export type ExtraBillRow = {
  category: string | null;
  title: string;
  amount: number;
  split_method: string;
};

/** Per-boarder fixed-bill share, broken down by key. Sum of the returned
 * values equals the old single extra_share (equal total / heads +
 * meal-ratio total x boarder meals / total meals). */
export function extraShareByKey(
  rows: ExtraBillRow[],
  activeCount: number,
  boarderMeals: number,
  totalMeals: number
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const key = fixedBillKey(r);
    const share =
      r.split_method === "meal_ratio"
        ? totalMeals > 0
          ? r.amount * (boarderMeals / totalMeals)
          : 0
        : activeCount > 0
          ? r.amount / activeCount
          : 0;
    out[key] = (out[key] ?? 0) + share;
  }
  return out;
}

export async function getMonthStats(
  messId: string,
  year: number,
  month: number,
  db: any = prisma
) {
  const { start, end } = monthRange(year, month);
  const meals = await db.mealEntries.findMany({
    where: { mess_id: messId, meal_date: { gte: start, lt: end } },
    select: { breakfast: true, lunch: true, dinner: true },
  });
  const total_meals = meals.reduce(
    (s, m) => s + m.breakfast + m.lunch + m.dinner,
    0
  );
  const expenseAgg = await db.expenses.aggregate({
    where: { mess_id: messId, expense_date: { gte: start, lt: end } },
    _sum: { amount: true },
  });
  const depositAgg = await db.deposits.aggregate({
    where: { mess_id: messId, deposit_date: { gte: start, lt: end } },
    _sum: { amount: true },
  });
  const total_expense = expenseAgg._sum.amount ?? 0;
  const total_deposit = depositAgg._sum.amount ?? 0;
  const meal_rate = total_meals > 0 ? total_expense / total_meals : 0;
  return { total_meals, total_expense, total_deposit, meal_rate };
}

export async function getBoarderMonthSummary(
  messId: string,
  year: number,
  month: number,
  db: any = prisma
) {
  const { start, end } = monthRange(year, month);
  const boarders = await db.boarders.findMany({
    where: { mess_id: messId, status: "active" },
    select: { id: true, full_name: true },
  });
  const out = [];
  for (const b of boarders) {
    const meals = await db.mealEntries.findMany({
      where: { boarder_id: b.id, meal_date: { gte: start, lt: end } },
      select: { breakfast: true, lunch: true, dinner: true },
    });
    const deposits = await db.deposits.aggregate({
      where: { boarder_id: b.id, deposit_date: { gte: start, lt: end } },
      _sum: { amount: true },
    });
    out.push({
      boarder_id: b.id,
      full_name: b.full_name,
      meals: meals.reduce((s, m) => s + m.breakfast + m.lunch + m.dinner, 0),
      deposits: deposits._sum.amount ?? 0,
    });
  }
  return out;
}

export async function closeMonth(
  messId: string,
  year: number,
  month: number,
  closedBy: string
) {
  // B3: the whole close runs in ONE Prisma $transaction — the locked
  // period upsert and every per-boarder balance update commit or roll
  // back together, so a crash mid-loop can no longer leave partial
  // balances with the month already locked. Sequential re-close is
  // safe: the locked check below runs inside the same transaction and
  // returns the existing period without re-applying anything.
  // Residual (honest): under the default Read Committed isolation two
  // simultaneous closes could both pass the locked check before either
  // commits. That concurrent race needs row locking + a concurrency
  // test against a live DB; it is not fixed by this change.
  return prisma.$transaction(async (tx: any) => {
    const { start, end } = monthRange(year, month);
    // A locked month must never be closed twice: re-closing would apply the
    // (deposits - meals x rate) balance adjustment a second time.
    const existing = await tx.monthlyPeriods.findUnique({
      where: { mess_id_year_month: { mess_id: messId, year, month } },
    });
    if (existing && (existing as { locked?: boolean }).locked) {
      return existing;
    }
    const stats = await getMonthStats(messId, year, month, tx);
    const summary = await getBoarderMonthSummary(messId, year, month, tx);
    const extraRows = await tx.extraBills.findMany({
      where: { mess_id: messId, bill_date: { gte: start, lt: end } },
      select: { category: true, title: true, amount: true, split_method: true },
    });
    const fixedTotals: Record<string, number> = {};
    let extra_equal_total = 0;
    let extra_meal_total = 0;
    for (const r of extraRows) {
      const key = fixedBillKey(r);
      fixedTotals[key] = (fixedTotals[key] ?? 0) + r.amount;
      if (r.split_method === "meal_ratio") extra_meal_total += r.amount;
      else extra_equal_total += r.amount;
    }
    const audit = {
      bazar_total: stats.total_expense,
      total_meals: stats.total_meals,
      meal_rate: stats.meal_rate,
      total_deposit: stats.total_deposit,
      extra_equal_total,
      extra_meal_total,
      fixed_breakdown_totals: fixedTotals,
      active_boarders: summary.length,
      closed_by: closedBy,
    };
    const period = await tx.monthlyPeriods.upsert({
      where: { mess_id_year_month: { mess_id: messId, year, month } },
      create: {
        mess_id: messId,
        year,
        month,
        status: "closed",
        total_meals: stats.total_meals,
        total_expense: stats.total_expense,
        total_deposit: stats.total_deposit,
        meal_rate: stats.meal_rate,
        closed_at: new Date(),
        closed_by: closedBy,
        locked: true,
        audit: audit as never,
      },
      update: {
        status: "closed",
        total_meals: stats.total_meals,
        total_expense: stats.total_expense,
        total_deposit: stats.total_deposit,
        meal_rate: stats.meal_rate,
        closed_at: new Date(),
        closed_by: closedBy,
        locked: true,
        audit: audit as never,
      },
    });
    // Apply (deposits - meals * rate) to each boarder's running balance.
    for (const r of summary) {
      const boarder = await tx.boarders.findUnique({ where: { id: r.boarder_id } });
      if (!boarder) continue;
      await tx.boarders.update({
        where: { id: r.boarder_id },
        data: { balance: boarder.balance + (r.deposits - r.meals * stats.meal_rate) },
      });
    }
    return period;
  });
}

export async function generateMonthlyBills(
  messId: string,
  year: number,
  month: number,
  generatedBy: string
): Promise<number> {
  const { start, end } = monthRange(year, month);
  // Locked months are auditable history: regenerating would change their
  // totals. Unlock via monthly-periods PATCH (mess_admin / super_admin)
  // before regenerating — never silently rewrite a closed month.
  const period = await prisma.monthlyPeriods.findUnique({
    where: { mess_id_year_month: { mess_id: messId, year, month } },
  });
  if (period && (period as { locked?: boolean }).locked) {
    throw new Error("This month is locked. Unlock it from monthly-periods (mess_admin) before regenerating bills.");
  }
  const stats = await getMonthStats(messId, year, month);
  const extraRows = await prisma.extraBills.findMany({
    where: { mess_id: messId, bill_date: { gte: start, lt: end } },
    select: { category: true, title: true, amount: true, split_method: true },
  });
  const finesAgg = await prisma.fines.findMany({
    where: { mess_id: messId, year, month, status: "approved" },
    select: { boarder_id: true, amount: true },
  });
  const finesByBoarder = new Map<string, number>();
  for (const f of finesAgg) {
    finesByBoarder.set(f.boarder_id, (finesByBoarder.get(f.boarder_id) ?? 0) + f.amount);
  }
  const summary = await getBoarderMonthSummary(messId, year, month);
  const activeCount = summary.length;
  let count = 0;
  for (const r of summary) {
    const meal_cost = r.meals * stats.meal_rate;
    const fixed_breakdown = extraShareByKey(extraRows, activeCount, r.meals, stats.total_meals);
    const extra_share = Object.values(fixed_breakdown).reduce((s, v) => s + v, 0);
    const fine_total = finesByBoarder.get(r.boarder_id) ?? 0;
    const payable = meal_cost + extra_share + fine_total - r.deposits;
    const details = {
      fines: fine_total,
      extra_share,
      meal_cost,
      bazar_total: stats.total_expense,
      total_meals: stats.total_meals,
      meal_rate: stats.meal_rate,
      total_deposit: r.deposits,
      fixed_breakdown,
    };
    await prisma.monthlyBills.upsert({
      where: {
        mess_id_boarder_id_year_month: {
          mess_id: messId,
          boarder_id: r.boarder_id,
          year,
          month,
        },
      },
      create: {
        mess_id: messId,
        boarder_id: r.boarder_id,
        year,
        month,
        total_meals: r.meals,
        meal_rate: stats.meal_rate,
        meal_cost,
        extra_share,
        total_deposit: r.deposits,
        payable,
        details: details as never,
        paid: 0,
        status: "unpaid",
        generated_by: generatedBy,
      },
      update: {
        total_meals: r.meals,
        meal_rate: stats.meal_rate,
        meal_cost,
        extra_share,
        total_deposit: r.deposits,
        payable,
        details: details as never,
      },
    });
    count += 1;
  }
  return count;
}
