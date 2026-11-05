import { NextRequest } from "next/server";
import { json, err, requireCtx } from "@/lib/api-server";
import { prisma } from "@/lib/prisma";
import { canApproveFine, canEditFines, type AppRole } from "@/lib/permissions";


// Approve / reject / waive a fine. Server-enforced self-approval ban:
// the approver must hold an approve role AND must not be the fine's creator.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  if (!ctx) return err("Unauthorized", 401);
  const { id } = await params;
  const body = await req.json();
  const existing = await prisma.fines.findUnique({ where: { id } });
  if (!existing) return err("Not found", 404);
  const roles = ctx.roles.map((r) => r.role);
  const action = body.status as string | undefined;
  if (action === "approved" || action === "waived") {
    if (!canApproveFine(roles as AppRole[], ctx.userId, existing.created_by)) {
      return err("Forbidden: cannot approve your own fine; fine_manager / mess_admin required", 403);
    }
    const row = await prisma.fines.update({
      where: { id },
      data: { status: action as "approved" | "waived", approved_by: ctx.userId },
    });
    return json(row);
  }
  if (action === "rejected") {
    if (!canEditFines(roles as AppRole[])) return err("Forbidden", 403);
    const row = await prisma.fines.update({
      where: { id },
      data: { status: "rejected", approved_by: ctx.userId },
    });
    return json(row);
  }
  return err("status must be approved, rejected or waived", 400);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  if (!ctx) return err("Unauthorized", 401);
  const { id } = await params;
  const existing = await prisma.fines.findUnique({ where: { id } });
  if (!existing) return err("Not found", 404);
  const roles = ctx.roles.map((r) => r.role);
  if (!canEditFines(roles as AppRole[])) return err("Forbidden", 403);
  await prisma.fines.delete({ where: { id } });
  return json({ success: true });
}
