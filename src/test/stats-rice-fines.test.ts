// Unit tests for stats / rice / fines (QA T34).
// No live database: the Prisma client is mocked, so these tests pin the
// locking, rice-deduction, and self-approval rules in code, and fail if a
// refactor silently changes them. They do NOT test against Neon.
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  kgPerMeal: 0.1 as number | null,
  stockQty: 10,
  stockRows: [{ id: "stock1", name: "Rice", quantity: 10 }] as any[],
  locked: false,
}));

const txCreate = vi.hoisted(() => vi.fn(async () => ({ id: "txn1" })));
const txUpdate = vi.hoisted(() => vi.fn(async () => ({ id: "stock1" })));
const mealFindMany = vi.hoisted(() => vi.fn(async () => [] as any[]));
const billsUpsert = vi.hoisted(() => vi.fn(async () => ({ id: "bill1" })));
const periodUpsert = vi.hoisted(() =>
  vi.fn(async (args: any) => ({ id: "period1", ...args.create }))
);
// Shared by the top-level client and the $transaction client: closeMonth
// (B3) now runs entirely inside $transaction, so the tx object must
// expose the same delegates or the close tests would hit undefined.
const periodFindUnique = vi.hoisted(() =>
  vi.fn(async () => (state.locked ? { id: "p1", locked: true } : null))
);
const boardersFindMany = vi.hoisted(() => vi.fn(async () => [] as any[]));
const boardersFindUnique = vi.hoisted(() => vi.fn(async () => null));
const boardersUpdate = vi.hoisted(() => vi.fn(async (args: any) => ({ id: args.where.id })));
const expensesAggregate = vi.hoisted(() => vi.fn(async () => ({ _sum: { amount: 0 } })));
const depositsAggregate = vi.hoisted(() => vi.fn(async () => ({ _sum: { amount: 0 } })));
const extraFindMany = vi.hoisted(() => vi.fn(async () => [] as any[]));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    messSettings: {
      findUnique: vi.fn(async () => ({ kg_per_meal: state.kgPerMeal })),
    },
    stocks: {
      findMany: vi.fn(async () => state.stockRows),
      findUnique: vi.fn(async () => ({ id: "stock1", quantity: state.stockQty })),
      update: txUpdate,
    },
    stockTransactions: { create: txCreate },
    $transaction: vi.fn(async (cb: any) =>
      cb({
        stocks: {
          findMany: vi.fn(async () => state.stockRows),
          findUnique: vi.fn(async () => ({ id: "stock1", quantity: state.stockQty })),
          update: txUpdate,
        },
        stockTransactions: { create: txCreate },
        messSettings: {
          findUnique: vi.fn(async () => ({ kg_per_meal: state.kgPerMeal })),
        },
        mealEntries: { findMany: mealFindMany, delete: vi.fn(async () => ({ id: "meal1" })) },
        expenses: { aggregate: expensesAggregate },
        deposits: { aggregate: depositsAggregate },
        boarders: { findMany: boardersFindMany, findUnique: boardersFindUnique, update: boardersUpdate },
        extraBills: { findMany: extraFindMany },
        fines: { findMany: vi.fn(async () => [] as any[]) },
        monthlyPeriods: { findUnique: periodFindUnique, upsert: periodUpsert },
        monthlyBills: { upsert: billsUpsert },
      })
    ),
    mealEntries: { findMany: mealFindMany },
    expenses: { aggregate: expensesAggregate },
    deposits: { aggregate: depositsAggregate },
    boarders: { findMany: boardersFindMany, findUnique: boardersFindUnique, update: boardersUpdate },
    extraBills: { findMany: extraFindMany },
    fines: { findMany: vi.fn(async () => [] as any[]) },
    monthlyPeriods: {
      findUnique: periodFindUnique,
      upsert: periodUpsert,
    },
    monthlyBills: { upsert: billsUpsert },
  },
}));

import { closeMonth, generateMonthlyBills, getMonthStats } from "@/lib/stats";
import {
  deductRiceForMealEntry,
  adjustRiceForMealEdit,
} from "@/lib/rice";
import { canApproveFine } from "@/lib/permissions";
import { fineTypeLabel } from "@/lib/fines";

beforeEach(() => {
  vi.clearAllMocks();
  state.kgPerMeal = 0.1;
  state.stockQty = 10;
  state.stockRows = [{ id: "stock1", name: "Rice", quantity: 10 }];
  state.locked = false;
});

