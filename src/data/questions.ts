import type { QuestionNode } from '../engine/types';
import { NAME_CHAR, ADDRESS_CHAR, validateEmail, formatPhone, validatePhone, validateVehicleYear } from '../engine/validators';
import { VEHICLE_MAKES } from './vehicleMakes';

// Sample flow from the spec, in default order. The engine walks this array
// and skips any node whose condition evaluates false — that's how the
// rideshare branch, street-parking follow-up, lapse-duration follow-up,
// and the config-driven SR-22 disclosure all work without a separate
// graph structure.
export const QUESTIONS: QuestionNode[] = [
  { id: 'zip', section: 'applicant', type: 'text', prompt: "What's your ZIP code?" },
  { id: 'location', section: 'applicant', type: 'location', prompt: 'Is this right?' },
  {
    id: 'fullName',
    section: 'applicant',
    type: 'fieldGroup',
    prompt: "What's your name?",
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
    id: 'phone',
    section: 'applicant',
    type: 'text',
    prompt: "What's the best phone number to reach you?",
    placeholder: '000-000-0000',
    format: formatPhone,
    validate: validatePhone,
  },
  {
    id: 'email',
    section: 'applicant',
    type: 'text',
    prompt: "What's your email address?",
    maxLength: 254,
    validate: validateEmail,
  },
  {
    id: 'address',
    section: 'applicant',
    type: 'text',
    prompt: "What's your street address?",
    charPattern: ADDRESS_CHAR,
    maxLength: 100,
    uppercase: true,
  },
  {
    id: 'householdDrivers',
    section: 'applicant',
    type: 'repeatingGroup',
    prompt: 'Does anyone else in your household drive, or drive this car regularly?',
    helpText: "Add each person — name, relation, and date of birth. It's fine to add none.",
    required: false,
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
        options: [
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' },
          { value: 'other', label: 'Other' },
        ],
      },
      { id: 'dob', label: 'Date of birth', type: 'date', required: true },
    ],
  },

  {
    id: 'vehicleYear',
    section: 'vehicle',
    type: 'number',
    prompt: 'What year is your vehicle?',
    validate: validateVehicleYear,
  },
  {
    id: 'vehicleMake',
    section: 'vehicle',
    type: 'select',
    prompt: 'What make?',
    options: VEHICLE_MAKES,
  },
  { id: 'vehicleModel', section: 'vehicle', type: 'text', prompt: 'What model?', maxLength: 60, uppercase: true },
  {
    id: 'parkingLocation',
    section: 'vehicle',
    type: 'select',
    prompt: 'Where is it usually parked overnight?',
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
    condition: (a) => a.parkingLocation === 'street',
    uppercase: true,
  },

  { id: 'annualMileage', section: 'coverage', type: 'number', prompt: 'About how many miles do you drive per year?' },
  {
    id: 'lowMileageDiscount',
    section: 'coverage',
    type: 'boolean',
    prompt: 'That qualifies for a low-mileage discount — want us to apply it?',
    condition: (a) => typeof a.annualMileage === 'number' && (a.annualMileage as number) < 7500,
  },
  {
    id: 'primaryUse',
    section: 'coverage',
    type: 'select',
    prompt: 'What do you mainly use the vehicle for?',
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
    condition: (a) => a.primaryUse === 'rideshare',
  },
  // --- end rideshare sub-flow ---
  {
    id: 'priorInsuranceStatus',
    section: 'coverage',
    type: 'select',
    prompt: 'Have you had continuous auto insurance coverage?',
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
//   - Homeowner/renter status (sometimes a rating factor, not in spec sample)
// TODO: flesh these out and splice into QUESTIONS when the flow expands
// past the sample set.
