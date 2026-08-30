import type { StateConfigMap } from '../engine/types';

// Three example states, chosen to cover distinct shapes of requirement:
//   CA — high minimums, requires UM/UIM, has extra disclosures (incl. SR-22)
//   MI — no-fault state, no UM/UIM requirement, no extra disclosures
//   TX — plain baseline state, nothing special
// Adding a new state means adding an entry here — flow/question logic
// never references a state code directly, only stateConfig.extraDisclosures.
export const STATE_CONFIG: StateConfigMap = {
  CA: {
    minimums: { bodilyInjuryPerPerson: 15000, bodilyInjuryPerAccident: 30000, propertyDamage: 5000 },
    requiresUMUIM: true,
    noFault: false,
    costOfLivingFactor: 1.28,
    extraDisclosures: ['sr22_disclosure', 'ca_prop103_notice'],
  },
  MI: {
    minimums: { bodilyInjuryPerPerson: 250000, bodilyInjuryPerAccident: 500000, propertyDamage: 10000 },
    requiresUMUIM: false,
    noFault: true,
    costOfLivingFactor: 1.05,
    extraDisclosures: [],
  },
  TX: {
    minimums: { bodilyInjuryPerPerson: 30000, bodilyInjuryPerAccident: 60000, propertyDamage: 25000 },
    requiresUMUIM: false,
    noFault: false,
    costOfLivingFactor: 1.0,
    extraDisclosures: [],
  },
};
