// Unit tests for the B2 residual fix: MessageReads and NoticeAcks have no
// mess_id column, so listHandler scopes them by their parent's mess
// (Messages / Notices) instead of returning rows from all messes.
// No live database: auth and Prisma are mocked. These tests pin that a
// cross-mess row can never leak through a list, and that the Chat
// (read receipts filtered in JS) and emergency-notice popup (acks by
// user_id) call sites still receive every own-mess row they need.
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  ctx: {
    userId: "u1",
    profile: { id: "u1", full_name: "A", phone: "01", email: "a@x", photo_url: null, mess_id: "mess1" },
    roles: [{ role: "mess_admin", mess_id: "mess1" }],
  } as any,
  messages: [
    { id: "m1", mess_id: "mess1" },
    { id: "m2", mess_id: "mess2" },
  ],
  notices: [
    { id: "n1", mess_id: "mess1" },
    { id: "n2", mess_id: "mess2" },
  ],
  reads: [
    { message_id: "m1", user_id: "u1", read_at: new Date() },
    { message_id: "m1", user_id: "u2", read_at: new Date() },
    { message_id: "m2", user_id: "u2", read_at: new Date() },
  ],
  acks: [
    { id: "a1", notice_id: "n1", user_id: "u1", acked_at: new Date() },
    { id: "a2", notice_id: "n2", user_id: "u2", acked_at: new Date() },
  ],
  capturedReadsWhere: null as any,
  capturedAcksWhere: null as any,
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
    messages: {
      findMany: vi.fn(async (args: any) =>
        state.messages.filter((m: any) => matchesWhere(args?.where, m))
      ),
    },
    notices: {
      findMany: vi.fn(async (args: any) =>
        state.notices.filter((n: any) => matchesWhere(args?.where, n))
      ),
    },
    messageReads: {
      findMany: vi.fn(async (args: any) => {
        state.capturedReadsWhere = args?.where;
        return state.reads.filter((r: any) => matchesWhere(args?.where, r));
      }),
    },
    noticeAcks: {
      findMany: vi.fn(async (args: any) => {
        state.capturedAcksWhere = args?.where;
        return state.acks.filter((a: any) => matchesWhere(args?.where, a));
      }),
    },
  },
}));

import { listHandler, parentScopeFor, scopedParentIds } from "@/lib/api-server";

const mess1Ctx = () =>
  ({
    userId: "u1",
    profile: { id: "u1", full_name: "A", phone: "01", email: "a@x", photo_url: null, mess_id: "mess1" },
    roles: [{ role: "mess_admin", mess_id: "mess1" }],
  } as any);
const superCtx = () =>
  ({
    userId: "admin",
    profile: { id: "admin", full_name: "S", phone: "01", email: "s@x", photo_url: null, mess_id: null },
    roles: [{ role: "super_admin", mess_id: null }],
  } as any);
const messlessCtx = () =>
  ({
    userId: "u9",
    profile: { id: "u9", full_name: "N", phone: "01", email: "n@x", photo_url: null, mess_id: null },
    roles: [],
  } as any);

beforeEach(() => {
  vi.clearAllMocks();
  state.ctx = mess1Ctx();
  state.capturedReadsWhere = null;
  state.capturedAcksWhere = null;
});

describe("parentScopeFor / scopedParentIds (B2 residual)", () => {
  it("returns the parent-id fragment for MessageReads and NoticeAcks only", () => {
    expect(parentScopeFor("MessageReads", ["m1"])).toEqual({ message_id: { in: ["m1"] } });
    expect(parentScopeFor("NoticeAcks", ["n1"])).toEqual({ notice_id: { in: ["n1"] } });
    expect(parentScopeFor("Deposits", ["x"])).toBeNull();
  });

  it("scopedParentIds returns only own-mess parent ids, null for super admin", async () => {
    expect(await scopedParentIds(mess1Ctx(), "MessageReads")).toEqual(["m1"]);
    expect(await scopedParentIds(mess1Ctx(), "NoticeAcks")).toEqual(["n1"]);
    expect(await scopedParentIds(superCtx(), "MessageReads")).toBeNull();
    expect(await scopedParentIds(mess1Ctx(), "Deposits")).toBeNull();
  });

  it("a messless caller gets an empty parent list", async () => {
    expect(await scopedParentIds(messlessCtx(), "MessageReads")).toEqual([]);
  });
});

describe("listHandler parent scoping (B2 residual)", () => {
  it("message-reads list never returns a cross-mess read", async () => {
    const res: any = await listHandler("MessageReads", new URLSearchParams());
    expect(res.status).toBe(200);
    expect((res.body as any[]).map((r: any) => r.message_id)).toEqual(["m1", "m1"]);
    // The query itself was already restricted to own-mess messages.
    expect(JSON.stringify(state.capturedReadsWhere)).toContain('"m1"');
    expect(JSON.stringify(state.capturedReadsWhere)).not.toContain('"m2"');
  });

  it("Chat still receives every read of its own mess's messages", async () => {
    const res: any = await listHandler("MessageReads", new URLSearchParams());
    // Both readers of m1 are present, so the JS filter in Chat.tsx keeps working.
    expect((res.body as any[]).filter((r: any) => r.message_id === "m1")).toHaveLength(2);
  });

  it("notice-acks list with a user_id filter keeps only own-mess acks", async () => {
    const res: any = await listHandler("NoticeAcks", new URLSearchParams({ user_id: "u1" }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ id: "a1", notice_id: "n1" })]);
    expect(JSON.stringify(state.capturedAcksWhere)).toContain('"n1"');
    expect(JSON.stringify(state.capturedAcksWhere)).not.toContain('"n2"');
  });

  it("super admin lists are not parent-scoped", async () => {
    state.ctx = superCtx();
    const res: any = await listHandler("MessageReads", new URLSearchParams());
    expect((res.body as any[]).map((r: any) => r.message_id).sort()).toEqual(["m1", "m1", "m2"]);
  });

  it("a messless caller lists nothing", async () => {
    state.ctx = messlessCtx();
    const res: any = await listHandler("MessageReads", new URLSearchParams());
    expect(res.body).toEqual([]);
  });
});
