/** Formatting helpers for E-UPCHAR. Amounts are integer paise everywhere. */

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatPaise(paise: number | null | undefined): string | null {
  if (paise === null || paise === undefined) return null;
  return INR.format(Math.round(paise / 100));
}

export function formatRupees(rupees: number): string {
  return INR.format(rupees);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

export function formatDayLabel(iso: string): { weekday: string; day: string; month: string } {
  const date = new Date(iso);
  return {
    weekday: date.toLocaleDateString("en-IN", { weekday: "short" }),
    day: date.toLocaleDateString("en-IN", { day: "2-digit" }),
    month: date.toLocaleDateString("en-IN", { month: "short" }),
  };
}

/** `+91 94700 03568` style display for a 10-digit Indian mobile. */
export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return phone;
}

/**
 * Age in whole years from an ISO date of birth, or `null` when unknown.
 * Kept here so every screen shows the same number.
 */
export function ageFromDateOfBirth(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** Always masks: only the final 4 characters are ever retained or shown. */
export function maskLast4(value: string): string {
  const digits = value.replace(/\D/g, "").slice(-4);
  return `•••• •••• ${digits}`;
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
