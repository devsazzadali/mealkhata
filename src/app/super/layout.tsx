"use client";

import AppLayout from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute allow={["super_admin"]}>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}
