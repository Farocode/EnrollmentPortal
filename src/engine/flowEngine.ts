import type { Answers, FlowContext, FlowStepResult, QuestionNode } from './types';

/**
 * Walks an ordered list of question nodes and returns the next one that
 * should be shown, given the answers collected so far. Nodes whose
 * condition evaluates false are recorded as "skipped" (fired past, never
 * asked) rather than silently disappearing — the XML compiler needs that
 * distinction from "asked but left blank".
 */
export function getNextStep(
  nodes: QuestionNode[],
  answers: Answers,
  ctx: FlowContext
): FlowStepResult {
  const skippedIds: string[] = [];

  for (const node of nodes) {
    if (node.id in answers) continue; // already answered

    const eligible = node.condition ? node.condition(answers, ctx) : true;
    if (!eligible) {
      skippedIds.push(node.id);
      continue;
    }
    return { node, skippedIds };
  }

  return { node: null, skippedIds };
}

/** All node ids that are eligible to have fired given the current answers,
 * used at the end of the flow to compute the full skipped set (not just
 * the ones passed over on the way to the last question). */
export function computeSkippedIds(nodes: QuestionNode[], answers: Answers, ctx: FlowContext): string[] {
  return nodes
    .filter((n) => !(n.id in answers))
    .filter((n) => (n.condition ? !n.condition(answers, ctx) : false))
    .map((n) => n.id);
}

/** The ordered list of node ids that were actually asked and answered —
 * i.e. the branch path taken through the graph. */
export function computeBranchPath(nodes: QuestionNode[], answers: Answers): string[] {
  return nodes.filter((n) => n.id in answers).map((n) => n.id);
}
