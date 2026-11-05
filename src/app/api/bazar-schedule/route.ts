import { NextRequest } from "next/server";
import { listHandler, createHandler } from "@/lib/api-server";

export async function GET(req: NextRequest) {
  return listHandler("BazarSchedule", req.nextUrl.searchParams);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  return createHandler("BazarSchedule", body);
}
