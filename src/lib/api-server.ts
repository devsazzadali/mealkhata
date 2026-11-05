// Server helpers for Prisma API routes.
// Replaces legacy backend PostgREST + RLS: every route checks the JWT session first,
// then checks mess access (profile.mess_id, a role mess_id, or super_admin).
// Query values are coerced using prisma-fields.ts (DateTime, Float, Boolean).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthContext,
  canAccessMess,
  isSuperAdmin,
  isMessAdminOf,
  type AuthContext,
} from "@/lib/auth";
import { PRISMA_FIELDS, clientProp } from "@/lib/prisma-fields";
import { canEditMeals, canEditBazar, canPerform, isReadOnlyMonitor, type AppRole } from "@/lib/permissions";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireCtx(): Promise<AuthContext | null> {
  try {
    return await getAuthContext();
  } catch {
    return null;
  }
}

/** Server-side write guard (Phase 2). UI gating alone is not a boundary.
 * Returns an error response, or null when the write is allowed. */
function writeGuard(ctx: AuthContext, model: string): ReturnType<typeof err> | null {
  const roles = ctx.roles.map((r) => r.role) as AppRole[];
  // mess_monitor with no write role: read-only for admin resources.
  if (isReadOnlyMonitor(roles) && !["Feedback", "Messages", "NoticeAcks"].includes(model)) {
    return err("Forbidden: mess_monitor is read-only", 403);
  }
  if (model === "MealEntries" && !canEditMeals(roles)) {
    return err("Forbidden: meal_manager / mess_admin required", 403);
  }
  if (model === "BazarSchedule" && !canEditBazar(roles)) {
    return err("Forbidden: bazar_manager / mess_admin required", 403);
  }
  if (model === "MonthlyPeriods" && !canPerform(roles, "close_month")) {
    return err("Forbidden: mess_admin required to change a month period", 403);
  }
  if (model === "MonthlyBills" && !canPerform(roles, "edit_money") && !canPerform(roles, "close_month")) {
    return err("Forbidden: fine_manager / mess_admin required to change a bill", 403);
  }
  return null;
}

function coerceValue(model: string, key: string, value: unknown): unknown {
  const type = PRISMA_FIELDS[model]?.[key];
  if (value === null || value === undefined) return value;
  if (!type) return value;
  const base = type.replace("?", "");
  if (base === "DateTime" && typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d;
  }
  if (base === "Float" && typeof value === "string" && value !== "") {
    const n = Number(value);
    return isNaN(n) ? value : n;
  }
  if (base === "Int" && typeof value === "string" && value !== "") {
    const n = Number(value);
    return isNaN(n) ? value : n;
  }
  if (base === "Boolean" && typeof value === "string") {
    return value === "true";
  }
  return value;
}

export function coerceBody(model: string, body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    // Never allow clients to set passwordHash directly via generic routes.
    if (model === "Profiles" && k === "passwordHash") continue;
    out[k] = coerceValue(model, k, v);
  }
  return out;
}

function stripSecrets(model: string, row: unknown) {
  if (model === "Profiles" && row && typeof row === "object") {
    const { passwordHash: _p, ...rest } = row as Record<string, unknown>;
    return rest;
  }
  return row;
}

function stripList(model: string, rows: unknown[]) {
  return rows.map((r) => stripSecrets(model, r));
}

// Callers that supply mess_id are checked against the caller's
// profile/roles above. Callers that do NOT supply one are scoped by
// messScopeFragment below (B2 re-test 2026-11-04) — previously such a
// list call returned rows from ALL messes for that model.
function checkMessAccess(
  ctx: AuthContext,
  messId: string | null | undefined
): boolean {
  if (!messId) return true;
  return canAccessMess(ctx, messId);
}

/** Mess ids the caller belongs to (profile + roles), de-duplicated. */
export function accessibleMessIds(ctx: AuthContext): string[] {
  return Array.from(
    new Set([ctx.profile.mess_id, ...ctx.roles.map((r) => r.mess_id)].filter(Boolean))
  ) as string[];
}

/** Parent-id where-fragment for models with no mess_id column (B2 residual).
 * Pure function (unit-tested in src/test/parent-scoping.test.ts).
 * MessageReads belong to a mess through their message; NoticeAcks through
 * their notice — so a list is restricted to parent rows of the caller's
 * own messes. Returns null for any other model. */
