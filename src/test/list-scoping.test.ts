// Unit tests for default list mess-scoping (QA B2, re-test 2026-11-04).
// Pure function only — no live database, no HTTP. These tests pin the
// rule that a non-super list call with no mess_id filter must NOT return
// rows from all messes, and fail if a refactor silently drops the scope.
import { describe, it, expect, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { messScopeFragment } from "@/lib/api-server";
import { periodRange } from "@/lib/period";
import type { AuthContext } from "@/lib/auth";

const ctx = {
  userId: "u1",
  profile: { id: "u1", full_name: "A", phone: "01", email: "a@x", photo_url: null, mess_id: "mess1" },
  roles: [{ role: "mess_admin", mess_id: "mess1" }],
} as unknown as AuthContext;

const superCtx = {
  userId: "admin",
  profile: { id: "admin", full_name: "S", phone: "01", email: "s@x", photo_url: null, mess_id: null },
  roles: [{ role: "super_admin", mess_id: null }],
} as unknown as AuthContext;

const messlessCtx = {
  userId: "u9",
  profile: { id: "u9", full_name: "N", phone: "01", email: "n@x", photo_url: null, mess_id: null },
  roles: [],
} as unknown as AuthContext;

describe("messScopeFragment (QA B2)", () => {
  it("super admin is not scoped", () => {
    expect(messScopeFragment(superCtx, "Deposits", { hasMessIdFilter: false })).toBeNull();
  });
  it("a supplied mess_id filter is not re-scoped", () => {
    expect(messScopeFragment(ctx, "Deposits", { hasMessIdFilter: true })).toBeNull();
  });
  it("a mess_id model is scoped to the caller's messes", () => {
    expect(messScopeFragment(ctx, "Deposits", { hasMessIdFilter: false })).toEqual({
      mess_id: { in: ["mess1"] },
    });
  });
  it("expense categories keep global defaults (mess_id null)", () => {
    expect(messScopeFragment(ctx, "ExpenseCategories", { hasMessIdFilter: false })).toEqual({
      OR: [{ mess_id: { in: ["mess1"] } }, { mess_id: null }],
    });
  });
  it("profiles always keep the caller's own profile", () => {
    expect(messScopeFragment(ctx, "Profiles", { hasMessIdFilter: false })).toEqual({
      OR: [{ mess_id: { in: ["mess1"] } }, { id: "u1" }],
    });
  });
  it("a caller belonging to no mess sees no mess_id rows", () => {
    expect(messScopeFragment(messlessCtx, "Deposits", { hasMessIdFilter: false })).toEqual({
      mess_id: { in: [] },
    });
  });
  it("messes list without an accessible id is forbidden for non-super", () => {
    expect(messScopeFragment(ctx, "Messes", { hasMessIdFilter: false, idFilter: null })).toEqual({
      forbidden: true,
    });
    expect(messScopeFragment(ctx, "Messes", { hasMessIdFilter: false, idFilter: "other-mess" })).toEqual({
      forbidden: true,
    });
  });
  it("messes list with the caller's own mess id is allowed", () => {
    expect(messScopeFragment(ctx, "Messes", { hasMessIdFilter: false, idFilter: "mess1" })).toBeNull();
  });
  it("models without a mess_id column are not scoped by this pure function (listHandler scopes MessageReads/NoticeAcks separately via scopedParentIds — see parent-scoping.test.ts)", () => {
    expect(messScopeFragment(ctx, "MessageReads", { hasMessIdFilter: false })).toBeNull();
    expect(messScopeFragment(ctx, "NoticeAcks", { hasMessIdFilter: false })).toBeNull();
  });
});

describe("periodRange (QA B1, timezone)", () => {
  it("November 2026 is 2026-11-01 to 2026-12-01 (run under TZ=Asia/Dhaka too)", () => {
    expect(periodRange(2026, 11)).toEqual({ start: "2026-11-01", end: "2026-12-01" });
  });
  it("February handles the year boundary", () => {
    expect(periodRange(2026, 1)).toEqual({ start: "2026-01-01", end: "2026-02-01" });
    expect(periodRange(2026, 12)).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });
});
