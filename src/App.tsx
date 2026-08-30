import { useMemo, useState } from 'react';
import './App.css';
import { QUESTIONS } from './data/questions';
import { STATE_CONFIG } from './data/stateConfig';
import { lookupZip } from './data/zipLookup';
import { getNextStep } from './engine/flowEngine';
import { compileXml } from './engine/xmlCompiler';
import type { Answers, FlowContext } from './engine/types';

function useFlowContext(answers: Answers): FlowContext {
  return useMemo(() => {
    const zip = typeof answers.zip === 'string' ? answers.zip : '';
    const loc = zip ? lookupZip(zip) : null;
    const state = (answers.state as string | undefined) ?? loc?.state;
    const city = (answers.city as string | undefined) ?? loc?.city;
    return { state, city, stateConfig: state ? STATE_CONFIG[state] : undefined };
  }, [answers]);
}

export default function App() {
  const [answers, setAnswers] = useState<Answers>({});
  const [draft, setDraft] = useState<string>('');
  const ctx = useFlowContext(answers);
  const { node } = getNextStep(QUESTIONS, answers, ctx);

  const answered = QUESTIONS.filter((q) => q.id in answers).length;

  function commit(value: unknown) {
    if (!node) return;
    setAnswers((prev) => ({ ...prev, [node.id]: value }));
    setDraft('');
  }

  if (!node) {
    const xml = compileXml(QUESTIONS, answers, ctx);
    return (
      <div className="shell">
        <h1>All done</h1>
        <p>Here's the handoff document that would go downstream:</p>
        <pre className="xml-output">{xml}</pre>
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
        <button onClick={() => setAnswers({})}>Start over</button>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="progress">{answered + 1} of ~{QUESTIONS.length}</div>
      <h1>{node.prompt}</h1>
      {node.helpText && <p className="help">{node.helpText}</p>}

      {node.type === 'location' && (
        <div className="location-confirm">
          <p>
            {ctx.city ? `${ctx.city}, ${ctx.state}` : 'ZIP not recognized in this demo — enter manually below.'}
          </p>
          <label>
            City
            <input
              defaultValue={ctx.city ?? ''}
              onChange={(e) => setAnswers((prev) => ({ ...prev, city: e.target.value }))}
            />
          </label>
          <label>
            State
            <input
              defaultValue={ctx.state ?? ''}
              onChange={(e) => setAnswers((prev) => ({ ...prev, state: e.target.value.toUpperCase() }))}
            />
          </label>
          <button onClick={() => commit(true)}>Looks right</button>
        </div>
      )}

      {(node.type === 'text' || node.type === 'number') && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim() === '') return;
            commit(node.type === 'number' ? Number(draft) : draft);
          }}
        >
          <input
            autoFocus
            type={node.type === 'number' ? 'number' : 'text'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit">Next</button>
        </form>
      )}

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
    </div>
  );
}
