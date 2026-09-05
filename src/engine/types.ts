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

export type FieldType = 'text' | 'number' | 'boolean' | 'select' | 'location' | 'repeatingGroup';

export interface SelectOption {
  value: string;
  label: string;
}

export type Section = 'applicant' | 'vehicle' | 'coverage' | 'stateDisclosures';

// A subfield inside a repeatingGroup entry (e.g. one household driver's
// First name / Last name / Date of birth).
export type RepeatingFieldType = 'text' | 'date';

export interface RepeatingFieldDef {
  id: string;
  label: string;
  type: RepeatingFieldType;
  required?: boolean;
}

export interface QuestionNode {
  id: string;
  section: Section;
  prompt: string;
  helpText?: string;
  type: FieldType;
  options?: SelectOption[];
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

  // --- repeatingGroup only ---
  fields?: RepeatingFieldDef[];
}

export interface FlowStepResult {
  node: QuestionNode | null; // null => flow complete
  skippedIds: string[]; // node ids that fired past but never matched their condition
}
