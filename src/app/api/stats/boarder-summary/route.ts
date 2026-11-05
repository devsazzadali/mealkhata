import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, canAccessMess } from "@/lib/auth";
import { getBoarderMonthSummary } from "@/lib/stats";
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const mess_id = req.nextUrl.searchParams.get("mess_id")!;
  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month"));
  if (!mess_id || !canAccessMess(ctx, mess_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getBoarderMonthSummary(mess_id, year, month));
}
