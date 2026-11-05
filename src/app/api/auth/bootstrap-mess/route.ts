// Replaces legacy backend edge function bootstrap-mess.
// Caller must have no mess_admin/boarder role yet. Creates a mess, assigns
// caller as mess_admin, updates profile.mess_id, creates mess_settings
// (join_key generated like the original trigger: 8-char hex).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocking = ctx.roles.filter(
    (r) => r.role === "mess_admin" || r.role === "boarder"
  );
  if (blocking.length > 0) {
    return NextResponse.json({ error: "You already have a role assigned" }, { status: 400 });
  }
  const body = await req.json();
  const mess_name = (body.mess_name as string | undefined)?.trim();
  if (!mess_name) return NextResponse.json({ error: "Mess name is required" }, { status: 400 });
  const mess = await prisma.messes.create({
    data: { name: mess_name, address: body.address || null, phone: body.phone || null, status: "active" },
  });
  await prisma.userRoles.create({
    data: { user_id: ctx.userId, role: "mess_admin", mess_id: mess.id },
  });
  await prisma.profiles.update({ where: { id: ctx.userId }, data: { mess_id: mess.id } });
  await prisma.messSettings.upsert({
    where: { mess_id: mess.id },
    create: { mess_id: mess.id, join_key: crypto.randomBytes(4).toString("hex"), default_meal_rate: 0, low_balance_threshold: 100 },
    update: {},
  });
  return NextResponse.json({ success: true, mess });
}
