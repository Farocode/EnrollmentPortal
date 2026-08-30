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

export type FieldType = 'text' | 'number' | 'boolean' | 'select' | 'location';

export interface SelectOption {
  value: string;
  label: string;
}

export type Section = 'applicant' | 'vehicle' | 'coverage' | 'stateDisclosures';

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
}

export interface FlowStepResult {
  node: QuestionNode | null; // null => flow complete
  skippedIds: string[]; // node ids that fired past but never matched their condition
}
