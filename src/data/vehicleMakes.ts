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
//
// All caps: vehicleModel (free text) forces uppercase as it's typed, so a
// mixed-case make list sitting right next to it read as inconsistent. The
// make question also carries `uppercase: true` (see questions.ts) so a
// free-typed entry that isn't in this list still comes out the same way.
const TOP_MAKE_NAMES = ['Toyota', 'Ford', 'Chevrolet', 'Honda', 'Nissan', 'Jeep', 'Hyundai', 'Kia', 'Subaru', 'GMC']
  .map((make) => make.toUpperCase())
  .sort((a, b) => a.localeCompare(b));

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
]
  .map((make) => make.toUpperCase())
  .sort((a, b) => a.localeCompare(b));

const toOptions = (names: string[]): SelectOption[] => names.map((make) => ({ value: make, label: make }));

export const VEHICLE_MAKE_GROUPS: ComboboxGroup[] = [
  { label: 'Most common', options: toOptions(TOP_MAKE_NAMES) },
  {
    label: 'All makes',
    options: [...toOptions(OTHER_MAKE_NAMES), { value: 'OTHER / NOT LISTED', label: 'OTHER / NOT LISTED' }],
  },
];
