// Fine catalogue for Phase 1.
// IMPORTANT: there is no universal Bangladesh fine tariff. Amounts are
// mess-configured: every fine is created with an explicit amount entered
// by a manager for that mess, or set in a mess's own fine rules (Phase 2).
// The constants below define only the *type* and its calculation *basis*;
// `defaultAmount` is intentionally null, never a claimed tariff.
export type FineBasis = "fixed" | "per_day" | "percent_of_bill" | "per_meal" | "actual_cost";

export interface FineTypeDef {
  value: string;
  label: string;
  basis: FineBasis;
  defaultAmount: null;
}

export const FINE_TYPES: FineTypeDef[] = [
  { value: "late_meal_off", label: "Late meal-off (meal still charged)", basis: "per_meal", defaultAmount: null },
  { value: "late_payment", label: "Late payment of monthly bill", basis: "per_day", defaultAmount: null },
  { value: "missed_bazar", label: "Missed bazar duty", basis: "fixed", defaultAmount: null },
  { value: "missed_duty", label: "Missed cooking / cleaning duty", basis: "fixed", defaultAmount: null },
  { value: "leaving_without_notice", label: "Leaving without notice", basis: "fixed", defaultAmount: null },
  { value: "damage", label: "Damage / breakage (at cost)", basis: "actual_cost", defaultAmount: null },
  { value: "noise_misconduct", label: "Noise / misconduct", basis: "fixed", defaultAmount: null },
  { value: "missing_meeting", label: "Missing monthly meeting", basis: "fixed", defaultAmount: null },
  { value: "other", label: "Other (see notes)", basis: "fixed", defaultAmount: null },
];

export const FINE_STATUSES = ["pending", "approved", "rejected", "waived"] as const;
export type FineStatus = (typeof FINE_STATUSES)[number];

export function fineTypeLabel(value: string): string {
  return FINE_TYPES.find((f) => f.value === value)?.label ?? value;
}
