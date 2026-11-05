import { NextRequest } from "next/server";
import { listHandler, createHandler } from "@/lib/api-server";

export async function GET(req: NextRequest) {
  return listHandler("Boarders", req.nextUrl.searchParams);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  return createHandler("Boarders", body);
}
