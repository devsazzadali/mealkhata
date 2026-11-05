import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { normalizePhone, phoneToEmail, isValidBdPhone } from "@/lib/phone";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const full_name = (body.full_name as string | undefined)?.trim();
  const phone = normalizePhone((body.phone as string | undefined) ?? "");
  const password = body.password as string | undefined;
  if (!full_name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!isValidBdPhone(phone)) return NextResponse.json({ error: "Invalid Bangladeshi mobile" }, { status: 400 });
  if (!password || password.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  const email = phoneToEmail(phone);
  const existing = await prisma.profiles.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "An account with this phone already exists" }, { status: 400 });
  const profile = await prisma.profiles.create({
    data: { full_name, phone, email, passwordHash: await hashPassword(password), mess_id: null },
  });
  const { passwordHash: _p, ...safe } = profile as unknown as Record<string, unknown>;
  return NextResponse.json({ success: true, user_id: profile.id, email, profile: safe });
}
