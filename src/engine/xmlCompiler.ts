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

  // A repeatingGroup answer (e.g. household drivers) is an array of
  // entries rather than a scalar — render each as a nested <entry>, empty
  // array still renders as an answered (not skipped) self-closing tag.
  const renderQuestion = (n: QuestionNode): string => {
    if (skipped.has(n.id)) return `    <question id="${esc(n.id)}" skipped="true"/>`;
    const value = answers[n.id];
    if (Array.isArray(value)) {
      if (value.length === 0) return `    <question id="${esc(n.id)}"/>`;
      const entries = value
        .map((item, idx) => {
          const fields = Object.entries(item as Record<string, unknown>)
            .map(([k, v]) => `        <${esc(k)}>${esc(v)}</${esc(k)}>`)
            .join('\n');
          return `      <entry index="${idx}">\n${fields}\n      </entry>`;
        })
        .join('\n');
      return `    <question id="${esc(n.id)}">\n${entries}\n    </question>`;
    }
    return `    <question id="${esc(n.id)}">${esc(value)}</question>`;
  };

  const renderSection = (section: Section, nodeList: QuestionNode[]): string => {
    const lines = nodeList
      .filter((n) => n.id in answers || skipped.has(n.id))
      .map(renderQuestion);
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
