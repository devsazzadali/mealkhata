import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, isMessAdminOf, isSuperAdmin } from "@/lib/auth";
import { generateMonthlyBills } from "@/lib/stats";
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!isMessAdminOf(ctx, body.mess_id) && !isSuperAdmin(ctx)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const count = await generateMonthlyBills(body.mess_id, body.year, body.month, ctx.userId);
    return NextResponse.json({ count });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Generate failed";
    const status = msg.includes("locked") ? 423 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
