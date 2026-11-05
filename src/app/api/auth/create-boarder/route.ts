// Replaces legacy backend edge function create-boarder.
// Caller must be mess_admin/super_admin. Creates (or finds) a profile for
// the boarder phone, assigns boarder role, creates the boarder row.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isSuperAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { normalizePhone, phoneToEmail, isValidBdPhone } from "@/lib/phone";

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const adminRole = ctx.roles.find((r) => r.role === "mess_admin" && r.mess_id);
  const messId = adminRole?.mess_id ?? ctx.profile.mess_id;
  const isAdmin = !!adminRole || isSuperAdmin(ctx);
  if (!isAdmin || !messId) {
    return NextResponse.json({ error: "Only admins can create boarders" }, { status: 403 });
  }
  const body = await req.json();
  const phone = normalizePhone((body.phone as string | undefined) ?? "");
  if (!body.full_name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!isValidBdPhone(phone)) return NextResponse.json({ error: "Invalid Bangladeshi mobile number" }, { status: 400 });
  if (!body.password || body.password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }
  // Phase 2 hard blocker: a new boarder cannot be created without accepting
  // the mess rules. The create-boarder dialog already collects this checkbox,
  // and signup (profile creation) is a separate flow, so this does not
  // break signup.
  if (body.rules_accepted !== true) {
    return NextResponse.json({ error: "Mess rules must be accepted (rules_accepted) before creating a boarder" }, { status: 400 });
  }
  const email = phoneToEmail(phone);
  let profile = await prisma.profiles.findUnique({ where: { email } });
  if (!profile) {
    profile = await prisma.profiles.create({
      data: {
        full_name: body.full_name.trim(),
        phone,
        email,
        passwordHash: await hashPassword(body.password),
        mess_id: messId,
      },
    });
  } else {
    await prisma.profiles.update({ where: { id: profile.id }, data: { mess_id: messId } });
  }
  const existingRole = await prisma.userRoles.findFirst({
    where: { user_id: profile.id, role: "boarder", mess_id: messId },
  });
  if (!existingRole) {
    await prisma.userRoles.create({ data: { user_id: profile.id, role: "boarder", mess_id: messId } });
  }
  const boarder = await prisma.boarders.create({
    data: {
      mess_id: messId,
      user_id: profile.id,
      full_name: body.full_name.trim(),
      phone,
      guardian_name: body.guardian_name || null,
      guardian_phone: body.guardian_phone || null,
      // New fields (Phase 1, now in the generated client).
      local_guardian_name: body.local_guardian_name || null,
      local_guardian_phone: body.local_guardian_phone || null,
      nid_or_student_id: body.nid_or_student_id || null,
      rules_accepted: body.rules_accepted ?? false,
      room_id: body.room_id || null,
      seat_number: body.seat_number || null,
      monthly_deposit: body.monthly_deposit ?? 0,
      rice_balance: body.rice_balance ?? 0,
      notes: body.notes || null,
      join_date: new Date(),
      balance: 0,
      status: "active",
    },
  });
  return NextResponse.json({ success: true, boarder });
}
