import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, isMessAdminOf, isSuperAdmin } from "@/lib/auth";
import { closeMonth } from "@/lib/stats";
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!isMessAdminOf(ctx, body.mess_id) && !isSuperAdmin(ctx)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const period = await closeMonth(body.mess_id, body.year, body.month, ctx.userId);
  return NextResponse.json(period);
}
