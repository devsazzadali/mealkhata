"use client";

import { useRouter, usePathname } from "next/navigation";
import { useAuthStore, getPrimaryRole, type AppRole } from "@/stores/authStore";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

interface Props {
  children: React.ReactNode;
  allow?: AppRole[];
}

export function ProtectedRoute({ children, allow }: Props) {
  const { initialized, session, roles, loading } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (initialized && !loading) {
      if (!session) {
        router.replace(`/login?from=${encodeURIComponent(pathname)}`);
        return;
      }

      if (allow && !roles.some((r) => allow.includes(r))) {
        const primary = getPrimaryRole(roles);
        if (primary) {
          router.replace(routeForRole(primary));
        } else {
          router.replace("/onboarding");
        }
      }
    }
  }, [initialized, loading, session, roles, allow, router, pathname]);

  if (!initialized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) return null;

  if (allow && !roles.some((r) => allow.includes(r))) return null;

  return <>{children}</>;
}

export function routeForRole(role: AppRole): string {
  if (role === "super_admin") return "/super";
  if (["mess_admin", "meal_manager", "bazar_manager", "fine_manager", "mess_monitor"].includes(role)) return "/app";
  return "/me";
}
