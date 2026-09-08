/**
 * Bootstrap: view state, the single render dispatch, and the global
 * listeners. Phase 0 renders placeholders — the pages themselves arrive
 * from Phase 3 onward — but the dispatch shape is the one DESIGN.md §5
 * describes, so later phases fill it in rather than replace it.
 */

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
  root.replaceChildren(heading, note);
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
}

document.getElementById('wordmark').textContent = 'Initiative Planner';
installGlobalListeners();
render();
