// Storage replacement for legacy backend buckets (avatars, chat-images).
// Provider abstraction:
//   - If BLOB_READ_WRITE_TOKEN is set (production, Vercel Blob), files go to
//     Vercel Blob via a lazy import of "@vercel/blob". That package is NOT
//     bundled by default: production deploys must run `npm i @vercel/blob`
//     first. If the token is set but the package is missing, this route
//     returns 501 instead of crashing or silently falling back to local disk.
//   - Otherwise (local dev, no token), files are saved under
//     public/uploads/<bucket>/ exactly as before. Local disk is NOT a
//     production store: on serverless hosts it is ephemeral and per-instance.
// The returned URL is stored in image_url / photo_url columns, same as before.
// No credential is invented here; the token comes only from the host env.
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

async function saveToBlob(file: File, safeBucket: string, name: string) {
  try {
    const mod = await import("@vercel/blob");
    const blob = await mod.put(`${safeBucket}/${name}`, file, { access: "public" });
    return blob.url;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const bucket = (form.get("bucket") as string) || "uploads";
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  const safeBucket = bucket.replace(/[^a-z0-9-]/gi, "");
  const ext = path.extname(file.name || "");
  const name = `${crypto.randomBytes(12).toString("hex")}${ext}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const url = await saveToBlob(file, safeBucket, name);
    if (!url) {
      return NextResponse.json(
        { error: "Upload storage is not configured: BLOB_READ_WRITE_TOKEN is set but @vercel/blob is not installed. Run: npm i @vercel/blob" },
        { status: 501 }
      );
    }
    return NextResponse.json({ url });
  }
  // Local dev fallback only.
  const dir = path.join(process.cwd(), "public", "uploads", safeBucket);
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, name), buffer);
  return NextResponse.json({ url: `/uploads/${safeBucket}/${name}` });
}
