// Core types for the adaptive question-graph engine.
// Condition syntax is intentionally a plain JS predicate for now (spec: "not finalized").

export type Answers = Record<string, unknown>;

export interface StateConfig {
  minimums: {
    bodilyInjuryPerPerson: number;
    bodilyInjuryPerAccident: number;
    propertyDamage: number;
  };
  requiresUMUIM: boolean;
  noFault: boolean;
  costOfLivingFactor: number;
  extraDisclosures: string[];
}

export type StateConfigMap = Record<string, StateConfig>;

export interface FlowContext {
  state?: string;
  city?: string;
  stateConfig?: StateConfig;
}

export type FieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'combobox'
  | 'location'
  | 'repeatingGroup'
  | 'fieldGroup';

export interface SelectOption {
  value: string;
  label: string;
}

// A labeled section of options inside a 'combobox' question (e.g. "Most
// common" vs. "All makes") — the component filters and flattens across
// every group as the user types, but shows them under their own headings
// when the field is empty/unfiltered.
export interface ComboboxGroup {
  label: string;
  options: SelectOption[];
}

export type Section = 'applicant' | 'vehicle' | 'coverage' | 'stateDisclosures';

// A subfield inside a repeatingGroup entry (e.g. one household driver's
// First name / Last name / Date of birth) or a fieldGroup's fixed set of
// fields (e.g. First / Middle / Last / Suffix name split).
export type RepeatingFieldType = 'text' | 'date' | 'select';

export interface RepeatingFieldDef {
  id: string;
  label: string;
  type: RepeatingFieldType;
  required?: boolean;
  // Small note rendered under the field itself (e.g. "Same as on your
  // driver's license") — distinct from QuestionNode.helpText, which
  // applies to the whole question/card rather than one field inside it.
  helpText?: string;
  options?: SelectOption[]; // 'select' only
  uppercase?: boolean; // 'text' only — force-uppercase as typed
  maxLength?: number; // 'text' only
  charPattern?: RegExp; // 'text' only — disallowed characters are stripped as typed
  // Transforms raw typed input into the displayed value, e.g. phone number
  // auto-formatting to 000-000-0000 as digits are typed — same purpose as
  // QuestionNode.format, mirrored here so a 'text' field inside a
  // repeatingGroup/fieldGroup (e.g. a phone field in a contact-info card)
  // can use the same live-formatting behavior a top-level question gets.
  format?: (raw: string) => string; // 'text' only
  placeholder?: string; // 'text' only — grey hint text inside an empty input
  // Final check run before the entry/fieldGroup can be added. Return an
  // error string to block it, or null if the value is valid. Only
  // consulted once the field has a value — leave required-ness to
  // `required` so an empty optional field doesn't also have to pass this.
  validate?: (value: string) => string | null;
}

export interface QuestionNode {
  id: string;
  section: Section;
  prompt: string;
  // Short section title shown in the progress sidebar instead of the full
  // prompt (e.g. "Contact information" for "What's the best way to reach
  // you?") — the sidebar rail is only ~280px wide, and the full phrasing
  // of a question reads as noise once you already know the answer behind
  // it. Falls back to `prompt` when omitted. The full prompt still shows
  // as a hover title on the row, so nothing's lost, just de-emphasized.
  shortLabel?: string;
  helpText?: string;
  type: FieldType;
  options?: SelectOption[];
  // 'combobox' only — grouped options (e.g. "Most common" + "All makes").
  // The text input filters/flattens across every group as typed.
  optionGroups?: ComboboxGroup[];
  // Fires only if this returns true (or is absent). Evaluated against
  // answers collected so far plus derived flow context (state/city/config).
  condition?: (answers: Answers, ctx: FlowContext) => boolean;

  // Whether the flow can advance without an answer. Defaults to true
  // (required) when omitted — matches the original build's behavior where
  // every question demanded a value. A repeatingGroup node is the
  // exception: the group itself is commonly optional (zero entries is a
  // valid answer) even though each entry's own subfields are required.
  required?: boolean;

  // --- validation, for 'text'/'number' nodes ---
  maxLength?: number;
  // Characters allowed as the user types; anything not matching is
  // stripped from the input rather than rejected on submit.
  charPattern?: RegExp;
  // Final check run on submit. Return an error string to block advancing,
  // or null if the value is valid.
  validate?: (value: string) => string | null;
  // Transforms raw typed input into the displayed value, e.g. phone
  // number auto-formatting to 000-000-0000 as digits are typed.
  format?: (raw: string) => string;
  // Force-uppercase as typed (applied before `format`, if both are set).
  uppercase?: boolean;
  // Shown as grey placeholder text inside an empty input, e.g. a format hint.
  placeholder?: string;

  // --- repeatingGroup / fieldGroup only ---
  // repeatingGroup: a list of entries the user can add/remove, each shaped
  // by these fields (e.g. household drivers). Answer stored as an array.
  // fieldGroup: one fixed entry's worth of fields shown together on a
  // single screen (e.g. First/Middle/Last/Suffix). Answer stored as a
  // plain object, not an array.
  fields?: RepeatingFieldDef[];
  // repeatingGroup only — heading shown above the list of added entries
  // (e.g. "Household members added"), and the label on the add button
  // (e.g. "+ Add household member", including the leading "+ Add "). Both
  // default to generic text in the UI when omitted, so existing nodes
  // (household drivers) keep their current copy by setting these
  // explicitly rather than relying on a shared hardcoded string.
  listHeading?: string;
  addButtonText?: string;

  // 'number' only — show the stored value with thousands separators
  // wherever it's displayed (e.g. 12,000 for annual mileage). Opt-in per
  // question so values like a vehicle year never get "2,014".
  groupThousands?: boolean;
  // fieldGroup only — lay the fields out in this many columns on wide
  // screens (collapses to one column on a phone). Fields keep their
  // declared order, so tab order and XML order stay unchanged.
  columns?: number;
}

export interface FlowStepResult {
  node: QuestionNode | null; // null => flow complete
  skippedIds: string[]; // node ids that fired past but never matched their condition
}
