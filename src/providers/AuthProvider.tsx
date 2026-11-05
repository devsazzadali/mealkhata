import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";

/** Initializes JWT session load. Mount once at root. Replaces legacy backend auth listener. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const loadProfileAndRoles = useAuthStore((s) => s.loadProfileAndRoles);

  useEffect(() => {
    loadProfileAndRoles().finally(() =>
      useAuthStore.setState({ initialized: true })
    );
  }, [loadProfileAndRoles]);

  return <>{children}</>;
}
