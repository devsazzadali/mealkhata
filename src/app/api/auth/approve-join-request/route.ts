// Replaces legacy backend edge function approve-join-request.
// Body: { request_id, action: "approve" | "reject", monthly_deposit? }
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isSuperAdmin, isMessAdminOf } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const request_id = body.request_id as string | undefined;
  const action = body.action as "approve" | "reject" | undefined;
  if (!request_id || !["approve", "reject"].includes(action ?? "")) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const jr = await prisma.joinRequests.findUnique({ where: { id: request_id } });
  if (!jr) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (!isMessAdminOf(ctx, jr.mess_id) && !isSuperAdmin(ctx)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (jr.status !== "pending") return NextResponse.json({ error: "Already decided" }, { status: 400 });
  // Phase 2 hard blocker on approval (reject is still allowed). Note: pending
  // requests created before rules_accepted existed will be blocked here and
  // must be rejected + re-applied with the rules checkbox ticked.
  if (action === "approve" && jr.rules_accepted !== true) {
    return NextResponse.json({ error: "Mess rules must be accepted (rules_accepted) before approving a join request" }, { status: 400 });
  }
  if (action === "reject") {
    await prisma.joinRequests.update({
      where: { id: request_id },
      data: { status: "rejected", decided_by: ctx.userId, decided_at: new Date() },
    });
    return NextResponse.json({ success: true });
  }
  await prisma.profiles.update({ where: { id: jr.user_id }, data: { mess_id: jr.mess_id } });
  const existingRole = await prisma.userRoles.findFirst({
    where: { user_id: jr.user_id, role: "boarder", mess_id: jr.mess_id },
  });
  if (!existingRole) {
    await prisma.userRoles.create({ data: { user_id: jr.user_id, role: "boarder", mess_id: jr.mess_id } });
  }
  const existingB = await prisma.boarders.findFirst({
    where: { user_id: jr.user_id, mess_id: jr.mess_id },
  });
  if (!existingB) {
    await prisma.boarders.create({
      data: {
        mess_id: jr.mess_id,
        user_id: jr.user_id,
        full_name: jr.requested_name,
        phone: jr.requested_phone,
        local_guardian_name: jr.local_guardian_name,
        local_guardian_phone: jr.local_guardian_phone,
        nid_or_student_id: jr.nid_or_student_id,
        rules_accepted: jr.rules_accepted,
        monthly_deposit: Number(body.monthly_deposit ?? 0),
        join_date: new Date(),
        balance: 0,
        status: "active",
      },
    });
  }
  await prisma.joinRequests.update({
    where: { id: request_id },
    data: { status: "approved", decided_by: ctx.userId, decided_at: new Date() },
  });
  return NextResponse.json({ success: true });
}
