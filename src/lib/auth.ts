// Custom JWT auth replacing legacy backend Auth.
// DEFAULT (not a user choice): custom JWT (jose) + bcryptjs, httpOnly cookie.
// Old legacy backend Auth passwords cannot be migrated - old users must reset
// their password, because only bcrypt hashes are stored here, never plain text.
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const AUTH_COOKIE = "mealkhata_token";
export type AppRole = "super_admin" | "mess_admin" | "meal_manager" | "bazar_manager" | "fine_manager" | "mess_monitor" | "boarder";

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. Generate one with: openssl rand -hex 32, and set it in .env (never commit .env)."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export function authCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

export interface AuthContext {
  userId: string;
  profile: {
    id: string;
    full_name: string;
    phone: string;
    email: string;
    photo_url: string | null;
    mess_id: string | null;
  };
  roles: { role: AppRole; mess_id: string | null }[];
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  const userId = await verifyToken(token);
  if (!userId) return null;
  const profile = await prisma.profiles.findUnique({ where: { id: userId } });
  if (!profile) return null;
  const roles = await prisma.userRoles.findMany({ where: { user_id: userId } });
  return {
    userId,
    profile: {
      id: profile.id,
      full_name: profile.full_name,
      phone: profile.phone,
      email: profile.email,
      photo_url: profile.photo_url,
      mess_id: profile.mess_id,
    },
    roles: roles.map((r) => ({ role: r.role as AppRole, mess_id: r.mess_id })),
  };
}

export function isSuperAdmin(ctx: AuthContext | null): boolean {
  return !!ctx?.roles.some((r) => r.role === "super_admin");
}

export function isMessAdminOf(ctx: AuthContext | null, messId: string): boolean {
  if (!ctx) return false;
  return (
    isSuperAdmin(ctx) ||
    ctx.roles.some((r) => r.role === "mess_admin" && r.mess_id === messId)
  );
}

/**
 * Mess access check replacing legacy backend RLS (get_user_mess_id / is_mess_admin_of).
 * Super admins can access any mess. Other users can access only their own
 * profile mess, or a mess they hold a role for.
 */
export function canAccessMess(ctx: AuthContext | null, messId: string): boolean {
  if (!ctx) return false;
  if (isSuperAdmin(ctx)) return true;
  if (ctx.profile.mess_id === messId) return true;
  return ctx.roles.some((r) => r.mess_id === messId);
}


