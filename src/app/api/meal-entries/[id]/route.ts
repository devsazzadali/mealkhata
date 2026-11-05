import { NextRequest } from "next/server";
import { json, err, requireCtx, coerceBody } from "@/lib/api-server";
import { prisma } from "@/lib/prisma";
import { canAccessMess } from "@/lib/auth";
import { canEditMeals, type AppRole } from "@/lib/permissions";
import { adjustRiceForMealEdit } from "@/lib/rice";

// PATCH is custom (not the generic updateHandler) so the rice stock can be
// adjusted by the meal delta, and so meal role is enforced server-side.
// DELETE is custom for the same reason: deleting an entry must add its
// meals back to the rice stock (old -> 0 delta), otherwise the stock
// drifts low after every delete. The generic deleteHandler cannot do that,
// so this handler re-checks the same meal role + mess access first and
// runs the delete + rice add-back in one $transaction (T20/T21).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  if (!ctx) return err("Unauthorized", 401);
  const roles = ctx.roles.map((r) => r.role) as AppRole[];
  if (!canEditMeals(roles)) return err("Forbidden: meal_manager / mess_admin required", 403);
  const existing = await prisma.mealEntries.findUnique({ where: { id } });
  if (!existing) return err("Not found", 404);
  if (!canAccessMess(ctx, existing.mess_id)) return err("Forbidden", 403);
  const body = await req.json();
  const data = coerceBody("MealEntries", body) as Record<string, unknown>;
  try {
    const row = await prisma.mealEntries.update({ where: { id }, data: data as never });
    const r = row as unknown as { breakfast: number; lunch: number; dinner: number; guest: number };
    const e = existing as unknown as { breakfast: number; lunch: number; dinner: number; guest: number };
    const rice = await adjustRiceForMealEdit({
      messId: existing.mess_id,
      oldBreakfast: Number(e.breakfast ?? 0),
      oldLunch: Number(e.lunch ?? 0),
      oldDinner: Number(e.dinner ?? 0),
      oldGuest: Number(e.guest ?? 0),
      newBreakfast: Number(r.breakfast ?? 0),
      newLunch: Number(r.lunch ?? 0),
      newDinner: Number(r.dinner ?? 0),
      newGuest: Number(r.guest ?? 0),
      createdBy: ctx.userId,
    });
    return json({ ...row, rice_adjustment: rice });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Update failed", 400);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  if (!ctx) return err("Unauthorized", 401);
  const roles = ctx.roles.map((r) => r.role) as AppRole[];
  if (!canEditMeals(roles)) return err("Forbidden: meal_manager / mess_admin required", 403);
  const existing = await prisma.mealEntries.findUnique({ where: { id } });
  if (!existing) return err("Not found", 404);
  if (!canAccessMess(ctx, existing.mess_id)) return err("Forbidden", 403);
  const e = existing as unknown as { breakfast: number; lunch: number; dinner: number; guest: number };
  // Delete + rice add-back in one transaction (T21): if the rice write
  // fails, the meal delete rolls back too, so stock and entries cannot
  // drift apart. A missing rice row logs + skips, exactly like create/edit.
  const { row, rice } = await prisma.$transaction(async (tx) => {
    const row = await tx.mealEntries.delete({ where: { id } });
    const rice = await adjustRiceForMealEdit(
      {
        messId: existing.mess_id,
        oldBreakfast: Number(e.breakfast ?? 0),
        oldLunch: Number(e.lunch ?? 0),
        oldDinner: Number(e.dinner ?? 0),
        oldGuest: Number(e.guest ?? 0),
        newBreakfast: 0,
        newLunch: 0,
        newDinner: 0,
        newGuest: 0,
        createdBy: ctx.userId,
      },
      tx
    );
    return { row, rice };
  });
  return json({ ...row, rice_adjustment: rice });
}
