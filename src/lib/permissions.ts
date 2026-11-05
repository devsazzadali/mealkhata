// Role-permission helper, Phase 1. See FEATURE_GRAPH.md role matrix.
// Roles are permission bundles: a person may hold several roles in a small
// mess, but self-approval is always forbidden (see canApproveFine/Bill).
// UI gating with this helper is a usability boundary only; money routes
// must also enforce their checks server-side. That server gating exists:
// api-server.ts writeGuard enforces monitor read-only, meal/bazar,
// MonthlyPeriods (close_month) and MonthlyBills (edit_money/close_month)
// rules on every generic write, and the fines routes enforce their own.
export type AppRole =
  | "super_admin"
  | "mess_admin"
  | "meal_manager"
  | "bazar_manager"
  | "fine_manager"
  | "mess_monitor"
  | "boarder";

export type Permission =
  | "view_all_bills"
  | "edit_meals"
  | "edit_bazar"
  | "edit_fines"
  | "approve_fines"
  | "edit_money"
  | "close_month"
  | "manage_boarders"
  | "manage_settings";

const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  super_admin: [
    "view_all_bills", "edit_meals", "edit_bazar", "edit_fines", "approve_fines",
    "edit_money", "close_month", "manage_boarders", "manage_settings",
  ],
  mess_admin: [
    "view_all_bills", "edit_meals", "edit_bazar", "edit_fines", "approve_fines",
    "edit_money", "close_month", "manage_boarders", "manage_settings",
  ],
  meal_manager: ["edit_meals"],
  bazar_manager: ["edit_bazar"],
  fine_manager: ["view_all_bills", "edit_fines", "approve_fines", "edit_money"],
  mess_monitor: ["view_all_bills"],
  boarder: [],
};

export function canPerform(roles: AppRole[] | undefined | null, permission: Permission): boolean {
  if (!roles?.length) return false;
  return roles.some((r) => ROLE_PERMISSIONS[r]?.includes(permission));
}

export function canEditMeals(roles: AppRole[] | undefined | null): boolean {
  return canPerform(roles, "edit_meals");
}
export function canEditBazar(roles: AppRole[] | undefined | null): boolean {
  return canPerform(roles, "edit_bazar");
}
export function canEditFines(roles: AppRole[] | undefined | null): boolean {
  return canPerform(roles, "edit_fines");
}
export function canApproveFines(roles: AppRole[] | undefined | null): boolean {
  return canPerform(roles, "approve_fines");
}
/** Mess-admin rule, matching the server (isMessAdminOf in auth.ts):
 * only mess_admin / super_admin may generate bills or close a month. */
export function isMessAdmin(roles: AppRole[] | undefined | null): boolean {
  return !!roles?.some((r) => r === "mess_admin" || r === "super_admin");
}
/** Money-write rule, matching api-server.ts MonthlyBills guard:
 * edit_money (fine_manager) or close_month (mess_admin). */
export function canManageMoney(roles: AppRole[] | undefined | null): boolean {
  return canPerform(roles, "edit_money") || canPerform(roles, "close_month");
}

/** Self-approval ban: a user cannot approve (or waive) their own fine/bill. */
/** True when the caller is a mess_monitor and holds no write role.
 * Such a user is read-only for admin resources (server-enforced in
 * api-server.ts); chat/feedback/notice-ack writes are still allowed. */
export function isReadOnlyMonitor(roles: AppRole[] | undefined | null): boolean {
  if (!roles?.includes("mess_monitor")) return false;
  const writeRoles: AppRole[] = ["super_admin", "mess_admin", "meal_manager", "bazar_manager", "fine_manager"];
  return !roles.some((r) => writeRoles.includes(r));
}

export function canApproveFine(
  roles: AppRole[] | undefined | null,
  approverUserId: string | undefined | null,
  fineCreatedBy: string | undefined | null
): boolean {
  if (!approverUserId || !fineCreatedBy) return false;
  if (approverUserId === fineCreatedBy) return false;
  return canApproveFines(roles);
}

