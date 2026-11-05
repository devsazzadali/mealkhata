import { NextRequest } from "next/server";
import { updateHandler, deleteHandler } from "@/lib/api-server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  return updateHandler("MessSettings", id, body, "mess_id");
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return deleteHandler("MessSettings", id, "mess_id");
}
