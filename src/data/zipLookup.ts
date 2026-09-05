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
  '90001': { city: 'Los Angeles', state: 'CA' },
  '92101': { city: 'San Diego', state: 'CA' },
  '95814': { city: 'Sacramento', state: 'CA' },
  '94612': { city: 'Oakland', state: 'CA' },
  '48226': { city: 'Detroit', state: 'MI' },
  '48104': { city: 'Ann Arbor', state: 'MI' },
  '49503': { city: 'Grand Rapids', state: 'MI' },
  '48933': { city: 'Lansing', state: 'MI' },
  '75201': { city: 'Dallas', state: 'TX' },
  '78701': { city: 'Austin', state: 'TX' },
  '77002': { city: 'Houston', state: 'TX' },
  '78205': { city: 'San Antonio', state: 'TX' },
  '76102': { city: 'Fort Worth', state: 'TX' },
};

export function lookupZip(zip: string): ZipLocation | null {
  return ZIP_LOOKUP[zip.trim()] ?? null;
}
