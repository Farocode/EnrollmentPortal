import type { ComboboxGroup, SelectOption } from '../engine/types';

// Make question switched from one long undifferentiated <select> list to a
// filterable combobox (see ComboboxInput.tsx), grouped two ways per user
// request: a short "Most common" tier up top (roughly the highest-volume
// US sales brands), then everything else below. Both tiers are
// alphabetized — the tiering is what surfaces the common ones first, and
// stacking a second, different sort order (popularity) inside just that
// one group on top of it would read as arbitrary/confusing rather than
// helpful, per user feedback. Typing filters across both tiers regardless
// of which one a make is filed under.
const TOP_MAKE_NAMES = ['Toyota', 'Ford', 'Chevrolet', 'Honda', 'Nissan', 'Jeep', 'Hyundai', 'Kia', 'Subaru', 'GMC'].sort(
  (a, b) => a.localeCompare(b),
);

// Alphabetized. (Previously had Dodge listed twice in the old flat list —
// not reproduced here.)
const OTHER_MAKE_NAMES = [
  'Acura',
  'Audi',
  'BMW',
  'Buick',
  'Cadillac',
  'Chrysler',
  'Dodge',
  'Infiniti',
  'Lexus',
  'Mazda',
  'Mercedes-Benz',
  'Mini',
  'Mitsubishi',
  'Porsche',
  'Ram',
  'Tesla',
  'Volkswagen',
  'Volvo',
].sort((a, b) => a.localeCompare(b));

const toOptions = (names: string[]): SelectOption[] => names.map((make) => ({ value: make, label: make }));

export const VEHICLE_MAKE_GROUPS: ComboboxGroup[] = [
  { label: 'Most common', options: toOptions(TOP_MAKE_NAMES) },
  {
    label: 'All makes',
    options: [...toOptions(OTHER_MAKE_NAMES), { value: 'Other / not listed', label: 'Other / not listed' }],
  },
];
