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

// Fixed floor rather than a rolling "N years back" window: standard auto
// insurance doesn't have a real age cutoff (any registered vehicle
// qualifies — classic/collector coverage is a separate add-on category,
// not a requirement older cars get pushed into), so an arbitrary fleet-age
// floor was excluding legitimately-insurable older daily drivers. 1981 is
// a real, fixed industry milestone instead of a guess: it's the first
// model year the 17-character VIN format was required, which also lines
// up with this app's VIN validation rules.
const MIN_VEHICLE_YEAR = 1981;

export function validateVehicleYear(value: string): string | null {
  const year = Number(value);
  const now = new Date().getFullYear();
  const max = now + 1; // next model year is typically already on sale
  if (!Number.isInteger(year)) return 'Enter a valid year';
  if (year < MIN_VEHICLE_YEAR || year > max) return `Enter a year between ${MIN_VEHICLE_YEAR} and ${max}`;
  return null;
}
