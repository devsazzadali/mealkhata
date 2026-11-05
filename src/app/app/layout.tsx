"use client";

import AppLayout from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function MessAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute allow={["mess_admin", "super_admin", "meal_manager", "bazar_manager", "fine_manager", "mess_monitor"]}>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}