describe("stats locking (QA T34)", () => {
  it("closeMonth returns the locked period without re-applying balances", async () => {
    state.locked = true;
    const period = await closeMonth("mess1", 2026, 11, "user1");
    expect((period as any).locked).toBe(true);
    expect(mealFindMany).not.toHaveBeenCalled();
    expect(periodUpsert).not.toHaveBeenCalled();
  });

  it("generateMonthlyBills throws on a locked month instead of rewriting it", async () => {
    state.locked = true;
    await expect(generateMonthlyBills("mess1", 2026, 11, "user1")).rejects.toThrow(
      /locked/i
    );
    expect(billsUpsert).not.toHaveBeenCalled();
  });

  it("closeMonth on an unlocked, empty month upserts a locked period", async () => {
    const period: any = await closeMonth("mess1", 2026, 11, "user1");
    expect(periodUpsert).toHaveBeenCalled();
    expect(period.locked).toBe(true);
    expect(period.total_meals).toBe(0);
  });

  it("getMonthStats with no meals gives meal_rate 0, never NaN", async () => {
    const stats = await getMonthStats("mess1", 2026, 11);
    expect(stats.total_meals).toBe(0);
    expect(stats.meal_rate).toBe(0);
  });
});

describe("rice deduction (QA T20/T21)", () => {
  it("create deducts meals x kg_per_meal in one transaction", async () => {
    const r = await deductRiceForMealEntry({
      messId: "mess1",
      breakfast: 2,
      lunch: 2,
      dinner: 1,
      guest: 0,
      createdBy: "user1",
    });
    expect(r.deducted).toBe(true);
    expect(r.kgUsed).toBeCloseTo(0.5);
    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ txn_type: "out", quantity: 0.5 }) })
    );
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: 9.5 } })
    );
  });

  it("rejects a deduction that would drive stock negative, writing nothing", async () => {
    state.stockQty = 0.2;
    const r = await deductRiceForMealEntry({
      messId: "mess1",
      breakfast: 10,
      lunch: 0,
      dinner: 0,
      guest: 0,
    });
    expect(r.deducted).toBe(false);
    expect(r.reason).toMatch(/insufficient rice stock/i);
    expect(txCreate).not.toHaveBeenCalled();
    expect(txUpdate).not.toHaveBeenCalled();
  });

  it("edit adjusts by the meal delta only, never the full entry", async () => {
    const r = await adjustRiceForMealEdit({
      messId: "mess1",
      oldBreakfast: 2, oldLunch: 2, oldDinner: 1, oldGuest: 0,
      newBreakfast: 3, newLunch: 2, newDinner: 1, newGuest: 0,
    });
    expect(r.deducted).toBe(true);
    expect(r.kgUsed).toBeCloseTo(0.1);
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: 9.9 } })
    );
  });

  it("delete reversal (old -> 0) adds meals back as an 'in' transaction", async () => {
    const r = await adjustRiceForMealEdit({
      messId: "mess1",
      oldBreakfast: 2, oldLunch: 2, oldDinner: 1, oldGuest: 0,
      newBreakfast: 0, newLunch: 0, newDinner: 0, newGuest: 0,
    });
    expect(r.deducted).toBe(true);
    expect(r.kgUsed).toBeCloseTo(-0.5);
    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ txn_type: "in", quantity: 0.5 }) })
    );
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: 10.5 } })
    );
  });

  it("no rice stock row skips without inventing one", async () => {
    state.stockRows = [];
    const r = await deductRiceForMealEntry({
      messId: "mess1",
      breakfast: 1, lunch: 0, dinner: 0, guest: 0,
    });
    expect(r.deducted).toBe(false);
    expect(txCreate).not.toHaveBeenCalled();
  });

  it("kg_per_meal unset disables deduction", async () => {
    state.kgPerMeal = null;
    const r = await deductRiceForMealEntry({
      messId: "mess1",
      breakfast: 5, lunch: 0, dinner: 0, guest: 0,
    });
    expect(r.deducted).toBe(false);
  });
});

describe("fines self-approval ban (QA T34)", () => {
  it("a user cannot approve their own fine", () => {
    expect(canApproveFine(["fine_manager"], "user1", "user1")).toBe(false);
  });

  it("another approver with approve_fines can approve", () => {
    expect(canApproveFine(["fine_manager"], "user2", "user1")).toBe(true);
  });

  it("a user without approve_fines cannot approve someone else's fine", () => {
    expect(canApproveFine(["boarder"], "user2", "user1")).toBe(false);
  });

  it("fineTypeLabel returns the label, or the value itself when unknown", () => {
    expect(fineTypeLabel("late_payment")).toBe("Late payment of monthly bill");
    expect(fineTypeLabel("something_new")).toBe("something_new");
  });
});
