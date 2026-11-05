import { NextRequest } from "next/server";
import { listHandler, json, err, requireCtx } from "@/lib/api-server";
import { prisma } from "@/lib/prisma";
import { canEditFines, type AppRole } from "@/lib/permissions";
import { FINE_TYPES } from "@/lib/fines";

export async function GET(req: NextRequest) {
  return listHandler("Fines", req.nextUrl.searchParams);
}

// Create a fine. Server-enforced: only super_admin / mess_admin /
// fine_manager may create; status is always forced to "pending" and
// created_by is always the caller, regardless of client-supplied values.
export async function POST(req: NextRequest) {
  const ctx = await requireCtx();
  if (!ctx) return err("Unauthorized", 401);
  const roles = ctx.roles.map((r) => r.role);
  if (!canEditFines(roles as AppRole[])) return err("Forbidden: fine_manager / mess_admin required", 403);
  const body = await req.json();
  const messId = body.mess_id as string | undefined;
  if (!messId || !body.boarder_id || !body.type || body.amount === undefined || body.year === undefined || body.month === undefined) {
    return err("mess_id, boarder_id, type, amount, year and month are required", 400);
  }
  if (!FINE_TYPES.some((f) => f.value === body.type)) return err("Unknown fine type", 400);
  if (Number(body.amount) < 0) return err("Fine amount cannot be negative", 400);
  try {
    const row = await prisma.fines.create({
      data: {
        mess_id: messId,
        boarder_id: body.boarder_id,
        type: body.type,
        basis: body.basis ?? FINE_TYPES.find((f) => f.value === body.type)?.basis ?? null,
        notes: body.notes ?? null,
        amount: Number(body.amount),
        year: Number(body.year),
        month: Number(body.month),
        status: "pending",
        created_by: ctx.userId,
        approved_by: null,
      },
    });
    return json(row, 201);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Create failed", 400);
  }
}
