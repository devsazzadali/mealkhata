"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore, getPrimaryRole } from "@/stores/authStore";
import { Loader2 } from "lucide-react";
import { routeForRole } from "@/components/auth/ProtectedRoute";

export default function HomeRedirect() {
  const router = useRouter();
  const { initialized, session, roles, profile, loading } = useAuthStore();

  useEffect(() => {
    if (initialized && !loading) {
      if (!session) {
        router.replace("/login");
        return;
      }

      const primary = getPrimaryRole(roles);
      if (!primary) {
        router.replace("/onboarding");
        return;
      }

      if ((primary === "super_admin" || primary === "mess_admin") && !profile?.mess_id) {
        router.replace("/onboarding");
        return;
      }

      router.replace(routeForRole(primary));
    }
  }, [initialized, loading, session, roles, profile, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
}
