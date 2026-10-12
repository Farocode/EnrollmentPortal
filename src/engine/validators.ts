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

// For a household member's date of birth (repeatingGroup 'date' field,
// stored/typed as an ISO yyyy-mm-dd string via DateSegmentedInput). Nothing
// else constrains this field today, so a driver could be entered with a
// birthdate in the future.
export function validateNotFutureDate(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null; // incomplete/malformed — required-field check handles emptiness
  const entered = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (entered.getTime() > today.getTime()) return "Date of birth can't be in the future";
  return null;
}

// Whole years between an ISO yyyy-mm-dd birth date and today.
function ageInYears(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}

const MAX_PLAUSIBLE_AGE = 110;
// The applicant is the person buying the policy. 16 is a deliberate
// simplification (licensing ages run 14-18 depending on the state); it
// could move into the per-state config later.
const MIN_APPLICANT_AGE = 16;

// Applicant's own DOB: not in the future, old enough to hold a policy, and
// not older than any living person is likely to be (a 1732 birthdate used
// to sail through).
export function validateApplicantDob(value: string): string | null {
  const future = validateNotFutureDate(value);
  if (future) return future;
  if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(value)) return null;
  const age = ageInYears(value);
  if (age > MAX_PLAUSIBLE_AGE) return `Enter a valid date of birth (that would make you over ${MAX_PLAUSIBLE_AGE})`;
  if (age < MIN_APPLICANT_AGE) return `You must be at least ${MIN_APPLICANT_AGE} to apply`;
  return null;
}

// Household member's DOB: no minimum (a young driver on the policy is
// fine), but the same future/too-old checks.
export function validateHouseholdDob(value: string): string | null {
  const future = validateNotFutureDate(value);
  if (future) return future;
  if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(value)) return null;
  if (ageInYears(value) > MAX_PLAUSIBLE_AGE) return `Enter a valid date of birth (over ${MAX_PLAUSIBLE_AGE} years old)`;
  return null;
}

// Accident/violation date: can't be in the future.
export function validateNotFutureIncidentDate(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(value).getTime() > today.getTime() ? "Date can't be in the future" : null;
}

export function validateVehicleYear(value: string): string | null {
  const year = Number(value);
  const now = new Date().getFullYear();
  const max = now + 1; // next model year is typically already on sale
  if (!Number.isInteger(year)) return 'Enter a valid year';
  if (year < MIN_VEHICLE_YEAR || year > max) return `Enter a year between ${MIN_VEHICLE_YEAR} and ${max}`;
  return null;
}
