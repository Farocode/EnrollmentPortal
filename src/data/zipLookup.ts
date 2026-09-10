// ZIP -> city/state resolution. Two-tier, same "config not code" pattern as
// stateConfig.ts:
//   1. An explicit override table, checked first. Empty by default — add an
//      entry only when a specific ZIP needs to be pinned to a specific
//      city/state regardless of what the API says (e.g. a known
//      multi-city ZIP the demo wants to force one answer for, or a state
//      not yet trusting the generic API).
//   2. Zippopotam.us (https://zippopotam.us/) — free, no signup/API key,
//      CORS-enabled (callable straight from the browser, no backend
//      needed), covers the full US ZIP range. Chosen over USPS's own APIs
//      for this stage: the legacy USPS Web Tools API requires its own
//      registration and restricts usage to "shipping or mailing services
//      only," and the modern USPS Addresses 3.0 API requires a business
//      account sign-up through USPS's Business Portal — real setup
//      friction this project doesn't need yet. See project spec doc for
//      the full comparison. Zippopotam.us's own data is "as-is," no
//      accuracy/coverage guarantee, which is an acceptable tradeoff for a
//      demo but the reason USPS's own API stays logged as the future
//      production-grade option.

export interface ZipLocation {
  city: string;
  state: string;
}

export const ZIP_OVERRIDES: Record<string, ZipLocation> = {};

interface ZippopotamPlace {
  'place name': string;
  'state abbreviation': string;
}

interface ZippopotamResponse {
  places?: ZippopotamPlace[];
}

/**
 * Resolves a ZIP to { city, state }.
 *
 * Returns null for a well-formed request that simply has no match (an
 * invalid/unrecognized ZIP, or a malformed 5-digit string) — the caller
 * should fall back to manual entry, same as it already does today.
 *
 * Throws if the request itself fails (offline, DNS, CORS, non-404 server
 * error) — the caller should treat that as a distinct "couldn't reach the
 * lookup service" state, not the same as "ZIP not recognized."
 */
export async function resolveZip(zip: string): Promise<ZipLocation | null> {
  const trimmed = zip.trim();
  if (ZIP_OVERRIDES[trimmed]) return ZIP_OVERRIDES[trimmed];
  if (!/^\d{5}$/.test(trimmed)) return null;

  const res = await fetch(`https://api.zippopotam.us/us/${trimmed}`);
  if (!res.ok) return null; // 404 = not a recognized US ZIP, not an error

  const data = (await res.json()) as ZippopotamResponse;
  const place = data.places?.[0];
  if (!place) return null;

  return { city: place['place name'], state: place['state abbreviation'] };
}
