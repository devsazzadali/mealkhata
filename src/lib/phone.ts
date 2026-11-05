// Convert Bangladeshi phone to a deterministic email used for legacy backend Auth.
// Accepts 01XXXXXXXXX or +8801XXXXXXXXX, normalizes to 11-digit local form.
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("8801") && digits.length === 13) return "0" + digits.slice(3);
  if (digits.startsWith("01") && digits.length === 11) return digits;
  if (digits.startsWith("1") && digits.length === 10) return "0" + digits;
  return digits;
}

export function phoneToEmail(phone: string): string {
  return `${normalizePhone(phone)}@mealkhata.app`;
}

export function isValidBdPhone(phone: string): boolean {
  const n = normalizePhone(phone);
  return /^01[3-9]\d{8}$/.test(n);
}

export function formatBdt(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return `৳${v.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
}
