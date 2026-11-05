// Unit tests for the live join-request bug (2026-11-05): "Send join request"
// did nothing on the deployed site. Root cause was the B2 mess scoping:
// a user with no mess yet 403d on BOTH the duplicate-check list
// (GET /api/join-requests?user_id=self&mess_id=...&status=pending) and the
// create itself (POST /api/join-requests), and the list call was not wrapped
// in try/catch in Onboarding.tsx, so the 403 escaped with no toast at all.
// A second stacked bug: JoinRequests.status had no DB default and the client
// sends no status, so the create would also 400 even after the 403 was fixed.
// These tests pin the fixed rules with mocked auth + Prisma (no live DB):
// a user may list/create ONLY their own join requests for a mess they do
// not belong to yet; anyone else's rows, and every other model, stay 403.
// The client-side try/catch is covered by code review + tsc/build.
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  // u9 has no mess (onboarding), u1 belongs to mess1, u2 belongs to mess2.
  ctx: {
    userId: "u9",
    profile: { id: "u9", full_name: "N", phone: "01", email: "n@x", photo_url: null, mess_id: null },
    roles: [],
  } as any,
  joinRequests: [
    { id: "jr1", mess_id: "mess1", user_id: "u9", requested_name: "N", requested_phone: "01", status: "pending", rules_accepted: true },
    { id: "jr2", mess_id: "mess1", user_id: "u1", requested_name: "A", requested_phone: "02", status: "pending", rules_accepted: true },
  ],
  deposits: [{ id: "d1", mess_id: "mess1", amount: 100 }],
  created: null as any,
}));

function matchesWhere(where: any, row: any): boolean {
  if (!where || typeof where !== "object") return true;
  if (Array.isArray(where.AND)) return where.AND.every((w: any) => matchesWhere(w, row));
  if (Array.isArray(where.OR)) return where.OR.some((w: any) => matchesWhere(w, row));
  return Object.entries(where).every(([k, v]: [string, any]) => {
    if (v && typeof v === "object" && "in" in v) return (v.in as unknown[]).includes(row[k]);
    return row[k] === v;
  });
}

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }) },
}));
vi.mock("@/lib/auth", () => ({
  getAuthContext: vi.fn(async () => state.ctx),
  isSuperAdmin: (ctx: any) => (ctx?.roles ?? []).some((r: any) => r.role === "super_admin"),
  canAccessMess: (ctx: any, messId: string) =>
    (ctx?.roles ?? []).some((r: any) => r.role === "super_admin") ||
    [ctx?.profile?.mess_id, ...(ctx?.roles ?? []).map((r: any) => r.mess_id)].includes(messId),
  isMessAdminOf: () => false,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    joinRequests: {
      findMany: vi.fn(async (args: any) =>
        state.joinRequests.filter((r: any) => matchesWhere(args?.where, r))
      ),
      create: vi.fn(async (args: any) => {
        state.created = args?.data;
        return { id: "jr-new", created_at: new Date(), ...args?.data };
      }),
    },
    deposits: {
      findMany: vi.fn(async (args: any) =>
        state.deposits.filter((r: any) => matchesWhere(args?.where, r))
      ),
      create: vi.fn(async (args: any) => ({ id: "d-new", ...args?.data })),
    },
    messages: { findMany: vi.fn(async () => []) },
    notices: { findMany: vi.fn(async () => []) },
  },
}));

import { listHandler, createHandler } from "@/lib/api-server";

function setCtx(ctx: any) {
  state.ctx = ctx;
}
const messlessCtx = {
  userId: "u9",
  profile: { id: "u9", full_name: "N", phone: "01", email: "n@x", photo_url: null, mess_id: null },
  roles: [],
} as any;
const memberCtx = {
  userId: "u1",
  profile: { id: "u1", full_name: "A", phone: "01", email: "a@x", photo_url: null, mess_id: "mess1" },
  roles: [{ role: "mess_admin", mess_id: "mess1" }],
} as any;

beforeEach(() => {
  setCtx(messlessCtx);
  state.created = null;
});

describe("join-request list (onboarding duplicate check)", () => {
  it("messless user CAN list their OWN pending requests for the mess they want to join", async () => {
    const res: any = await listHandler(
      "JoinRequests",
      new URLSearchParams({ user_id: "u9", mess_id: "mess1", status: "pending" })
    );
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.id)).toEqual(["jr1"]);
  });

  it("messless user CANNOT list another user's requests for that mess", async () => {
    const res: any = await listHandler(
      "JoinRequests",
      new URLSearchParams({ user_id: "u1", mess_id: "mess1", status: "pending" })
    );
    expect(res.status).toBe(403);
  });

  it("B2 regression: messless user still CANNOT list another model by mess_id", async () => {
    const res: any = await listHandler(
      "Deposits",
      new URLSearchParams({ mess_id: "mess1" })
    );
    expect(res.status).toBe(403);
  });

  it("mess member can list their own mess's join requests", async () => {
    setCtx(memberCtx);
    const res: any = await listHandler(
      "JoinRequests",
      new URLSearchParams({ user_id: "u1", mess_id: "mess1", status: "pending" })
    );
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.id)).toEqual(["jr2"]);
  });
});

describe("join-request create", () => {
  it("messless user CAN create their own join request (201, status defaults to pending)", async () => {
    const res: any = await createHandler("JoinRequests", {
      mess_id: "mess1",
      user_id: "u9",
      requested_name: "N",
      requested_phone: "01",
      rules_accepted: true,
    });
    expect(res.status).toBe(201);
    expect(state.created.user_id).toBe("u9");
    expect(state.created.status).toBe("pending");
    expect(state.created.mess_id).toBe("mess1");
  });

  it("a spoofed user_id in the body is forced to the caller", async () => {
    const res: any = await createHandler("JoinRequests", {
      mess_id: "mess1",
      user_id: "u1",
      requested_name: "N",
      requested_phone: "01",
      rules_accepted: true,
    });
    expect(res.status).toBe(201);
    expect(state.created.user_id).toBe("u9");
  });

  it("B2 regression: messless user still CANNOT create other models for that mess", async () => {
    const res: any = await createHandler("Deposits", {
      mess_id: "mess1",
      amount: 100,
    });
    expect(res.status).toBe(403);
  });
});
