import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import './App.css';
import headerLogo from './assets/header-clearpath.png';
import { QUESTIONS } from './data/questions';
import { STATE_CONFIG } from './data/stateConfig';
import { resolveZip, type ZipLocation } from './data/zipLookup';
import { getNextStep } from './engine/flowEngine';
import { compileXml } from './engine/xmlCompiler';
import { highlightXml } from './engine/xmlHighlight';
import { DateSegmentedInput } from './components/DateSegmentedInput';
import { ComboboxInput } from './components/ComboboxInput';
import { stripToPattern } from './engine/validators';
import type { Answers, FlowContext, QuestionNode, RepeatingFieldDef, Section } from './engine/types';

// resolveZip() is async (a real API call), so the lookup result lives in
// its own bit of state rather than being derived synchronously the way it
// was against the old hardcoded table. `zip` on this record is which ZIP
// the status/result belongs to, so a still-in-flight request for a ZIP the
// user has since changed can be told apart from the current one.
//
// `result` is an array because a ZIP can genuinely resolve to more than
// one place (e.g. Fort Campbell, straddling the KY/TN border) — the
// overwhelming majority of the time it's a single-entry array, which is
// treated as the direct "here's your city/state" case exactly like
// before; more than one entry means the location-confirm screen needs to
// ask which one applies instead of silently picking the first.
type ZipStatus = 'idle' | 'loading' | 'done' | 'notfound' | 'error';
interface ZipResolution {
  zip: string;
  status: ZipStatus;
  result: ZipLocation[] | null;
}

function useFlowContext(answers: Answers, zipRes: ZipResolution): FlowContext {
  return useMemo(() => {
    const zip = typeof answers.zip === 'string' ? answers.zip : '';
    // Only auto-derive from a single unambiguous match — a multi-place
    // result stays undefined here until the user picks one, at which
    // point it's recorded in `answers.city`/`answers.state` directly
    // (see confirmLocation) and this branch is no longer consulted.
    const resolved =
      zip && zipRes.zip === zip && zipRes.status === 'done' && zipRes.result?.length === 1
        ? zipRes.result[0]
        : null;
    const state = (answers.state as string | undefined) ?? resolved?.state;
    const city = (answers.city as string | undefined) ?? resolved?.city;
    return { state, city, stateConfig: state ? STATE_CONFIG[state] : undefined };
  }, [answers, zipRes]);
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

// Mirrors useFlowContext's derivation, for use here outside the component
// (no hooks) when reconciling an edited answer against the question graph.
// Only needs the "already settled" case — by the time a later question is
// reachable, confirmLocation has already written city/state straight into
// answers, so there's no zip-lookup-in-flight case to account for.
function deriveCtxFromAnswers(answers: Answers): FlowContext {
  const state = answers.state as string | undefined;
  const city = answers.city as string | undefined;
  return { state, city, stateConfig: state ? STATE_CONFIG[state] : undefined };
}

// Re-editing an already-answered question used to wipe every answer after
// it unconditionally, even when the new answer couldn't possibly have
// changed anything downstream (e.g. correcting a typo in annual mileage
// after already answering 20 more questions past it) — reported as
// "clicking edit... deletes every answer underneath it." This instead
// re-walks the flow forward from the edited question with its new value,
// keeping every already-answered question the engine would still ask in
// the same spot, and only drops things starting at the first point where
// the new value actually sends the flow somewhere the old answers didn't
// cover — a newly eligible/ineligible question that wasn't part of the
// original path. `extra` covers confirmLocation, which sets more than one
// key (city/state alongside the location question's own `true`) at once.
function reconcileEdit(oldAnswers: Answers, editedId: string, newValue: unknown, extra?: Answers): Answers {
  let next: Answers = { ...truncateAt(oldAnswers, editedId), ...extra, [editedId]: newValue };

  for (let i = 0; i < QUESTIONS.length; i++) {
    const { node: upcoming } = getNextStep(QUESTIONS, next, deriveCtxFromAnswers(next));
    if (!upcoming) break;
    if (!(upcoming.id in oldAnswers)) break; // first real divergence — stop here, let the rest be re-asked
    next = { ...next, [upcoming.id]: oldAnswers[upcoming.id] };
  }
  return next;
}

function formatValue(v: unknown, q?: QuestionNode): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.length === 0 ? 'None added' : `${v.length} added`;
  // Numbers are stored plain, comma-free, for XML. Questions that opt in
  // (groupThousands, e.g. annual mileage) get separators back for display;
  // everything else — a vehicle year, say — stays as typed.
  if (typeof v === 'number') return q?.groupThousands ? v.toLocaleString() : String(v);
  return String(v);
}

// Developer aid, off for customers: add ?debug to the URL to show the
// "skipped so far" line under each question.
function isDebugMode(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('debug');
  } catch {
    return false;
  }
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

