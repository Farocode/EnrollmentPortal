// Reusable field validators/formatters, referenced from questions.ts data
// rather than hardcoded per-field in the UI. Keeps the "config not code"
// philosophy already used for conditions and state config.

export const NAME_CHAR = /[A-Za-z\s'-]/;
export const ADDRESS_CHAR = /[A-Za-z0-9\s.,'#-]/;

export function stripToPattern(value: string, pattern: RegExp): string {
  return value
    .split('')
    .filter((ch) => pattern.test(ch))
    .join('');
}

// "los angeles" -> "Los Angeles". Good enough for a city name typed as
// lowercase; doesn't special-case things like "McDonald" or "O'Brien".
export function titleCase(value: string): string {
  return value.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function validateEmail(value: string): string | null {
  // Simple, not exhaustive RFC 5322 — good enough to catch obvious typos.
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(value) ? null : 'Enter a valid email address (e.g. name@example.com)';
}

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  const parts: string[] = [];
  if (digits.length > 0) parts.push(digits.slice(0, 3));
  if (digits.length > 3) parts.push(digits.slice(3, 6));
  if (digits.length > 6) parts.push(digits.slice(6, 10));
  return parts.join('-');
}

export function validatePhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 10) return 'Enter a 10-digit phone number';
  // NANP: area code and exchange code can't start with 0 or 1.
  if (/^[01]/.test(digits) || /^\d{3}[01]/.test(digits)) {
    return "That doesn't look like a valid US phone number";
  }
  return null;
}

export function validateVehicleYear(value: string): string | null {
  const year = Number(value);
  const now = new Date().getFullYear();
  const max = now + 1; // next model year is typically already on sale
  const min = now - 25; // demo-reasonable fleet-age floor
  if (!Number.isInteger(year)) return 'Enter a valid year';
  if (year < min || year > max) return `Enter a year between ${min} and ${max}`;
  return null;
}
