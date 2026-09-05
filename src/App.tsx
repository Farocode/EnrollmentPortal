import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { QUESTIONS } from './data/questions';
import { STATE_CONFIG } from './data/stateConfig';
import { lookupZip } from './data/zipLookup';
import { getNextStep } from './engine/flowEngine';
import { compileXml } from './engine/xmlCompiler';
import { highlightXml } from './engine/xmlHighlight';
import { DateSegmentedInput } from './components/DateSegmentedInput';
import { stripToPattern, titleCase } from './engine/validators';
import type { Answers, FlowContext, RepeatingFieldDef } from './engine/types';

function useFlowContext(answers: Answers): FlowContext {
  return useMemo(() => {
    const zip = typeof answers.zip === 'string' ? answers.zip : '';
    const loc = zip ? lookupZip(zip) : null;
    const state = (answers.state as string | undefined) ?? loc?.state;
    const city = (answers.city as string | undefined) ?? loc?.city;
    return { state, city, stateConfig: state ? STATE_CONFIG[state] : undefined };
  }, [answers]);
}

// Drop every answer from `id` onward, so that node becomes the next
// question asked again. Used by both "Back" (id = the last-answered node)
// and "jump to this question" from the overview panel.
function truncateAt(answers: Answers, id: string): Answers {
  const cutIndex = QUESTIONS.findIndex((q) => q.id === id);
  if (cutIndex === -1) return answers;
  const kept: Answers = {};
  for (let i = 0; i < cutIndex; i++) {
    const q = QUESTIONS[i];
    if (q.id in answers) kept[q.id] = answers[q.id];
  }
  return kept;
}

function formatValue(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.length === 0 ? 'None added' : `${v.length} added`;
  return String(v);
}

// Friendly display for one subfield of a repeating-group entry (used on
// the summary card) — dates render as MM/DD/YYYY instead of raw ISO, and
// select values render their label instead of their stored value.
function formatEntryField(field: RepeatingFieldDef, value: string): string {
  if (!value) return '';
  if (field.type === 'date') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  }
  if (field.type === 'select') {
    return field.options?.find((o) => o.value === value)?.label ?? value;
  }
  return value;
}

type RepeatingEntry = Record<string, string>;

// A fresh entry/fieldGroup draft with every declared subfield present (even
// as ''), so the compiled XML always includes every field the schema
// declares rather than only the ones the user happened to touch.
function emptyEntry(fields?: RepeatingFieldDef[]): RepeatingEntry {
  return Object.fromEntries((fields ?? []).map((f) => [f.id, '']));
}

// Shared per-subfield transform for repeatingGroup entries and fieldGroup
// fields alike: strip disallowed characters, force-uppercase, then clamp
// length — same order used for top-level text questions.
function applyFieldTransform(field: RepeatingFieldDef, raw: string): string {
  let v = raw;
  if (field.charPattern) v = stripToPattern(v, field.charPattern);
  if (field.uppercase) v = v.toUpperCase();
  if (field.maxLength) v = v.slice(0, field.maxLength);
  return v;
}

