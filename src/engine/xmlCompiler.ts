import type { Answers, FlowContext, QuestionNode, Section } from './types';
import { computeBranchPath, computeSkippedIds } from './flowEngine';

const SCHEMA_VERSION = '0.1.0';

function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Compiles collected answers into the XML handoff document.
 *
 * Convention (spec left this open, picking one and applying consistently):
 *   - Answered node -> <question id="...">value</question>
 *   - Skipped node (condition never matched) -> <question id="..." skipped="true"/>
 *   - There is no "answered but blank" case: the UI requires a value before
 *     advancing, so blank vs. skipped can never be ambiguous.
 */
export function compileXml(nodes: QuestionNode[], answers: Answers, ctx: FlowContext): string {
  const skipped = new Set(computeSkippedIds(nodes, answers, ctx));
  const branchPath = computeBranchPath(nodes, answers);

  const bySection: Record<Section, QuestionNode[]> = {
    applicant: [],
    vehicle: [],
    coverage: [],
    stateDisclosures: [],
  };
  for (const n of nodes) bySection[n.section].push(n);

  const renderSection = (section: Section, nodeList: QuestionNode[]): string => {
    const lines = nodeList
      .filter((n) => n.id in answers || skipped.has(n.id))
      .map((n) => {
        if (skipped.has(n.id)) return `    <question id="${esc(n.id)}" skipped="true"/>`;
        return `    <question id="${esc(n.id)}">${esc(answers[n.id])}</question>`;
      });
    if (lines.length === 0) return `  <${section}/>`;
    return `  <${section}>\n${lines.join('\n')}\n  </${section}>`;
  };

  const metadata = [
    '  <meta>',
    `    <schemaVersion>${esc(SCHEMA_VERSION)}</schemaVersion>`,
    `    <submittedAt>${esc(new Date().toISOString())}</submittedAt>`,
    `    <branchPath>${branchPath.map((id) => esc(id)).join(',')}</branchPath>`,
    '  </meta>',
  ].join('\n');

  const body = [
    metadata,
    renderSection('applicant', bySection.applicant),
    renderSection('vehicle', bySection.vehicle),
    renderSection('coverage', bySection.coverage),
    renderSection('stateDisclosures', bySection.stateDisclosures),
  ].join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<enrollment>\n${body}\n</enrollment>\n`;
}
