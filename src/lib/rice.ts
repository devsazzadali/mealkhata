// Rice auto-deduction, Phase 1.
// Rule: if MessSettings.kg_per_meal is set (kg per meal unit), a newly
// created meal entry deducts (breakfast + lunch + dinner + guest) * kg_per_meal
// kg from the mess's "rice" stock row, via a stock transaction.
// - kg_per_meal null / 0 = disabled, no deduction, no error.
// - No rice stock row = log + skip with a clear TODO, never invent a row.
// - Never hard-code a kg/meal figure: the mess manager sets kg_per_meal
//   in Settings from their own observed use. The legacy per-slot
//   rice_per_meal_* values stored in bank_info JSON are NOT used here,
//   so a meal is never deducted twice.
// - Meal-entry updates (PATCH) adjust rice by the meal delta (Phase 2,
//   adjustRiceForMealEdit); they never re-deduct the full entry.
// - Meal-entry deletes (DELETE) add the entry's meals back (T21, via the
//   same helper with new = 0), inside the delete handler's transaction.
// - T20: the two stock writes (stockTransactions.create + stocks.update)
//   always run together in one Prisma $transaction, re-reading the stock
//   row inside the transaction. A deduction that would drive quantity
//   below zero is REJECTED (no transaction row written, quantity
//   unchanged) — never silently clamped to zero.
import { prisma } from "@/lib/prisma";

export interface RiceDeductionResult {
  deducted: boolean;
  kgUsed: number;
  reason: string;
}

export async function deductRiceForMealEntry(args: {
  messId: string;
  breakfast: number;
  lunch: number;
  dinner: number;
  guest: number;
  createdBy?: string | null;
}): Promise<RiceDeductionResult> {
  const settings = await prisma.messSettings.findUnique({
    where: { mess_id: args.messId },
  });
  const kgPerMeal = settings?.kg_per_meal;
  if (kgPerMeal === null || kgPerMeal === undefined || Number(kgPerMeal) <= 0) {
    return { deducted: false, kgUsed: 0, reason: "kg_per_meal not set (auto rice deduction disabled)" };
  }
  const totalMeals = args.breakfast + args.lunch + args.dinner + args.guest;
  const kgUsed = totalMeals * Number(kgPerMeal);
  if (kgUsed <= 0) {
    return { deducted: false, kgUsed: 0, reason: "no meals in entry" };
  }
  return applyRiceKgChange({
    messId: args.messId,
    kgDelta: kgUsed,
    note: `Auto rice deduction: ${totalMeals} meals x ${kgPerMeal} kg/meal`,
    createdBy: args.createdBy,
  });
}

/** Apply a signed kg change to the rice stock row.
 * Positive kgDelta = deduction ("out"), negative = add-back ("in").
 * Never invents a stock row.
 * When `tx` is given (meal-entry DELETE), the caller owns the transaction
 * and the stock writes run on it; otherwise this function opens its own
 * $transaction (T20) so the log row and the quantity update commit or
 * roll back together. */
async function applyRiceKgChange(
  args: {
    messId: string;
    kgDelta: number;
    note: string;
    createdBy?: string | null;
  },
  tx?: any
): Promise<RiceDeductionResult> {
  const stocks = await (tx ?? prisma).stocks.findMany({ where: { mess_id: args.messId } });
  const rice = stocks.find((s: any) => String(s.name).trim().toLowerCase() === "rice");
  if (!rice) {
    console.warn(`[rice] No rice stock row for mess ${args.messId}; skipped rice change of ${args.kgDelta} kg`);
    return { deducted: false, kgUsed: 0, reason: "no rice stock row exists — create a 'rice' stock row first (TODO, not auto-created)" };
  }
  // Write the log row + quantity update as one unit. Re-reading the row
  // inside the transaction means two concurrent deductions cannot both
  // pass a stale quantity check. A deduction below zero is rejected, so
  // the caller can surface it instead of silently recording a negative
  // stock; add-backs (negative kgDelta) can never go negative.
  const write = async (db: any) => {
    const current = await db.stocks.findUnique({ where: { id: rice.id } });
    if (!current) return { ok: false, reason: "rice stock row disappeared" };
    const newQty = Number(current.quantity) - args.kgDelta;
    if (newQty < 0) {
      return {
        ok: false,
        reason: `insufficient rice stock: ${current.quantity} kg available, ${args.kgDelta} kg requested`,
      };
    }
    await db.stockTransactions.create({
      data: {
        mess_id: args.messId,
        stock_id: rice.id,
        txn_type: args.kgDelta >= 0 ? "out" : "in",
        quantity: Math.abs(args.kgDelta),
        notes: args.note,
        created_by: args.createdBy ?? null,
      },
    });
    await db.stocks.update({ where: { id: rice.id }, data: { quantity: newQty } });
    return { ok: true };
  };
  const outcome = tx ? await write(tx) : await prisma.$transaction((t: any) => write(t));
  if (!outcome.ok) return { deducted: false, kgUsed: 0, reason: outcome.reason };
  return { deducted: true, kgUsed: args.kgDelta, reason: `adjusted rice by ${-args.kgDelta} kg` };
}

/** Phase 2: when a meal entry is edited, adjust rice by the meal delta.
 * newMeals - oldMeals, times the mess's kg_per_meal (if set). A smaller
 * entry adds rice back; a larger entry deducts more. Zero delta = no-op. */
export async function adjustRiceForMealEdit(
  args: {
    messId: string;
    oldBreakfast: number;
    oldLunch: number;
    oldDinner: number;
    oldGuest: number;
    newBreakfast: number;
    newLunch: number;
    newDinner: number;
    newGuest: number;
    createdBy?: string | null;
  },
  tx?: any
): Promise<RiceDeductionResult> {
  const settings = await (tx ?? prisma).messSettings.findUnique({
    where: { mess_id: args.messId },
  });
  const kgPerMeal = settings?.kg_per_meal;
  if (kgPerMeal === null || kgPerMeal === undefined || Number(kgPerMeal) <= 0) {
    return { deducted: false, kgUsed: 0, reason: "kg_per_meal not set (auto rice deduction disabled)" };
  }
  const oldTotal = args.oldBreakfast + args.oldLunch + args.oldDinner + args.oldGuest;
  const newTotal = args.newBreakfast + args.newLunch + args.newDinner + args.newGuest;
  const deltaMeals = newTotal - oldTotal;
  if (deltaMeals === 0) {
    return { deducted: false, kgUsed: 0, reason: "meal count unchanged" };
  }
  return applyRiceKgChange(
    {
      messId: args.messId,
      kgDelta: deltaMeals * Number(kgPerMeal),
      note: `Rice adjustment on meal edit: ${oldTotal} -> ${newTotal} meals x ${kgPerMeal} kg/meal`,
      createdBy: args.createdBy,
    },
    tx
  );
}
