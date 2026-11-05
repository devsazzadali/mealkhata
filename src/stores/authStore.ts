import { create } from "zustand";

export type AppRole = "super_admin" | "mess_admin" | "meal_manager" | "bazar_manager" | "fine_manager" | "mess_monitor" | "boarder";

export interface Profile {
  id: string;
  full_name: string;
  phone: string;
  photo_url: string | null;
  mess_id: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthState {
  session: { user: AuthUser } | null;
  user: AuthUser | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  initialized: boolean;
  setSession: (s: { user: AuthUser } | null) => void;
  loadProfileAndRoles: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  profile: null,
  roles: [],
  loading: true,
  initialized: false,

  setSession: (session) => {
    set({ session, user: session?.user ?? null });
  },

  loadProfileAndRoles: async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        set({ profile: null, roles: [], session: null, user: null, loading: false });
        return;
      }
      const data = await res.json();
      set({
        session: { user: data.user },
        user: data.user,
        profile: data.profile as Profile | null,
        roles: (data.roles ?? []).map((r: { role: AppRole }) => r.role as AppRole),
        loading: false,
      });
    } catch {
      set({ profile: null, roles: [], loading: false });
    }
  },

  signOut: async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore - session is cleared locally regardless
    }
    set({ session: null, user: null, profile: null, roles: [] });
  },
}));

export function getPrimaryRole(roles: AppRole[]): AppRole | null {
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("mess_admin")) return "mess_admin";
  if (roles.includes("meal_manager")) return "meal_manager";
  if (roles.includes("bazar_manager")) return "bazar_manager";
  if (roles.includes("fine_manager")) return "fine_manager";
  if (roles.includes("mess_monitor")) return "mess_monitor";
  if (roles.includes("boarder")) return "boarder";
  return null;
}