// Small orienting label above each question — branching makes a reliable
// step count impossible, but the section name still tells people where
// they are.
const SECTION_LABELS: Record<Section, string> = {
  applicant: 'About you',
  vehicle: 'Your vehicle',
  coverage: 'Coverage',
  stateDisclosures: 'State requirements',
};

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
  if (field.format) v = field.format(v);
  return v;
}

// Collapsed/expanded state for the progress sidebar is a lightweight
// per-viewer UI preference, not app data — localStorage is appropriate
// here the same way it wouldn't be for anything shared or durable. Reads
// and writes are wrapped since storage can throw or be unavailable (private
// browsing, blocked site data).
//
// This used to persist the user's last toggle choice via localStorage
// (first under one key, then a ".v2" key after the first attempt at this
// still carried over an old "closed" value). Dropped entirely: repeated
// reports made clear the actual expectation is stronger than "remember my
// last choice" — it's "always open on a fresh load or Start Over", full
// stop. So there's no stored state to read; sidebarOpen simply starts
// `true` on every mount, and Start Over re-asserts it below in resetAll()
// in case the user had closed it mid-session. The toggle still works for
// that one session — it just never outlives a reload.
//
// Manual theme override. 'light'/'dark' pin it regardless of OS setting;
// null (nothing stored, or the user never touched the switcher) means
// "follow system preference" — index.css already renders the dark palette
// under @media (prefers-color-scheme: dark) for that case, so null needs
// no [data-theme] attribute applied at all.
type ThemeChoice = 'light' | 'dark' | null;
const THEME_STORAGE_KEY = 'enrollmentPortal.theme';

function readStoredTheme(): ThemeChoice {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : null;
  } catch {
    return null;
  }
}

// The progress sidebar is a persistent, always-visible rail on a wide
// enough viewport, but on a phone it's a full-width-ish overlay (up to
// 85vw — see .progress-sidebar) that buries the actual question behind
// it — reported as "opens by default and is obtrusive" on mobile. Default
// it closed below this width; the toggle still opens it on request, it
// just doesn't start in the way.
const MOBILE_SIDEBAR_BREAKPOINT = 640;

