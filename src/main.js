/**
 * Bootstrap: load the dataset, then view state, the single render dispatch,
 * and the global listeners. The pages themselves arrive from Phase 3 onward;
 * the dispatch shape is the one DESIGN.md §5 describes, so later phases fill
 * it in rather than replace it.
 */

import { load, save, flush } from './store.js';
import * as E from './engine.js';

/** The whole dataset. Every page reads and writes this one object. */
const { app, reason: loadReason } = load();

/** Persist after a change. Debounced: the whole APP is the unit (DESIGN §3). */
export function commit() {
  save(app);
  render();
}

/**
 * Top-level pages, in nav order. `id` is internal and never displayed;
 * `label` is placeholder text until Settings owns it.
 * @type {ReadonlyArray<{ id: string, label: string, kind: string }>}
 */
const PAGES = [
  { id: 'portfolio', label: 'Portfolio', kind: 'dashboard' },
  { id: 'initiatives', label: 'Initiatives', kind: 'overview' },
  { id: 'teams', label: 'Teams', kind: 'overview' },
  { id: 'people', label: 'People', kind: 'overview' },
  { id: 'settings', label: 'Settings', kind: 'settings' },
];

/** Current view: which page, plus whatever params that page needs. */
let view = { page: 'portfolio', params: {} };

/**
 * Switch pages and re-render. The only way view state changes.
 * @param {string} page
 * @param {Record<string, unknown>} [params]
 */
function navigate(page, params = {}) {
  view = { page, params };
  render();
}

/** Rebuild the nav, marking the current page. */
function renderNav() {
  const nav = document.getElementById('nav');
  nav.replaceChildren(
    ...PAGES.map((page) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.page = page.id;
      button.textContent = page.label;
      if (page.id === view.page) button.setAttribute('aria-current', 'page');
      return button;
    }),
  );
}

/** Dispatch on view state and swap the contents of the one root element. */
function render() {
  renderNav();

  const page = PAGES.find((candidate) => candidate.id === view.page);
  const root = document.getElementById('root');
  const heading = document.createElement('h1');
  heading.textContent = page.label;

  const note = document.createElement('p');
  note.textContent = `Not built yet — this ${page.kind} page arrives in a later phase.`;

  // Until the pages exist, show that the dataset is real and loaded. This
  // block goes when Phase 3 gives these pages something of their own to say.
  const status = document.createElement('p');
  status.dataset.testid = 'load-status';
  status.textContent =
    `${Object.keys(app.PEOPLE).length} people, ` +
    `${Object.keys(app.TEAMS).length} teams, ` +
    `${app.INITIATIVES.length} initiatives, ` +
    `${E.stageOrder(app.PROCESS).length} stages (loaded: ${loadReason})`;

  root.replaceChildren(heading, note, status);
}

/**
 * Global listeners are installed exactly once, using delegation on
 * `document` and resolving the target at event time. Nothing here is ever
 * re-attached from a render function (AGENTS.md invariants).
 */
function installGlobalListeners() {
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest('[data-page]');
    if (trigger instanceof HTMLElement) navigate(trigger.dataset.page);
  });

  // A debounced save must not lose the last change to a closing tab.
  window.addEventListener('beforeunload', () => flush(app));
}

document.getElementById('wordmark').textContent = 'Initiative Planner';
installGlobalListeners();
render();
