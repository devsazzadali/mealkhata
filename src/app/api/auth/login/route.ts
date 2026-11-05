import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken, authCookieOptions } from "@/lib/auth";
import { phoneToEmail } from "@/lib/phone";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const phone = body.phone as string | undefined;
  const password = body.password as string | undefined;
  const email = body.email as string | undefined;
  if (!password || (!phone && !email)) {
    return NextResponse.json({ error: "Phone and password are required" }, { status: 400 });
  }
  const resolvedEmail = email ?? phoneToEmail(phone as string);
  const profile = await prisma.profiles.findUnique({ where: { email: resolvedEmail } });
  if (!profile) return NextResponse.json({ error: "Invalid phone or password" }, { status: 401 });
  const ok = await verifyPassword(password, profile.passwordHash);
  if (!ok) return NextResponse.json({ error: "Invalid phone or password" }, { status: 401 });
  const roles = await prisma.userRoles.findMany({ where: { user_id: profile.id } });
  const token = await signToken(profile.id);
  const { passwordHash: _p, ...safe } = profile as unknown as Record<string, unknown>;
  const res = NextResponse.json({ user: { id: profile.id, email: profile.email }, profile: safe, roles });
  res.cookies.set("mealkhata_token", token, authCookieOptions());
  return res;
}
