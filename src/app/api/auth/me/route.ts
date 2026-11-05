import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    user: { id: ctx.userId, email: ctx.profile.email },
    profile: ctx.profile,
    roles: ctx.roles,
  });
}
