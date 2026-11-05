import { NextRequest } from "next/server";
import { listHandler, json, err, requireCtx, coerceBody } from "@/lib/api-server";
import { prisma } from "@/lib/prisma";
import { canEditMeals } from "@/lib/permissions";
import { deductRiceForMealEntry } from "@/lib/rice";

export async function GET(req: NextRequest) {
  return listHandler("MealEntries", req.nextUrl.searchParams);
}

// Create a meal entry, then auto-deduct rice if MessSettings.kg_per_meal
// is set. Server-enforced: only super_admin / mess_admin / meal_manager
// may create entries (boarder self-entry goes via meal-requests).
// Rice deduction failures never block the meal entry itself: the entry
// is the record of truth, and the deduction result is reported back.
export async function POST(req: NextRequest) {
  const ctx = await requireCtx();
  if (!ctx) return err("Unauthorized", 401);
  const roles = ctx.roles.map((r) => r.role);
  if (!canEditMeals(roles as unknown as import("@/lib/permissions").AppRole[])) {
    return err("Forbidden: meal_manager / mess_admin required", 403);
  }
  const body = await req.json();
  const messId = body.mess_id as string | undefined;
  if (!messId) return err("mess_id is required", 400);
  try {
    const row = await prisma.mealEntries.create({
      data: coerceBody("MealEntries", body) as never,
    });
    const r = row as unknown as { breakfast: number; lunch: number; dinner: number; guest: number };
    const rice = await deductRiceForMealEntry({
      messId,
      breakfast: Number(r.breakfast ?? 0),
      lunch: Number(r.lunch ?? 0),
      dinner: Number(r.dinner ?? 0),
      guest: Number(r.guest ?? 0),
      createdBy: ctx.userId,
    });
    return json({ ...row, rice_deduction: rice }, 201);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Create failed", 400);
  }
}
