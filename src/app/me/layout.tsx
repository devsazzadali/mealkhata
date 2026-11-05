"use client";

import AppLayout from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function BoarderLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute allow={["boarder"]}>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}
