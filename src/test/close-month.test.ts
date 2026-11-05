// Unit tests for transactional closeMonth (B3).
// No live database: the Prisma client is mocked with in-memory state, and
// the mocked $transaction snapshots that state and restores it when the
// callback throws — the same rollback a real database transaction gives.
// These tests pin: (a) a failure mid-loop rolls the period + balances
// back, (b) re-closing a locked month never re-applies balances,
// (c) a successful close applies deposits - meals x rate exactly once.
// They do NOT prove the live-DB behaviour — that still needs a live
// Neon run (see QA_REPORT.md BLOCKED items).
import { describe, it, expect, vi, beforeEach } from "vitest";

type BoarderState = { id: string; balance: number };

const state = vi.hoisted(() => ({
  // Two active boarders. Meal rate in this fixture is 100 (expense 1000
  // over 10 meals): b1 has 6 meals + 500 deposit -> +500 - 600 = -100;
  // b2 has 4 meals + 100 deposit -> +100 - 400 = -300.
  boarders: [
    { id: "b1", balance: 1000 },
    { id: "b2", balance: 2000 },
  ] as BoarderState[],
  mealsByBoarder: { b1: 6, b2: 4 } as Record<string, number>,
  depositsByBoarder: { b1: 500, b2: 100 } as Record<string, number>,
  locked: false,
  periodCreated: false,
  // When set, boarders.update throws for this boarder id, simulating a
  // crash mid-loop (after the period upsert and the first update).
  failOnBoarderUpdate: null as string | null,
}));

const mealsFor = (boarderId: string, total: number) => {
  const n = boarderId ? state.mealsByBoarder[boarderId] ?? 0 : total;
  return Array.from({ length: n }, () => ({ breakfast: 1, lunch: 0, dinner: 0 }));
};

vi.mock("@/lib/prisma", () => {
  const findPeriod = async () =>
    state.locked || state.periodCreated
      ? { id: "p1", locked: true, mess_id: "mess1", year: 2026, month: 11 }
      : null;
  const txClient: any = {
    mealEntries: {
      findMany: vi.fn(async (args: any) => {
        if (args.where?.boarder_id) return mealsFor(args.where.boarder_id, 0);
        return mealsFor("", 10);
      }),
    },
    expenses: { aggregate: vi.fn(async () => ({ _sum: { amount: 1000 } })) },
    deposits: {
      aggregate: vi.fn(async (args: any) => ({
        _sum: { amount: args.where?.boarder_id ? state.depositsByBoarder[args.where.boarder_id] ?? 0 : 600 },
      })),
    },
    boarders: {
      findMany: vi.fn(async () => state.boarders.map((b) => ({ id: b.id, full_name: b.id }))),
      findUnique: vi.fn(async (args: any) => state.boarders.find((b) => b.id === args.where.id) ?? null),
      update: vi.fn(async (args: any) => {
        if (state.failOnBoarderUpdate === args.where.id) {
          throw new Error("simulated crash mid-loop");
        }
        const b = state.boarders.find((x) => x.id === args.where.id);
        if (b) b.balance = args.data.balance;
        return { ...b };
      }),
    },
    extraBills: { findMany: vi.fn(async () => [] as any[]) },
    monthlyPeriods: {
      findUnique: findPeriod,
      upsert: vi.fn(async (args: any) => {
        state.periodCreated = true;
        state.locked = true;
        return { id: "p1", ...args.create };
      }),
    },
  };
  return {
    prisma: {
      ...txClient,
      $transaction: vi.fn(async (cb: any) => {
        // Snapshot + restore on throw = the rollback a real transaction gives.
        const snapshot = JSON.parse(JSON.stringify(state));
        try {
          return await cb(txClient);
        } catch (e) {
          Object.assign(state, snapshot);
          throw e;
        }
      }),
    },
  };
});

import { closeMonth } from "@/lib/stats";

beforeEach(() => {
  vi.clearAllMocks();
  state.boarders = [
    { id: "b1", balance: 1000 },
    { id: "b2", balance: 2000 },
  ];
  state.locked = false;
  state.periodCreated = false;
  state.failOnBoarderUpdate = null;
});

describe("closeMonth is transactional (B3)", () => {
  it("a successful close applies deposits - meals x rate once and locks the period", async () => {
    const period: any = await closeMonth("mess1", 2026, 11, "user1");
    expect(period.locked).toBe(true);
    // meal_rate = 1000 / 10 = 100; b1: 1000 + (500 - 6*100) = 900; b2: 2000 + (100 - 4*100) = 1700.
    expect(state.boarders.find((b) => b.id === "b1")!.balance).toBe(900);
    expect(state.boarders.find((b) => b.id === "b2")!.balance).toBe(1700);
  });

  it("a failure mid-loop rolls back the period and all balances", async () => {
    state.failOnBoarderUpdate = "b2";
    await expect(closeMonth("mess1", 2026, 11, "user1")).rejects.toThrow(
      /simulated crash/
    );
    // Rollback: no locked period, and b1's already-applied update is undone.
    expect(state.periodCreated).toBe(false);
    expect(state.locked).toBe(false);
    expect(state.boarders.find((b) => b.id === "b1")!.balance).toBe(1000);
    expect(state.boarders.find((b) => b.id === "b2")!.balance).toBe(2000);
  });

  it("re-closing a locked month returns the existing period without re-applying balances", async () => {
    await closeMonth("mess1", 2026, 11, "user1");
    expect(state.boarders.find((b) => b.id === "b1")!.balance).toBe(900);
    const again: any = await closeMonth("mess1", 2026, 11, "user1");
    expect(again.locked).toBe(true);
    // Balances applied exactly once, not twice.
    expect(state.boarders.find((b) => b.id === "b1")!.balance).toBe(900);
    expect(state.boarders.find((b) => b.id === "b2")!.balance).toBe(1700);
  });
});