export function parentScopeFor(
  model: string,
  allowedParentIds: string[]
): Record<string, unknown> | null {
  if (model === "MessageReads") return { message_id: { in: allowedParentIds } };
  if (model === "NoticeAcks") return { notice_id: { in: allowedParentIds } };
  return null;
}

/** Parent ids a non-super caller may see for a mess-less model (B2 residual).
 * Returns null for super admins (exempt, no scoping) and for models that
 * are not MessageReads/NoticeAcks. Otherwise returns the ids of the
 * parent Messages/Notices in the caller's own messes — a per-record
 * ownership lookup, so a cross-mess row can never leak through a list.
 * Call sites are unaffected: Chat fetches all reads and filters them to
 * its own mess's messages in JS (still a subset of what it gets now),
 * and the emergency-notice popup fetches acks by user_id and filters
 * them to its own mess's emergency notices (also still a subset). */
export async function scopedParentIds(
  ctx: AuthContext,
  model: string
): Promise<string[] | null> {
  if (isSuperAdmin(ctx)) return null;
  if (model === "MessageReads") {
    const rows = await prisma.messages.findMany({
      where: { mess_id: { in: accessibleMessIds(ctx) } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
  if (model === "NoticeAcks") {
    const rows = await prisma.notices.findMany({
      where: { mess_id: { in: accessibleMessIds(ctx) } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
  return null;
}

/** Default mess scoping for list calls (B2).
 * Pure function (unit-tested in src/test/list-scoping.test.ts) so the
 * rule can be verified without a live DB.
 * Returns null when no extra scoping applies (super admin, a mess_id
 * filter already supplied and checked, or a model with no mess_id
 * column), { forbidden: true } when a non-super caller must not list
 * the model at all (Messes without an accessible id filter), or a
 * Prisma where-fragment to AND with the caller's filters.
 * - Models with a mess_id column: scoped to the caller's messes
 *   (profile.mess_id + role mess_ids). A caller belonging to no mess
 *   therefore sees nothing (except the cases below).
 * - ExpenseCategories: global defaults (mess_id null) are also kept,
 *   because the Expenses UI lists defaults together with own-mess rows.
 * - Profiles: the caller's own profile is always kept, so a user with
 *   no mess yet can still load their own profile.
 * - Models without a mess_id column: this function still returns null
 *   (it cannot do a DB lookup) — but listHandler now scopes
 *   MessageReads/NoticeAcks separately via scopedParentIds, so they
 *   are no longer an open residual. Any other mess-less model stays
 *   unscoped here. */
export function messScopeFragment(
  ctx: AuthContext,
  model: string,
  opts: { hasMessIdFilter: boolean; idFilter?: string | null }
): Record<string, unknown> | { forbidden: true } | null {
  if (isSuperAdmin(ctx) || opts.hasMessIdFilter) return null;
  if (model === "Messes") {
    // A mess id IS a mess identifier, so check it directly: every id in
    // the filter must be a mess the caller can access, and an unfiltered
    // messes list is super-admin-only (SuperMesses UI is super-gated).
    const ids = (opts.idFilter ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0 && ids.every((id) => canAccessMess(ctx, id))) return null;
    return { forbidden: true };
  }
  const fields = PRISMA_FIELDS[model];
  if (!fields || !("mess_id" in fields)) return null;
  const accessible = accessibleMessIds(ctx);
  if (model === "Profiles") {
    return { OR: [{ mess_id: { in: accessible } }, { id: ctx.userId }] };
  }
  if (model === "ExpenseCategories") {
    return { OR: [{ mess_id: { in: accessible } }, { mess_id: null }] };
  }
  return { mess_id: { in: accessible } };
}

/** GET list: ?mess_id=&boarder_id=&user_id=&status=&limit=&order=created_at.desc etc. */
export async function listHandler(
  model: string,
  search: URLSearchParams,
  opts: { allowSuperOnly?: boolean } = {}
) {
  const ctx = await requireCtx();
  if (!ctx) return err("Unauthorized", 401);
  if (opts.allowSuperOnly && !isSuperAdmin(ctx)) return err("Forbidden", 403);
  const messId = search.get("mess_id");
  if (messId && !checkMessAccess(ctx, messId)) return err("Forbidden", 403);
  const where: Record<string, unknown> = {};
  const skipKeys = new Set(["limit", "order", "ids"]);
  for (const [k, v] of search.entries()) {
    if (skipKeys.has(k)) continue;
    // Support comma-separated ids list for profiles lookup (chat senders).
    if (k === "id" && v.includes(",")) {
      where.id = { in: v.split(",").map((s) => s.trim()).filter(Boolean) };
      continue;
    }
    where[k] = coerceValue(model, k, v);
  }
  // B2: non-super callers without a mess_id filter are scoped to their
  // own messes by messScopeFragment (super admins see all, as before).
  const scope = messScopeFragment(ctx, model, { hasMessIdFilter: !!messId, idFilter: search.get("id") });
  if (scope && "forbidden" in scope) return err("Forbidden", 403);
  // B2 residual: MessageReads/NoticeAcks have no mess_id column, so they
  // are scoped here by their parent's mess (see scopedParentIds). The
  // parent lookup runs before the list query, so a cross-mess row can
  // never be returned, while the Chat and emergency-notice call sites
  // still receive every row they filter in JS (a subset of own-mess rows).
  const ands: unknown[] = [where];
  if (scope) ands.push(scope);
  const parentIds = await scopedParentIds(ctx, model);
  if (parentIds !== null) {
    const parentScope = parentScopeFor(model, parentIds);
    if (parentScope) ands.push(parentScope);
  }
  const finalWhere: Record<string, unknown> = ands.length > 1 ? { AND: ands } : where;
  const delegate = (prisma as unknown as Record<string, unknown>)[clientProp(model)] as {
    findMany: (args: unknown) => Promise<unknown[]>;
  };
  let orderBy: Record<string, string> | undefined;
  const order = search.get("order");
  if (order) {
    const [field, dir] = order.split(".");
    if (field) orderBy = { [field]: dir === "asc" ? "asc" : "desc" };
  }
  const limit = search.get("limit");
  const rows = await delegate.findMany({
    where: finalWhere,
    orderBy,
    take: limit ? Number(limit) : undefined,
  });
  return json(stripList(model, rows));
}

export async function createHandler(model: string, body: Record<string, unknown>) {
  const ctx = await requireCtx();
  if (!ctx) return err("Unauthorized", 401);
  const guard = writeGuard(ctx, model);
  if (guard) return guard;
  const messId = body.mess_id as string | undefined;
  if (messId && !canAccessMess(ctx, messId)) {
    // Creating a boarder/message/etc for a mess the caller does not belong
    // to is forbidden, unless the caller is a super admin (checked above).
    if (!isSuperAdmin(ctx)) return err("Forbidden", 403);
  }
  const delegate = (prisma as unknown as Record<string, unknown>)[clientProp(model)] as {
    create: (args: { data: unknown }) => Promise<unknown>;
  };
  try {
    const row = await delegate.create({ data: coerceBody(model, body) });
    return json(stripSecrets(model, row), 201);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Create failed", 400);
  }
}

export async function updateHandler(
  model: string,
  id: string,
  body: Record<string, unknown>,
  idField = "id"
) {
  const ctx = await requireCtx();
  if (!ctx) return err("Unauthorized", 401);
  const guard = writeGuard(ctx, model);
  if (guard) return guard;
  const delegate = (prisma as unknown as Record<string, unknown>)[clientProp(model)] as {
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
    update: (args: unknown) => Promise<unknown>;
  };
  const existing = await delegate.findUnique({ where: { [idField]: id } });
  if (!existing) return err("Not found", 404);
  const messId = (existing.mess_id as string | undefined) ?? (body.mess_id as string | undefined);
  if (messId && !canAccessMess(ctx, messId)) return err("Forbidden", 403);
  try {
    const row = await delegate.update({
      where: { [idField]: id },
      data: coerceBody(model, body),
    });
    return json(stripSecrets(model, row));
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Update failed", 400);
  }
}

export async function deleteHandler(model: string, id: string, idField = "id") {
  const ctx = await requireCtx();
  if (!ctx) return err("Unauthorized", 401);
  const guard = writeGuard(ctx, model);
  if (guard) return guard;
  const delegate = (prisma as unknown as Record<string, unknown>)[clientProp(model)] as {
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
    delete: (args: unknown) => Promise<unknown>;
  };
  const existing = await delegate.findUnique({ where: { [idField]: id } });
  if (!existing) return err("Not found", 404);
  const messId = existing.mess_id as string | undefined;
  if (messId && !canAccessMess(ctx, messId)) return err("Forbidden", 403);
  try {
    await delegate.delete({ where: { [idField]: id } });
    return json({ success: true });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Delete failed", 400);
  }
}

export { isMessAdminOf, isSuperAdmin };
