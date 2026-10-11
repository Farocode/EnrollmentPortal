import type { QuestionNode } from '../engine/types';
import { NAME_CHAR, ADDRESS_CHAR, validateEmail, formatPhone, validatePhone, validateVehicleYear, validateNotFutureDate } from '../engine/validators';
import { VEHICLE_MAKE_GROUPS } from './vehicleMakes';

// Sample flow from the spec, in default order. The engine walks this array
// and skips any node whose condition evaluates false — that's how the
// rideshare branch, street-parking follow-up, lapse-duration follow-up,
// and the config-driven SR-22 disclosure all work without a separate
// graph structure.
//
// Every node carries a `shortLabel` — the title shown in the progress
// sidebar (e.g. "Name") instead of the full conversational `prompt`
// ("What's your name?"). The sidebar rail is narrow and the full phrasing
// reads as noise once you already know what's behind it; the full prompt
// is still available as a hover title on the row.
export const QUESTIONS: QuestionNode[] = [
  { id: 'zip', section: 'applicant', type: 'text', prompt: "What's your ZIP code?", shortLabel: 'ZIP code' },
  { id: 'location', section: 'applicant', type: 'location', prompt: 'Is this right?', shortLabel: 'Location' },
  {
    id: 'fullName',
    section: 'applicant',
    type: 'fieldGroup',
    prompt: "What's your name?",
    shortLabel: 'Name',
    helpText: 'Split into separate fields so it matches cleanly downstream.',
    fields: [
      { id: 'first', label: 'First name', type: 'text', required: true, uppercase: true, charPattern: NAME_CHAR, maxLength: 40 },
      { id: 'middle', label: 'Middle name', type: 'text', required: false, uppercase: true, charPattern: NAME_CHAR, maxLength: 40 },
      { id: 'last', label: 'Last name', type: 'text', required: true, uppercase: true, charPattern: NAME_CHAR, maxLength: 40 },
      {
        id: 'suffix',
        label: 'Suffix',
        type: 'select',
        required: false,
        options: [
          { value: '', label: 'None' },
          { value: 'jr', label: 'Jr.' },
          { value: 'sr', label: 'Sr.' },
          { value: 'ii', label: 'II' },
          { value: 'iii', label: 'III' },
          { value: 'iv', label: 'IV' },
        ],
      },
    ],
  },
  {
    id: 'applicantDetails',
    section: 'applicant',
    type: 'fieldGroup',
    prompt: 'A little about you',
    shortLabel: 'About you',
    helpText: 'Used to pull a credit-based insurance score and verify identity on real applications — kept light here.',
    fields: [
      {
        id: 'gender',
        label: 'Gender',
        type: 'select',
        required: false,
        helpText: "Same as on your driver's license.",
        options: [
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' },
        ],
      },
      {
        id: 'maritalStatus',
        label: 'Marital status',
        type: 'select',
        required: true,
        options: [
          { value: 'single', label: 'Single' },
          { value: 'married', label: 'Married' },
          { value: 'domesticPartnership', label: 'Domestic partnership' },
          { value: 'divorced', label: 'Divorced' },
          { value: 'widowed', label: 'Widowed' },
        ],
      },
      { id: 'dob', label: 'Date of birth', type: 'date', required: true, validate: validateNotFutureDate },
    ],
  },
  {
    // Phone + email grouped into one card rather than two atomic
    // questions — the UX-backlog "card-based grouping" idea, scoped to
    // exactly what the spec named as its example ("a phone card"). Reuses
    // the same formatPhone/validatePhone/validateEmail hooks the two
    // separate questions used before, now wired through
    // RepeatingFieldDef's `format`/`validate` instead of QuestionNode's.
    id: 'contactInfo',
    section: 'applicant',
    type: 'fieldGroup',
    prompt: "What's the best way to reach you?",
    shortLabel: 'Contact information',
    fields: [
      {
        id: 'phone',
        label: 'Phone number',
        type: 'text',
        required: true,
        placeholder: '000-000-0000',
        format: formatPhone,
        validate: validatePhone,
      },
      { id: 'email', label: 'Email address', type: 'text', required: true, maxLength: 254, validate: validateEmail },
    ],
  },
  {
    id: 'address',
    section: 'applicant',
    type: 'text',
    prompt: "What's your street address?",
    shortLabel: 'Address',
    charPattern: ADDRESS_CHAR,
    maxLength: 100,
    uppercase: true,
  },
  {
    id: 'homeOwnership',
    section: 'applicant',
    type: 'select',
    prompt: 'Do you own or rent your home?',
    shortLabel: 'Home ownership',
    helpText: 'Homeowners (including condo owners) often qualify for a bundling discount.',
    options: [
      { value: 'own_home', label: 'Own a home' },
      { value: 'own_condo', label: 'Own a condo' },
      { value: 'rent', label: 'Rent' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    id: 'householdDrivers',
    section: 'applicant',
    type: 'repeatingGroup',
    prompt: 'Does anyone else in your household drive, or drive this car regularly?',
    shortLabel: 'Household drivers',
    helpText: "Add each person — name, relation, and date of birth. It's fine to add none.",
    required: false,
    listHeading: 'Household members added',
    addButtonText: '+ Add household member',
    fields: [
      { id: 'firstName', label: 'First name', type: 'text', required: true, uppercase: true },
      { id: 'lastName', label: 'Last name', type: 'text', required: true, uppercase: true },
      {
        id: 'relation',
        label: 'Relation to you',
        type: 'select',
        required: true,
        options: [
          { value: 'spouse', label: 'Spouse' },
          { value: 'child', label: 'Child' },
          { value: 'parent', label: 'Parent' },
          { value: 'sibling', label: 'Sibling' },
          { value: 'grandparent', label: 'Grandparent' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        id: 'gender',
        label: 'Gender',
        type: 'select',
        required: false,
        helpText: "Same as on your driver's license.",
        options: [
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' },
        ],
      },
      { id: 'dob', label: 'Date of birth', type: 'date', required: true, validate: validateNotFutureDate },
    ],
  },

  {
    id: 'vehicleYear',
    section: 'vehicle',
    type: 'number',
    prompt: 'What year is your vehicle?',
    shortLabel: 'Vehicle year',
    validate: validateVehicleYear,
  },
  {
    id: 'vehicleMake',
    section: 'vehicle',
    // Switched from a plain <select> (one long undifferentiated list) to
    // a filterable combobox, grouped "Most common" + "All makes" (see
    // vehicleMakes.ts) — user feedback: a flat dropdown of ~30 makes was
    // unwieldy, wanted a text field with a dropdown, alphabetized, with
    // the handful of highest-volume brands surfaced first.
    type: 'combobox',
    prompt: 'What make?',
    shortLabel: 'Vehicle make',
    optionGroups: VEHICLE_MAKE_GROUPS,
    // The list itself is now all caps (see vehicleMakes.ts) to match
    // vehicleModel's forced-uppercase text entry; this covers a
    // free-typed make that isn't in the list, so it comes out the same way.
    uppercase: true,
  },
  { id: 'vehicleModel', section: 'vehicle', type: 'text', prompt: 'What model?', shortLabel: 'Vehicle model', maxLength: 60, uppercase: true },
  {
    id: 'vehicleOwnership',
    section: 'vehicle',
    type: 'select',
    prompt: "What's your ownership status on the vehicle?",
    shortLabel: 'Vehicle ownership',
    options: [
      { value: 'owned', label: 'Owned outright' },
      { value: 'financed', label: 'Financed' },
      { value: 'leased', label: 'Leased' },
    ],
  },
  {
    id: 'parkingLocation',
    section: 'vehicle',
    type: 'select',
    prompt: 'Where is it usually parked overnight?',
    shortLabel: 'Where parked',
    options: [
      { value: 'garage', label: 'Garage' },
      { value: 'driveway', label: 'Driveway' },
      { value: 'street', label: 'Street' },
    ],
  },
  {
    id: 'streetParkingDetail',
    section: 'vehicle',
    type: 'text',
    prompt: 'Roughly which block or intersection?',
    shortLabel: 'Parking detail',
    condition: (a) => a.parkingLocation === 'street',
    uppercase: true,
  },
  {
    id: 'garagedAtHome',
    section: 'vehicle',
    type: 'boolean',
    prompt: 'Is the vehicle kept overnight at the address you gave earlier?',
    shortLabel: 'Garaging',
    helpText: 'Garaging location affects rates via local accident/theft statistics — only asked separately when it differs from your own address.',
  },
  {
    id: 'garageAddress',
    section: 'vehicle',
    type: 'text',
    prompt: "What's the address where it's actually kept?",
    shortLabel: 'Garage address',
    condition: (a) => a.garagedAtHome === false,
    charPattern: ADDRESS_CHAR,
    maxLength: 100,
    uppercase: true,
  },

  {
    id: 'annualMileage',
    section: 'coverage',
    type: 'number',
    prompt: 'About how many miles do you drive per year?',
    shortLabel: 'Annual mileage',
    helpText: "Not sure? Rough guide: under 7,500 is light, around 12,000 is the national average, 12,000–15,000 is heavier use, and 15,000+ often means rideshare/delivery or other commercial driving.",
    // People habitually type thousands separators here ("12,000") — let
    // them. Stripped back out to a plain number before it's stored/
    // compiled into XML (see App.tsx submitDraft); re-added with
    // toLocaleString() wherever the stored number is displayed, so the
    // front end always shows it comma-grouped the way they'd expect.
    charPattern: /[0-9,]/,
  },
  {
    id: 'lowMileageDiscount',
    section: 'coverage',
    type: 'boolean',
    prompt: 'That qualifies for a low-mileage discount — want us to apply it?',
    shortLabel: 'Low-mileage discount',
    condition: (a) => typeof a.annualMileage === 'number' && (a.annualMileage as number) < 7500,
  },
  {
    id: 'primaryUse',
    section: 'coverage',
    type: 'select',
    prompt: 'What do you mainly use the vehicle for?',
    shortLabel: 'Primary use',
    options: [
      { value: 'commute', label: 'Commuting to work/school' },
      { value: 'pleasure', label: 'Pleasure / personal use' },
      { value: 'rideshare', label: 'Rideshare or delivery driving' },
    ],
  },
  // --- rideshare sub-flow: a real branch, not just a hidden field ---
  {
    id: 'rideshareCompany',
    section: 'coverage',
    type: 'select',
    prompt: 'Which platform(s) do you drive for?',
    shortLabel: 'Rideshare platform',
    options: [
      { value: 'uber', label: 'Uber' },
      { value: 'lyft', label: 'Lyft' },
      { value: 'other', label: 'Other' },
    ],
    condition: (a) => a.primaryUse === 'rideshare',
  },
  {
    id: 'rideshareHoursPerWeek',
    section: 'coverage',
    type: 'number',
    prompt: 'About how many hours a week do you drive for the platform?',
    shortLabel: 'Rideshare hours',
    condition: (a) => a.primaryUse === 'rideshare',
  },
  // --- end rideshare sub-flow ---
  {
    id: 'drivingRecord',
    section: 'coverage',
    type: 'repeatingGroup',
    prompt: 'Any accidents or violations in the past 3–5 years?',
    shortLabel: 'Driving record',
    helpText: "Add each one — type, date, and a brief description. It's fine to add none.",
    required: false,
    listHeading: 'Incidents added',
    addButtonText: '+ Add incident',
    fields: [
      {
        id: 'incidentType',
        label: 'Type',
        type: 'select',
        required: true,
        options: [
          { value: 'at_fault_accident', label: 'At-fault accident' },
          { value: 'moving_violation', label: 'Moving violation' },
          { value: 'major_infraction', label: 'Major infraction (e.g. DUI)' },
        ],
      },
      { id: 'date', label: 'Date', type: 'date', required: true },
      { id: 'description', label: 'Brief description', type: 'text', required: false, maxLength: 120 },
    ],
  },
  {
    id: 'priorInsuranceStatus',
    section: 'coverage',
    type: 'select',
    prompt: 'Have you had continuous auto insurance coverage?',
    shortLabel: 'Insurance history',
    options: [
      { value: 'continuous', label: 'Yes, continuously' },
      { value: 'lapsed', label: 'I had a lapse' },
      { value: 'none', label: "I've never had my own policy" },
    ],
  },
  {
    id: 'lapseDuration',
    section: 'coverage',
    type: 'select',
    prompt: 'How long was the lapse?',
    shortLabel: 'Lapse duration',
    options: [
      { value: 'lt30', label: 'Less than 30 days' },
      { value: '30to90', label: '30–90 days' },
      { value: 'gt90', label: 'More than 90 days' },
    ],
    condition: (a) => a.priorInsuranceStatus === 'lapsed',
  },
  {
    id: 'sr22Required',
    section: 'stateDisclosures',
    type: 'boolean',
    prompt: 'Does your state require an SR-22 filing for you?',
    shortLabel: 'SR-22 disclosure',
    helpText:
      "An SR-22 isn't insurance itself — it's a certificate your insurer files with the state proving you carry at least the state's minimum coverage. States typically require it after things like a DUI, an at-fault accident while uninsured, or a license suspension.",
    condition: (_a, ctx) => Boolean(ctx.stateConfig?.extraDisclosures.includes('sr22_disclosure')),
  },
];

// --- PLACEHOLDERS -----------------------------------------------------
// Not wired into QUESTIONS yet — parked here as a reminder of known gaps
// in the sample flow, called out but not resolved in the spec:
//   - VIN as an alternative to year/make/model entry
//   - Prior carrier name (only lapse status/duration are asked today)
// TODO: flesh these out and splice into QUESTIONS when the flow expands
// past the sample set.