export default function App() {
  const [answers, setAnswers] = useState<Answers>({});
  const [draft, setDraft] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showOverview, setShowOverview] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // repeatingGroup-only local state
  const [groupEntries, setGroupEntries] = useState<RepeatingEntry[]>([]);
  const [groupDraft, setGroupDraft] = useState<RepeatingEntry>({});
  const [showAddForm, setShowAddForm] = useState(false);

  // fieldGroup-only local state (one fixed entry, no add/remove)
  const [fieldGroupDraft, setFieldGroupDraft] = useState<RepeatingEntry>({});

  // location-only local state — controlled inputs so the live capitalization
  // transforms actually show as you type (defaultValue wouldn't reflect it)
  const [locationDraft, setLocationDraft] = useState<{ city: string; state: string }>({ city: '', state: '' });

  const ctx = useFlowContext(answers);
  const { node, skippedIds } = getNextStep(QUESTIONS, answers, ctx);

  // Reset the repeating-group / fieldGroup / location scratch state
  // whenever we land on a fresh (or re-edited) node of that type.
  useEffect(() => {
    if (node?.type === 'repeatingGroup') {
      setGroupEntries([]);
      setGroupDraft(emptyEntry(node.fields));
      setShowAddForm(false);
    }
    if (node?.type === 'fieldGroup') {
      setFieldGroupDraft(emptyEntry(node.fields));
    }
    if (node?.type === 'location') {
      setLocationDraft({ city: ctx.city ?? '', state: ctx.state ?? '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id]);

  const answeredIds = QUESTIONS.filter((q) => q.id in answers).map((q) => q.id);
  const answeredCount = answeredIds.length;

  function commit(value: unknown) {
    if (!node) return;
    setAnswers((prev) => ({ ...prev, [node.id]: value }));
    setDraft('');
    setError(null);
  }

  function goBack() {
    if (answeredIds.length === 0) return;
    const lastId = answeredIds[answeredIds.length - 1];
    setAnswers((prev) => truncateAt(prev, lastId));
    setDraft('');
    setError(null);
  }

  function jumpTo(id: string) {
    setAnswers((prev) => truncateAt(prev, id));
    setDraft('');
    setError(null);
    setShowOverview(false);
  }

  function resetAll() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setAnswers({});
    setDraft('');
    setError(null);
    setConfirmReset(false);
    setShowOverview(false);
  }

  function handleDraftChange(raw: string) {
    if (!node) return;
    let v = raw;
    if (node.charPattern) v = v.split('').filter((ch) => node.charPattern!.test(ch)).join('');
    if (node.uppercase) v = v.toUpperCase();
    if (node.maxLength) v = v.slice(0, node.maxLength);
    if (node.format) v = node.format(v);
    setDraft(v);
    setError(null);
  }

  function handleGroupFieldChange(field: RepeatingFieldDef, raw: string) {
    setGroupDraft((prev) => ({ ...prev, [field.id]: applyFieldTransform(field, raw) }));
  }

  function handleFieldGroupChange(field: RepeatingFieldDef, raw: string) {
    setFieldGroupDraft((prev) => ({ ...prev, [field.id]: applyFieldTransform(field, raw) }));
  }

  function confirmLocation() {
    if (!node) return;
    setAnswers((prev) => ({ ...prev, city: locationDraft.city, state: locationDraft.state, [node.id]: true }));
    setDraft('');
    setError(null);
  }

  function submitDraft() {
    if (!node) return;
    if (draft.trim() === '') return;
    if (node.validate) {
      const err = node.validate(draft);
      if (err) {
        setError(err);
        return;
      }
    }
    commit(node.type === 'number' ? Number(draft) : draft);
  }

  const topBar = (
    <div className="top-bar">
      <button className="link-button" onClick={goBack} disabled={answeredCount === 0}>
        ← Back
      </button>
      <button className="link-button" onClick={() => setShowOverview((s) => !s)}>
        {showOverview ? 'Hide question list' : 'Show question list'}
      </button>
      <button className="link-button danger" onClick={resetAll}>
        {confirmReset ? 'Click again to confirm' : 'Start over'}
      </button>
    </div>
  );

  const overviewPanel = showOverview && (
    <div className="overview">
      {QUESTIONS.map((q) => {
        const isAnswered = q.id in answers;
        const isSkippedSoFar = !isAnswered && q.condition && !q.condition(answers, ctx);
        const isCurrent = node?.id === q.id;
        const displayValue =
          q.type === 'fieldGroup' && q.fields
            ? q.fields
                .map((f) => formatEntryField(f, (answers[q.id] as RepeatingEntry | undefined)?.[f.id] ?? ''))
                .filter(Boolean)
                .join(' ')
            : formatValue(answers[q.id]);
        return (
          <div
            key={q.id}
            className={`overview-row${isCurrent ? ' current' : ''}${isSkippedSoFar ? ' skipped' : ''}`}
          >
            <span className="overview-prompt">{q.prompt}</span>
            {isAnswered ? (
              <>
                <span className="overview-status">{displayValue}</span>
                <button className="link-button" onClick={() => jumpTo(q.id)}>
                  Edit
                </button>
              </>
            ) : isSkippedSoFar ? (
              <span className="overview-status muted">Not needed (so far)</span>
            ) : isCurrent ? (
              <span className="overview-status">Up next</span>
            ) : (
              <span className="overview-status muted">Not reached yet</span>
            )}
          </div>
        );
      })}
    </div>
  );

  if (!node) {
    const xml = compileXml(QUESTIONS, answers, ctx);
    return (
      <div className="shell">
        {topBar}
        {overviewPanel}
        <h1>All done</h1>
        <p>Here's the handoff document that would go downstream:</p>
        <pre className="xml-output">
          <code dangerouslySetInnerHTML={{ __html: highlightXml(xml) }} />
        </pre>
        <button
          onClick={() => {
            const blob = new Blob([xml], { type: 'application/xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'enrollment.xml';
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download XML
        </button>
      </div>
    );
  }

  const groupFieldsComplete =
    node.type === 'repeatingGroup' &&
    (node.fields ?? []).every((f) => !f.required || (groupDraft[f.id] ?? '').trim() !== '');

  const fieldGroupComplete =
    node.type === 'fieldGroup' &&
    (node.fields ?? []).every((f) => !f.required || (fieldGroupDraft[f.id] ?? '').trim() !== '');

  return (
    <div className="shell">
      {topBar}
      {overviewPanel}
      <div className="progress">{answeredCount + 1} of ~{QUESTIONS.length}</div>
      <h1>{node.prompt}</h1>
      {node.helpText && <p className="help">{node.helpText}</p>}

      {node.type === 'location' && (
        <form
          className="location-confirm"
          onSubmit={(e) => {
            e.preventDefault();
            confirmLocation();
          }}
        >
          <p>
            {ctx.city
              ? `${ctx.city}, ${ctx.state}`
              : 'ZIP not recognized in this demo — enter manually below.'}
          </p>
          <label>
            City
            <input
              value={locationDraft.city}
              onChange={(e) => setLocationDraft((prev) => ({ ...prev, city: titleCase(e.target.value) }))}
            />
          </label>
          <label>
            State
            <input
              value={locationDraft.state}
              maxLength={2}
              onChange={(e) => setLocationDraft((prev) => ({ ...prev, state: e.target.value.toUpperCase() }))}
            />
          </label>
          <button type="submit">Looks right</button>
        </form>
      )}

      {(node.type === 'text' || node.type === 'number') && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitDraft();
          }}
        >
          <input
            autoFocus
            type={node.type === 'number' ? 'number' : 'text'}
            maxLength={node.maxLength}
            placeholder={node.placeholder}
            value={draft}
            onChange={(e) => handleDraftChange(e.target.value)}
          />
          <button type="submit">Next</button>
        </form>
      )}

      {node.type === 'fieldGroup' && (
        <div className="field-group">
          {node.fields?.map((f) => (
            <label key={f.id}>
              {f.label}
              {f.type === 'select' ? (
                <select
                  value={fieldGroupDraft[f.id] ?? ''}
                  onChange={(e) => handleFieldGroupChange(f, e.target.value)}
                >
                  {f.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  maxLength={f.maxLength}
                  value={fieldGroupDraft[f.id] ?? ''}
                  onChange={(e) => handleFieldGroupChange(f, e.target.value)}
                />
              )}
            </label>
          ))}
          <div className="button-row">
            <button disabled={!fieldGroupComplete} onClick={() => commit(fieldGroupDraft)}>
              Next
            </button>
          </div>
        </div>
      )}
      {error && <p className="field-error">{error}</p>}

      {node.type === 'boolean' && (
        <div className="button-row">
          <button onClick={() => commit(true)}>Yes</button>
          <button onClick={() => commit(false)}>No</button>
        </div>
      )}

      {node.type === 'select' && (
        <div className="button-row">
          {node.options?.map((opt) => (
            <button key={opt.value} onClick={() => commit(opt.value)}>
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {node.type === 'repeatingGroup' && (
        <div className="repeating-group">
          <h3 className="repeating-heading">Household members added</h3>

          {groupEntries.length > 0 ? (
            <div className="repeating-entries">
              {groupEntries.map((entry, idx) => (
                <div key={idx} className="repeating-entry-card">
                  <span>
                    {node.fields
                      ?.map((f) => formatEntryField(f, entry[f.id]))
                      .filter(Boolean)
                      .join(' — ')}
                  </span>
                  <button
                    className="link-button"
                    onClick={() => setGroupEntries((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            !showAddForm && <p className="help">None added yet.</p>
          )}

          {showAddForm ? (
            <div className="repeating-add-form">
              {node.fields?.map((f) => (
                <label key={f.id}>
                  {f.label}
                  {f.type === 'date' && (
                    <DateSegmentedInput
                      value={groupDraft[f.id] ?? ''}
                      onChange={(iso) => setGroupDraft((prev) => ({ ...prev, [f.id]: iso }))}
                    />
                  )}
                  {f.type === 'select' && (
                    <select
                      value={groupDraft[f.id] ?? ''}
                      onChange={(e) => handleGroupFieldChange(f, e.target.value)}
                    >
                      <option value="" disabled>
                        Select…
                      </option>
                      {f.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {f.type === 'text' && (
                    <input
                      type="text"
                      value={groupDraft[f.id] ?? ''}
                      onChange={(e) => handleGroupFieldChange(f, e.target.value)}
                    />
                  )}
                </label>
              ))}
              <div className="button-row">
                <button
                  disabled={!groupFieldsComplete}
                  onClick={() => {
                    setGroupEntries((prev) => [...prev, groupDraft]);
                    setGroupDraft(emptyEntry(node.fields));
                    setShowAddForm(false);
                  }}
                >
                  Add
                </button>
                <button
                  className="link-button"
                  onClick={() => {
                    setGroupDraft(emptyEntry(node.fields));
                    setShowAddForm(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddForm(true)}>+ Add household member</button>
          )}

          <div className="button-row">
            <button onClick={() => commit(groupEntries)}>Continue</button>
          </div>
        </div>
      )}

      {skippedIds.length > 0 && (
        <p className="skip-note">
          (skipped so far: {skippedIds.join(', ')})
        </p>
      )}
    </div>
  );
}
