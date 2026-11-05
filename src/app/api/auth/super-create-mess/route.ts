// Replaces legacy backend edge function super-create-mess.
// Caller must be super_admin. Creates a mess + its admin profile/role.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isSuperAdmin, hashPassword } from "@/lib/auth";
import { normalizePhone, phoneToEmail, isValidBdPhone } from "@/lib/phone";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || !isSuperAdmin(ctx)) {
    return NextResponse.json({ error: "Only super admins can create messes" }, { status: 403 });
  }
  const body = await req.json();
  const mess_name = (body.mess_name as string | undefined)?.trim();
  const admin_full_name = (body.admin_full_name as string | undefined)?.trim();
  const admin_phone = normalizePhone((body.admin_phone as string | undefined) ?? "");
  if (!mess_name) return NextResponse.json({ error: "Mess name is required" }, { status: 400 });
  if (!admin_full_name) return NextResponse.json({ error: "Admin name is required" }, { status: 400 });
  if (!isValidBdPhone(admin_phone)) return NextResponse.json({ error: "Invalid admin mobile number" }, { status: 400 });
  if (!body.admin_password || body.admin_password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }
  const mess = await prisma.messes.create({
    data: { name: mess_name, address: body.address || null, phone: body.mess_phone || null, status: "active" },
  });
  const email = phoneToEmail(admin_phone);
  let profile = await prisma.profiles.findUnique({ where: { email } });
  if (!profile) {
    profile = await prisma.profiles.create({
      data: {
        full_name: admin_full_name,
        phone: admin_phone,
        email,
        passwordHash: await hashPassword(body.admin_password),
        mess_id: mess.id,
      },
    });
  } else {
    await prisma.profiles.update({ where: { id: profile.id }, data: { mess_id: mess.id } });
  }
  const existingRole = await prisma.userRoles.findFirst({
    where: { user_id: profile.id, role: "mess_admin", mess_id: mess.id },
  });
  if (!existingRole) {
    await prisma.userRoles.create({ data: { user_id: profile.id, role: "mess_admin", mess_id: mess.id } });
  }
  await prisma.messSettings.upsert({
    where: { mess_id: mess.id },
    create: { mess_id: mess.id, join_key: crypto.randomBytes(4).toString("hex"), default_meal_rate: 0, low_balance_threshold: 100 },
    update: {},
  });
  return NextResponse.json({ success: true, mess, admin_user_id: profile.id });
}