function defaultSidebarOpen(): boolean {
  try {
    return window.innerWidth >= MOBILE_SIDEBAR_BREAKPOINT;
  } catch {
    return true;
  }
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export default function App() {
  const [answers, setAnswers] = useState<Answers>({});
  const [draft, setDraft] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(defaultSidebarOpen);
  const [theme, setTheme] = useState<ThemeChoice>(readStoredTheme);
  // Fake support widget — set dressing for the ClearPath placeholder
  // brand, same spirit as the trust badges and the footer's dead-end nav
  // links. Started as two separate launchers ("AI Assistant" vs. "Live
  // Chat"), but a real "Live Chat" button next to a real "AI Assistant"
  // button reads as a promise of a human on the other end — most people
  // would pick "Live Chat" expecting that, when it's just as scripted as
  // the other one. Collapsed into one all-in-one support entry point so
  // there's nothing to be misled by.
  const [supportWidgetOpen, setSupportWidgetOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  // Set while the user is re-answering an already-answered question via
  // "Edit" in the overview panel. While this is set, `node` below is
  // forced to that question instead of the computed frontier — answers
  // are deliberately NOT truncated at jump time anymore (see jumpTo), so
  // the rest of the chain stays intact unless/until reconcileEdit finds a
  // real divergence once the new value is actually submitted.
  const [editingId, setEditingId] = useState<string | null>(null);

  // repeatingGroup-only local state
  const [groupEntries, setGroupEntries] = useState<RepeatingEntry[]>([]);
  const [groupDraft, setGroupDraft] = useState<RepeatingEntry>({});
  const [showAddForm, setShowAddForm] = useState(false);
  // Explicit "I checked, there's nothing to add" for an optional
  // repeatingGroup (e.g. driving record). Without this, a prompt phrased
  // as "add any accidents or violations" reads as asking the user to add
  // something, with no visible signal that pressing Continue with zero
  // entries is itself a real, deliberate answer — so Continue stays
  // disabled on an empty list until the user affirms that explicitly.
  const [noneConfirmed, setNoneConfirmed] = useState(false);

  // fieldGroup-only local state (one fixed entry, no add/remove)
  const [fieldGroupDraft, setFieldGroupDraft] = useState<RepeatingEntry>({});

  // location-only local state — controlled inputs so the live capitalization
  // transforms actually show as you type (defaultValue wouldn't reflect it)
  const [locationDraft, setLocationDraft] = useState<{ city: string; state: string }>({ city: '', state: '' });

  // ZIP -> city/state lookup, now a real (async) API call instead of a
  // synchronous table read — see useFlowContext above.
  const [zipRes, setZipRes] = useState<ZipResolution>({ zip: '', status: 'idle', result: null });

  const ctx = useFlowContext(answers, zipRes);
  const frontier = getNextStep(QUESTIONS, answers, ctx);
  const node = editingId ? QUESTIONS.find((q) => q.id === editingId) ?? frontier.node : frontier.node;
  const skippedIds = frontier.skippedIds;

  // Kick off the ZIP lookup whenever the answered ZIP changes. Guarded by
  // `cancelled` so a stale response (user went Back and re-answered a
  // different ZIP before the first call returned) never overwrites a newer
  // one.
  useEffect(() => {
    const zip = typeof answers.zip === 'string' ? answers.zip.trim() : '';
    if (!zip) {
      setZipRes({ zip: '', status: 'idle', result: null });
      return;
    }
    let cancelled = false;
    setZipRes({ zip, status: 'loading', result: null });
    resolveZip(zip)
      .then((result) => {
        if (cancelled) return;
        setZipRes({ zip, status: result ? 'done' : 'notfound', result });
      })
      .catch(() => {
        if (cancelled) return;
        setZipRes({ zip, status: 'error', result: null });
      });
    return () => {
      cancelled = true;
    };
  }, [answers.zip]);

  // Apply (or clear) the explicit theme override. Setting the attribute
  // only when there's a real choice — never for null — means "system
  // preference" stays purely CSS-driven (index.css's prefers-color-scheme
  // block), so it keeps tracking a live OS-level change even without a
  // page reload; only an explicit pick pins it.
  useEffect(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => {
      // First press from "system": flip to the opposite of whatever the OS
      // is currently showing, so the one press always reads as "switch",
      // never as "pick the theme I'm already looking at."
      const next: ThemeChoice = prev ? (prev === 'dark' ? 'light' : 'dark') : systemPrefersDark() ? 'light' : 'dark';
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next ?? '');
      } catch {
        /* per-viewer convenience only — fine if storage is unavailable */
      }
      return next;
    });
  }

  // Reset the repeating-group / fieldGroup / location scratch state
  // whenever we land on a fresh (or re-edited) node of that type.
  useEffect(() => {
    if (node?.type === 'repeatingGroup') {
      setGroupEntries([]);
      setGroupDraft(emptyEntry(node.fields));
      setShowAddForm(false);
      setNoneConfirmed(false);
    }
    if (node?.type === 'fieldGroup') {
      setFieldGroupDraft(emptyEntry(node.fields));
    }
    if (node?.type === 'location') {
      setLocationDraft({ city: ctx.city ?? '', state: ctx.state ?? '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id]);

  // The ZIP lookup often resolves *after* the location screen is already
  // showing (real network round-trip vs. the old instant table read) — once
  // it comes in, fill the draft in too, but only if the user hasn't already
  // started typing over it. Only auto-fills for an unambiguous single
  // match — a multi-place result is left for the user to pick from (see
  // the zip-multi-options UI below), which fills the draft itself once a
  // choice is made.
  useEffect(() => {
    if (node?.type !== 'location') return;
    if (zipRes.status !== 'done' || !zipRes.result || zipRes.result.length !== 1) return;
    if (zipRes.zip !== answers.zip) return;
    const only = zipRes.result[0];
    setLocationDraft((prev) =>
      prev.city === '' && prev.state === '' ? { city: only.city.toUpperCase(), state: only.state } : prev
    );
  }, [zipRes, node?.type, answers.zip]);

  const answeredIds = QUESTIONS.filter((q) => q.id in answers).map((q) => q.id);
  const answeredCount = answeredIds.length;
  // Estimated length of this run: what's answered, plus every unanswered
  // question whose condition currently passes. Branch questions that
  // depend on answers not given yet (rideshare follow-ups, the lapse
  // follow-up) aren't counted until they apply, so the "~" total can tick
  // up at a branch but no longer starts out padded with questions most
  // people never see.
  const estimatedTotal = Math.max(
    answeredCount + 1,
    answeredCount +
      QUESTIONS.filter((q) => !(q.id in answers) && (!q.condition || q.condition(answers, ctx))).length
  );

  function commit(value: unknown) {
    if (!node) return;
    setAnswers((prev) => (editingId === node.id ? reconcileEdit(prev, node.id, value) : { ...prev, [node.id]: value }));
    setEditingId(null);
    setDraft('');
    setError(null);
  }

  function goBack() {
    // Mid-edit, "Back" reads as "never mind" rather than "undo an answer" —
    // nothing was changed yet, so just drop back to wherever the flow
    // actually is instead of walking the real answer chain backwards.
    if (editingId) {
      setEditingId(null);
      setDraft('');
      setError(null);
      return;
    }
    if (answeredIds.length === 0) return;
    const lastId = answeredIds[answeredIds.length - 1];
    setAnswers((prev) => truncateAt(prev, lastId));
    setDraft('');
    setError(null);
  }

  function jumpTo(id: string) {
    // Used to truncate every answer from `id` onward immediately on click
    // — reported as "clicking edit... deletes every answer underneath
    // it" even when the new answer wouldn't have changed anything past
    // it. Now nothing is touched until the edited question is actually
    // resubmitted (see commit/confirmLocation + reconcileEdit above),
    // which only clears what the new value genuinely invalidates.
    setEditingId(id);
    setDraft('');
    setError(null);
    // Used to force-close the sidebar here (and in resetAll below) — a
    // leftover from when it defaulted closed and "jump back into the
    // focused question view" meant auto-hiding the panel you'd opened to
    // get there. Now that it defaults open and persists, that read as a
    // bug: clicking "Edit" from the sidebar immediately hid the thing you
    // just clicked in. Sidebar open/closed state is the user's own
    // explicit choice now (via the toggle) — navigation shouldn't change it.
  }

  function toggleSidebar() {
    setSidebarOpen((prev) => !prev);
  }

  function resetAll() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setAnswers({});
    setEditingId(null);
    setDraft('');
    setError(null);
    setConfirmReset(false);
    // Start Over is a fresh start in every sense — re-open the sidebar
    // even if the user had closed it mid-session (but not on a phone,
    // where "fresh start" shouldn't mean "bury the first question again").
    setSidebarOpen(defaultSidebarOpen());
  }

  function handleDraftChange(raw: string) {
    if (!node) return;
    let v = raw;
    // type="number" questions switched to a text input (see render below)
    // so a field like annualMileage can allow typed thousands-separator
    // commas via its own charPattern. A number node that doesn't declare
    // one still gets the old digits-only behavior a native number input
    // enforced, rather than suddenly accepting any character.
    const pattern = node.charPattern ?? (node.type === 'number' ? /[0-9]/ : undefined);
    if (pattern) v = v.split('').filter((ch) => pattern.test(ch)).join('');
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
    setAnswers((prev) =>
      editingId === node.id
        ? reconcileEdit(prev, node.id, true, { city: locationDraft.city, state: locationDraft.state })
        : { ...prev, city: locationDraft.city, state: locationDraft.state, [node.id]: true }
    );
    setEditingId(null);
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
    // Strip any thousands-separator commas the user typed (allowed as-typed
    // via charPattern, e.g. annualMileage) before storing/compiling — the
    // stored value and the XML are always a plain number.
    commit(node.type === 'number' ? Number(draft.replace(/,/g, '')) : draft);
  }

  const siteHeader = (
    <header className="site-header">
      <img src={headerLogo} alt="ClearPath Insurance" className="site-header-logo" />
    </header>
  );

  // Same spirit as the header's trust badges — set dressing for the
  // "ClearPath Insurance" placeholder brand (explicitly a stand-in, not a
  // real company). Legal copy is generic boilerplate-flavored text, not
  // modeled on any real insurer's actual disclosures.
  //
  // Every footer link now goes somewhere real instead of being a dead
  // `href="#"` — plain static HTML pages in `public/` (not part of the
  // React app/router, there isn't one), opened with target="_blank" so
  // the app itself is never navigated away from or lost.
  const footerLink = (file: string, label: string) => (
    <a href={`${import.meta.env.BASE_URL}${file}`} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );

  // Full footer on every screen — the gag pages (Our Story, About, Jobs)
  // are meant to be findable from the application pages too.
  const siteFooter = (
    <footer className="site-footer">
      <nav className="site-footer-nav" aria-label="Footer">
        {footerLink('our-story.html', 'Our Story')}
        {footerLink('about.html', 'About ClearPath')}
        {footerLink('jobs.html', 'Jobs at ClearPath')}
        {footerLink('support.html', 'Support')}
        {footerLink('privacy.html', 'Privacy Policy')}
        {footerLink('terms.html', 'Terms of Use')}
      </nav>
      <p className="site-footer-legal">
        ClearPath Insurance Agency, LLC is a licensed insurance agency. Products and coverage availability vary by
        state and are subject to underwriting review and approval. Rates, discounts, and policy terms shown or
        described are illustrative examples only and are not a quote, binder, or offer of insurance. Coverage is
        bound only upon acceptance by an authorized insurer and issuance of a policy. This site is a demonstration
        and does not create, modify, or bind any actual insurance policy.
      </p>
      <p className="site-footer-copyright">© {new Date().getFullYear()} ClearPath Insurance Agency, LLC. All rights reserved.</p>
    </footer>
  );

  // Two floating launcher buttons (bottom-right, like a real support
  // widget) that open a small static panel — a single canned opening
  // message, a disabled-looking input, no actual send. Nothing behind it
  // is real; it's here purely to round out the "real-looking site" set
  // dressing started with the header/trust-badges/footer. One entry point
  // that covers both site help and account support, flagged as AI up
  // front rather than left ambiguous. The "talk to a person" line at the
  // bottom is deliberately a dead end, same as the footer links — it's
  // there because a real version of this would have one, not because
  // this one connects anywhere.
  const supportWidget = (
    <div className={`support-widget${sidebarOpen ? ' sidebar-open' : ''}`}>
      {supportWidgetOpen && (
        <div className="support-panel">
          <div className="support-panel-header">
            <span>✨ ClearPath Assistant</span>
            <button
              type="button"
              className="support-panel-close"
              aria-label="Close"
              onClick={() => setSupportWidgetOpen(false)}
            >
              ×
            </button>
          </div>
          <div className="support-panel-body">
            <p className="support-message">
              Hi, I'm the ClearPath Assistant — an AI, not a person. I can help with questions about this
              application or your account. Ask me anything on the page.
            </p>
          </div>
          <form className="support-panel-input-row" onSubmit={(e) => e.preventDefault()}>
            <input type="text" placeholder="Type a message…" disabled />
            <button type="submit" disabled>
              Send
            </button>
          </form>
          <button type="button" className="support-panel-escalate" disabled>
            Request a callback from a person
          </button>
        </div>
      )}
      <button
        type="button"
        className={`support-fab support-fab-highlight${supportWidgetOpen ? ' active' : ''}`}
        onClick={() => setSupportWidgetOpen((prev) => !prev)}
      >
        ✨ Support
      </button>
    </div>
  );

  const topBar = (
    <div className="top-bar">
      <button className="link-button" onClick={goBack} disabled={answeredCount === 0}>
        ← Back
      </button>
      <button className="link-button danger" onClick={resetAll}>
        {confirmReset ? 'Click again to confirm' : 'Start over'}
      </button>
    </div>
  );

  // Persistent, collapsible progress rail — replaces the old click-to-reveal
  // "Show question list" inline panel (same underlying per-question status
  // computation, same Edit/jump behavior) with a drawer that overlays the
  // content rather than pushing it down, so the centered single-column
  // layout is unchanged when the rail is closed. Open/closed state is
  // in-session only now — always starts open on a fresh load or Start
  // Over (see the comment above the sidebarOpen state's definition).
  const sidebarToggle = (
    <button
      type="button"
      className="sidebar-toggle"
      onClick={toggleSidebar}
      aria-label={sidebarOpen ? 'Hide question list' : 'Show question list'}
      aria-expanded={sidebarOpen}
    >
      {sidebarOpen ? '‹' : '☰'}
    </button>
  );

  // Starts on system preference (no stored choice => theme is null => CSS's
  // prefers-color-scheme block decides) and shows what pressing it will
  // switch to next, not just the current state, so it reads as a control
  // rather than a status light.
  const effectiveDark = theme ? theme === 'dark' : systemPrefersDark();
  const themeToggle = (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={effectiveDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme ? `Theme: ${theme} (click to switch)` : 'Theme: system default (click to switch)'}
    >
      {effectiveDark ? '☀' : '☾'}
    </button>
  );

  // Previously wrapped in a full-viewport "backdrop" div (click-outside
  // closes, modal-style) — but since the sidebar now defaults to *open*
  // and is meant to be a persistent companion panel rather than a
  // transient drawer, that backdrop sat over the entire main content area
  // (a `position: fixed` element paints above static in-flow content
  // regardless of DOM order) and closed the sidebar on literally any
  // click in the question flow — reported by the user as "keeps hiding if
  // you click anywhere in the main frame." Dropped the backdrop; the
  // toggle button is now the only way to open/close it.
  const progressSidebar = (
    <>
      <div className={`progress-sidebar${sidebarOpen ? ' open' : ''}`}>
        <h2 className="progress-sidebar-heading">Your progress</h2>
        {QUESTIONS
          // Only ever show what's actually been asked (or is being asked
          // right now) — a not-yet-reached question, and one skipped by
          // branching (e.g. rideshare follow-ups when that wasn't the
          // answer), used to sit in the list as a greyed-out "·"/"—" row.
          // User feedback: that read as clutter — hide both, same as
          // they're already excluded from the final XML's answered set.
          .filter((q) => q.id in answers || node?.id === q.id)
          .map((q) => {
            const isAnswered = q.id in answers;
            const isCurrent = node?.id === q.id;
            const displayValue =
              q.type === 'fieldGroup' && q.fields
                ? q.fields
                    .map((f) => formatEntryField(f, (answers[q.id] as RepeatingEntry | undefined)?.[f.id] ?? ''))
                    .filter(Boolean)
                    .join(' · ')
                : // confirmLocation() stores the location question's own
                  // answer as a bare `true` (it's just a confirmation
                  // step) — the actual city/state live in separate
                  // `answers.city`/`answers.state` entries. Without this,
                  // formatValue's boolean branch would show "Yes" here
                  // instead of the place the user actually confirmed.
                  q.type === 'location'
                  ? [answers.city, answers.state].filter(Boolean).join(', ')
                  : // Show the option's label ("Own a home"), not its stored
                    // value ("own_home") — same as the household cards do.
                    q.type === 'select'
                    ? (q.options?.find((o) => o.value === answers[q.id])?.label ?? formatValue(answers[q.id], q))
                    : formatValue(answers[q.id], q);
            const glyph = isAnswered ? '✓' : '●';
            return (
              <div key={q.id} className={`sidebar-row${isCurrent ? ' current' : ''}${isAnswered ? ' answered' : ''}`}>
                <span className="sidebar-row-glyph" aria-hidden="true">
                  {glyph}
                </span>
                {/* Short section title ("Name", "Contact information") rather
                    than the full conversational prompt — the full prompt is
                    still there as a hover title, just de-emphasized. */}
                <span className="sidebar-row-label" title={q.prompt}>
                  {q.shortLabel ?? q.prompt}
                  {isAnswered && <span className="sidebar-row-value"> — {displayValue}</span>}
                </span>
                {isAnswered && q.id !== editingId && (
                  <button className="link-button sidebar-row-edit" onClick={() => jumpTo(q.id)}>
                    Edit
                  </button>
                )}
              </div>
            );
          })}
      </div>
    </>
  );

  if (!node) {
    const xml = compileXml(QUESTIONS, answers, ctx);
    return (
      <>
        {siteHeader}
        {sidebarToggle}
        {themeToggle}
        {progressSidebar}
        <div className="shell">
        {topBar}
        <h1>All done</h1>
        <p className="all-done-message">
          Your application is complete. We'll let you know within 7–21 business days whether it was received.
        </p>
        <p className="xml-label">For our internal systems</p>
        <p className="help">Boring stuff, mostly for our own aging back-end — not something you need to read.</p>
        <pre className="xml-output">
          <code dangerouslySetInnerHTML={{ __html: highlightXml(xml) }} />
        </pre>
        <button
          className="btn-primary"
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
        {siteFooter}
        {supportWidget}
      </>
    );
  }

  // Per-field validation errors for the current repeatingGroup add-form
  // draft (e.g. a household member's date of birth landing in the
  // future). Only checked once a field has a value — emptiness is the
  // `required` check's job, not this one's.
  const groupDraftErrors: Record<string, string> =
    node.type === 'repeatingGroup'
      ? Object.fromEntries(
          (node.fields ?? [])
            .map((f): [string, string | null] => {
              const v = groupDraft[f.id] ?? '';
              if (!f.validate || v.trim() === '') return [f.id, null];
              return [f.id, f.validate(v)];
            })
            .filter((entry): entry is [string, string] => entry[1] !== null),
        )
      : {};

  const groupFieldsComplete =
    node.type === 'repeatingGroup' &&
    (node.fields ?? []).every((f) => !f.required || (groupDraft[f.id] ?? '').trim() !== '') &&
    Object.keys(groupDraftErrors).length === 0;

  // Mirrors groupDraftErrors above, for the fieldGroup draft (e.g. the
  // applicant's own date-of-birth card) instead of a repeatingGroup entry.
  const fieldGroupDraftErrors: Record<string, string> =
    node.type === 'fieldGroup'
      ? Object.fromEntries(
          (node.fields ?? [])
            .map((f): [string, string | null] => {
              const v = fieldGroupDraft[f.id] ?? '';
              if (!f.validate || v.trim() === '') return [f.id, null];
              return [f.id, f.validate(v)];
            })
            .filter((entry): entry is [string, string] => entry[1] !== null),
        )
      : {};

  const fieldGroupComplete =
    node.type === 'fieldGroup' &&
    (node.fields ?? []).every((f) => !f.required || (fieldGroupDraft[f.id] ?? '').trim() !== '') &&
    Object.keys(fieldGroupDraftErrors).length === 0;

  // A ZIP that genuinely resolves to more than one place (e.g. Fort
  // Campbell, straddling the KY/TN border) — null unless there's a
  // current, settled, multi-entry result to choose between.
  const zipMultiPlaces: ZipLocation[] | null =
    node.type === 'location' &&
    zipRes.status === 'done' &&
    zipRes.zip === answers.zip &&
    zipRes.result &&
    zipRes.result.length > 1
      ? zipRes.result
      : null;

  return (
    <>
      {siteHeader}
      {sidebarToggle}
      {themeToggle}
      {progressSidebar}
      <div className="shell">
      {topBar}
      <div className="question" key={node.id}>
      <div className="section-label">{SECTION_LABELS[node.section]}</div>
      <div className="progress">{answeredCount + 1} of ~{estimatedTotal}</div>
      <h1>{node.prompt}</h1>
      {node.helpText && <p className="help">{node.helpText}</p>}

      {node.type === 'location' && (
        <form
          className="location-confirm"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            confirmLocation();
          }}
        >
          <p>
            {zipRes.status === 'loading' && zipRes.zip === answers.zip
              ? 'Looking that up…'
              : zipRes.status === 'error' && zipRes.zip === answers.zip
              ? "Couldn't reach the ZIP lookup service — enter manually below."
              : zipMultiPlaces
              ? 'This ZIP matches more than one place — which is right?'
              : ctx.city
              ? `${ctx.city}, ${ctx.state}`
              : 'ZIP not recognized — enter manually below.'}
          </p>
          {zipMultiPlaces && (
            <div className="button-row">
              {zipMultiPlaces.map((place, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => setLocationDraft({ city: place.city.toUpperCase(), state: place.state })}
                >
                  {place.city}, {place.state}
                </button>
              ))}
            </div>
          )}
          <label>
            City
            {/* name/autoComplete deliberately don't say "city": Safari
                treats autocomplete="off" as a hint it's allowed to ignore
                for anything it pattern-matches as a physical-address
                field (a documented, long-standing WebKit policy, not a
                bug — see the color-scheme/autofill-icon fix above for the
                same browser's autofill behavior biting us elsewhere). When
                it decides that and shows its own AutoFill suggestion UI,
                that overlay can eat the next Tab/Return itself instead of
                letting it reach "Looks right".

                Follow-up after this didn't fully resolve it: reported
                behavior is Tab going City -> State -> the browser's own
                address bar, skipping the button entirely. That's actually
                expected Safari/macOS behavior, unrelated to this field's
                autofill guess — by default Safari only Tabs between text
                fields (and links), not buttons, unless "Keyboard
                navigation" is turned on in macOS System Settings ->
                Keyboard (older Safari: Preferences -> Advanced -> "Press
                Tab to highlight each item on a webpage"). Not something a
                page can turn on for the user. Enter, though, shouldn't
                depend on that setting at all — the onKeyDown below submits
                directly from the field instead of relying on the browser's
                implicit "Enter in a form field triggers the one submit
                button" behavior, in case the same autofill overlay is
                still what's swallowing that. */}
            <input
              name="place-city"
              // Auto-focused so a confirmed ZIP match (the common case,
              // both fields already pre-filled correctly) can be accepted
              // with a single Enter press, no click required first — user
              // feedback: the fields autofill from the prior ZIP answer,
              // but nothing had focus by default, so Enter had nothing to
              // act on until the user clicked into a field themselves.
              autoFocus
              value={locationDraft.city}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setLocationDraft((prev) => ({ ...prev, city: e.target.value.toUpperCase() }))}
              onBlur={(e) => setLocationDraft((prev) => ({ ...prev, city: e.target.value.toUpperCase() }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  confirmLocation();
                }
              }}
            />
          </label>
          <label>
            State
            <input
              name="place-region"
              value={locationDraft.state}
              maxLength={2}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setLocationDraft((prev) => ({ ...prev, state: e.target.value.toUpperCase() }))}
              onBlur={(e) => setLocationDraft((prev) => ({ ...prev, state: e.target.value.toUpperCase() }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  confirmLocation();
                }
              }}
            />
          </label>
          <button type="submit" className="btn-primary">Looks right</button>
        </form>
      )}

      {(node.type === 'text' || node.type === 'number' || node.type === 'combobox') && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitDraft();
          }}
        >
          {node.type === 'combobox' ? (
            <ComboboxInput
              value={draft}
              onChange={handleDraftChange}
              groups={node.optionGroups ?? []}
              placeholder={node.placeholder}
              maxLength={node.maxLength}
            />
          ) : (
            <input
              autoFocus
              // A native type="number" input rejects commas outright, and
              // this question (annualMileage) wants to allow them as typed —
              // use text + inputMode so the numeric keyboard still shows on
              // mobile, while charPattern (set per-node) does the real
              // character filtering.
              type="text"
              inputMode={node.type === 'number' ? 'numeric' : undefined}
              maxLength={node.maxLength}
              placeholder={node.placeholder}
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
            />
          )}
          <button type="submit" className="btn-primary">Next</button>
        </form>
      )}

      {node.type === 'fieldGroup' && (
        // A real <form>, not a div with an onClick button — same reason the
        // text/number/location screens use one: Enter should submit
        // whenever the primary action is enabled, not just advance via
        // mouse click. (User feedback: "clicking Enter should activate the
        // 'Next' button if it's enabled" — this was the one screen type
        // that didn't.)
        <form
          className={`field-group${node.columns ? ' field-group-grid' : ''}`}
          style={node.columns ? ({ '--cols': node.columns } as CSSProperties) : undefined}
          onSubmit={(e) => {
            e.preventDefault();
            if (fieldGroupComplete) commit(fieldGroupDraft);
          }}
        >
          {node.fields?.map((f) => (
            <label key={f.id}>
              {f.label}
              {f.type === 'date' && (
                <DateSegmentedInput
                  value={fieldGroupDraft[f.id] ?? ''}
                  onChange={(iso) => setFieldGroupDraft((prev) => ({ ...prev, [f.id]: iso }))}
                />
              )}
              {f.type === 'select' && (
                <select
                  value={fieldGroupDraft[f.id] ?? ''}
                  onChange={(e) => handleFieldGroupChange(f, e.target.value)}
                >
                  {/* Skip the placeholder when a field already defines its own
                      empty-value option (e.g. suffix's "None") so there's
                      never a duplicate blank entry. */}
                  {!f.options?.some((opt) => opt.value === '') && (
                    <option value="" disabled>
                      Select…
                    </option>
                  )}
                  {f.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
              {f.helpText && <span className="field-hint">{f.helpText}</span>}
              {f.type === 'text' && (
                <input
                  type="text"
                  maxLength={f.maxLength}
                  placeholder={f.placeholder}
                  value={fieldGroupDraft[f.id] ?? ''}
                  onChange={(e) => handleFieldGroupChange(f, e.target.value)}
                />
              )}
              {fieldGroupDraftErrors[f.id] && <span className="field-error">{fieldGroupDraftErrors[f.id]}</span>}
            </label>
          ))}
          <div className="button-row">
            <button type="submit" className="btn-primary" disabled={!fieldGroupComplete}>
              Next
            </button>
          </div>
        </form>
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
          <h3 className="repeating-heading">{node.listHeading ?? 'Added'}</h3>

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
            !showAddForm &&
            (noneConfirmed ? (
              <p className="help">Marked as none to add.</p>
            ) : (
              <p className="help">None added yet.</p>
            ))
          )}

          {showAddForm ? (
            // Same reasoning as the fieldGroup form above — a real <form>
            // so Enter submits "Add" once the entry's required fields (and
            // any field-level validation) are satisfied.
            <form
              className="repeating-add-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!groupFieldsComplete) return;
                setGroupEntries((prev) => [...prev, groupDraft]);
                setGroupDraft(emptyEntry(node.fields));
                setShowAddForm(false);
                setNoneConfirmed(false);
              }}
            >
              {node.fields?.map((f) => (
                <label key={f.id}>
                  {f.label}
                  {f.type === 'date' && (
                    <DateSegmentedInput
                      value={groupDraft[f.id] ?? ''}
                      onChange={(iso) => setGroupDraft((prev) => ({ ...prev, [f.id]: iso }))}
                    />
                  )}
                  {groupDraftErrors[f.id] && <span className="field-error">{groupDraftErrors[f.id]}</span>}
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
                  {f.helpText && <span className="field-hint">{f.helpText}</span>}
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
                <button type="submit" className="btn-primary" disabled={!groupFieldsComplete}>
                  Add
                </button>
                {/* type="button" is load-bearing here — a plain <button>
                    inside a <form> defaults to type="submit", which would
                    make Cancel also trigger the form's onSubmit (and thus
                    Add) instead of discarding the draft. */}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setGroupDraft(emptyEntry(node.fields));
                    setShowAddForm(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="button-row">
              <button onClick={() => setShowAddForm(true)}>{node.addButtonText ?? '+ Add'}</button>
              {/* Optional group with nothing added yet: "fine to add none" in
                  the help text isn't itself a selectable answer, so there's
                  no visible way to say "I checked, there's nothing" short of
                  pressing Continue and hoping — this button makes that an
                  explicit choice, and gates Continue below until one of the
                  two happens. */}
              {node.required === false && groupEntries.length === 0 && (
                // A plain button, same weight as "+ Add [x]" — this was a
                // .link-button (small underlined text) at first, which read
                // as a minor afterthought even though it's the only other
                // way to satisfy a required-to-answer question. User
                // feedback: "too hidden... should probably be equal to the
                // Add button."
                <button onClick={() => setNoneConfirmed(true)}>None — nothing to add</button>
              )}
            </div>
          )}

          <div className="button-row">
            <button
              className="btn-primary"
              disabled={node.required === false && groupEntries.length === 0 && !noneConfirmed}
              onClick={() => commit(groupEntries)}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {isDebugMode() && skippedIds.length > 0 && (
        <p className="skip-note">
          (skipped so far: {skippedIds.join(', ')})
        </p>
      )}
      </div>
      </div>
      {siteFooter}
      {supportWidget}
    </>
  );
}
