import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth";
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = req.nextUrl.searchParams.get("key")?.trim();
  if (!key) return NextResponse.json({ error: "Join key required" }, { status: 400 });
  const settings = await prisma.messSettings.findUnique({ where: { join_key: key } });
  return NextResponse.json(settings?.mess_id ?? null);
}
