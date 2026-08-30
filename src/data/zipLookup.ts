// Demo-only ZIP -> state/city lookup. Not exhaustive — just enough zips to
// exercise all three example states end to end. Real build would call a
// proper geocoding source.

export interface ZipLocation {
  city: string;
  state: string;
}

export const ZIP_LOOKUP: Record<string, ZipLocation> = {
  '90210': { city: 'Beverly Hills', state: 'CA' },
  '94103': { city: 'San Francisco', state: 'CA' },
  '48226': { city: 'Detroit', state: 'MI' },
  '48104': { city: 'Ann Arbor', state: 'MI' },
  '75201': { city: 'Dallas', state: 'TX' },
  '78701': { city: 'Austin', state: 'TX' },
};

export function lookupZip(zip: string): ZipLocation | null {
  return ZIP_LOOKUP[zip.trim()] ?? null;
}
