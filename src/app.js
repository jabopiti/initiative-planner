import * as F from './format.js';
/**
 * Render layer: view state, the single dispatch, and global wiring.
 *
 * Structure follows DESIGN.md §5. A **region** is the unit of structural
 * rebuild — a render function owns one container and replaces its contents
 * wholesale. Anything finer than a region (a recalculated total, a warning
 * appearing) is written into an existing node in place, so typing never
 * rebuilds the input under the caret.
 *
 * Each page's markup lives in its own module under `pages/`; the DOM
 * primitives, table registry, chart helpers and the phase-panel shared by
 * the wizard and initiative detail live under `render/`. This file owns the
 * state the whole app shares (`app`, `view`), the single `render()` dispatch,
 * and the event wiring installed once at `boot()`.
 */

import * as E from './engine.js';
import * as T from './transfer.js';
import * as store from './store.js';
import { PROCESS } from './process.js';

import { html, raw, fill } from './render/dom.js';
import { SPRITE, icon } from './render/icons.js';
import { TABLES } from './render/tables.js';
import { phaseTotalsMarkup, grandMarkup, phasePanelClickActions, phasePanelInputActions } from './render/phase-panel.js';
import { chartsClickActions } from './render/charts.js';

import { renderPortfolio, portfolioClickActions } from './pages/portfolio.js';
import { renderInitiatives, initiativesClickActions } from './pages/initiatives.js';
import {
  renderInitiative, bandPanelMarkup, monthTotalsRowMarkup, summaryBarMarkup,
  initiativeClickActions, initiativeChangeActions, initiativeInputActions,
} from './pages/initiative.js';
import { renderWizard, wizardClickActions, wizardChangeActions, wizardInputActions } from './pages/wizard.js';
import { renderTeams, teamsClickActions, teamsInputActions } from './pages/teams.js';
import { renderTeam, teamClickActions, teamChangeActions, teamInputActions } from './pages/team.js';
import { renderPeople, peopleClickActions } from './pages/people.js';
import {
  renderPerson, personClickActions, personChangeActions, personInputActions,
} from './pages/person.js';
import { renderCapacity } from './pages/capacity.js';
import {
  renderSettings, importPreviewMarkup, scrollToSettingsSection, fileStatusMarkup,
  settingsClickActions, settingsInputActions,
} from './pages/settings.js';

/* ------------------------------------------------------------------ *
 * Theme
 * ------------------------------------------------------------------ */

const THEME_KEY = 'initiative-planner/theme';
const THEMES = ['system', 'light', 'dark'];
const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };

/**
 * A device preference, not data: it lives under its own storage key rather
 * than in the dataset, so it is never exported and never travels between
 * machines with someone's initiatives.
 */
function currentTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return THEMES.includes(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

/**
 * "System" stamps nothing, leaving `prefers-color-scheme` to decide; an
 * explicit choice stamps the root. Changing this attribute repaints
 * everything, because every rule reads tokens rather than colours (SPEC §8).
 */
function applyTheme(theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // A blocked store costs the preference, not the app.
  }
  applyTheme(next);
  renderShellActions();
}

/* ------------------------------------------------------------------ *
 * Shell
 * ------------------------------------------------------------------ */

function renderShellActions() {
  const theme = currentTheme();
  fill(
    'shell-actions',
    html`<button type="button" class="btn btn--small" data-act="search-open" aria-haspopup="dialog">
        ${raw(icon('search'))}Search</button>
      <button type="button" class="btn btn--small" data-act="export">
        ${raw(icon('export'))}Export</button>
      <label class="btn btn--small btn--file">${raw(icon('import'))}Import
        <input type="file" accept="application/json,.json" data-act="import-file" hidden />
      </label>
      <button type="button" class="btn btn--small" data-act="theme"
        aria-label="Theme: ${THEME_LABELS[theme]}. Click to change.">
        ${raw(icon('theme'))}${THEME_LABELS[theme]}</button>`,
  );
}

/* ------------------------------------------------------------------ *
 * Global search (§4.5) — initiatives, people and teams by name, from
 * anywhere in the shell.
 * ------------------------------------------------------------------ */

/** Every initiative, person and team whose name matches, kind by kind. */
function searchResults(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const matches = (name) => name.toLowerCase().includes(q);
  return [
    ...app.INITIATIVES.filter((i) => matches(i.name)).map((i) => ({
      kind: 'Initiative',
      name: i.name,
      href: `#/initiative/${i.id}`,
      note: i.status === 'active' ? '' : STATUS_LABELS[i.status],
    })),
    ...Object.values(app.PEOPLE).filter((p) => matches(p.name)).map((p) => ({
      kind: 'Person', name: p.name, href: `#/person/${p.id}`, note: p.active ? '' : 'inactive',
    })),
    ...Object.values(app.TEAMS).filter((t) => matches(t.name)).map((t) => ({
      kind: 'Team', name: t.name, href: `#/team/${t.id}`, note: t.active ? '' : 'inactive',
    })),
  ];
}

/**
 * The last few initiatives, people and teams actually opened, most recent
 * first — so the empty state is a shortcut back to what you were just
 * looking at, not just an instruction to type (§4.5).
 */
const RECENTLY_VIEWED_LIMIT = 5;
let recentlyViewed = [];

function recordRecentlyViewed(page, params) {
  const id = params?.id;
  if (!id) return;
  let subject;
  if (page === 'initiative') subject = app.INITIATIVES.find((i) => i.id === id);
  else if (page === 'person') subject = app.PEOPLE[id];
  else if (page === 'team') subject = app.TEAMS[id];
  if (!subject) return;
  const kind = page === 'initiative' ? 'Initiative' : page === 'person' ? 'Person' : 'Team';
  const entry = { kind, name: subject.name, href: `#/${page}/${id}` };
  recentlyViewed = [
    entry,
    ...recentlyViewed.filter((r) => r.href !== entry.href),
  ].slice(0, RECENTLY_VIEWED_LIMIT);
}

function resultRowMarkup(r) {
  return html`<a class="btn" href="${r.href}" data-act="search-select">
      <span class="micro muted">${r.kind}</span> ${r.name}
      ${raw(r.note ? html`<span class="micro muted">· ${r.note}</span>` : '')}</a>`;
}

function searchResultsMarkup(query) {
  if (!query.trim()) {
    if (recentlyViewed.length === 0) return html`<p class="muted micro">Type a name to jump to it.</p>`;
    return html`<p class="muted micro">Recently viewed</p>
      <div class="popover__actions">${raw(recentlyViewed.map(resultRowMarkup).join(''))}</div>`;
  }
  const results = searchResults(query);
  if (results.length === 0) return html`<p class="muted micro">No match.</p>`;
  return html`<div class="popover__actions">${raw(results.map(resultRowMarkup).join(''))}</div>`;
}

function searchMarkup() {
  return html`<h3>Search</h3>
    <input class="field" type="search" data-act="search-query"
      placeholder="Initiatives, people, teams" aria-label="Search initiatives, people and teams" />
    <div data-search-results>${raw(searchResultsMarkup(''))}</div>`;
}

/* ------------------------------------------------------------------ *
 * Transient messages
 * ------------------------------------------------------------------ */

/** The timer clearing the current toast, so a second one replaces the first. */
let toastTimer = null;
let pendingUndo = null;

export function showToast(text, kind = '', undoCb = null) {
  const node = document.getElementById('toast');
  if (!node) return;
  pendingUndo = undoCb;
  fill(node, html`<div class="toast ${kind}">
    ${raw(icon(kind ? 'warning' : 'check'))}<span>${text}</span>
    ${raw(undoCb ? html`<button type="button" class="btn--small" data-act="undo">Undo</button>` : '')}
  </div>`);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    fill(node, '');
    pendingUndo = null;
  }, 4000);
}

export function withUndo(text, action) {
  const snapshot = JSON.stringify(app);
  action();
  showToast(text, '', () => {
    Object.assign(app, JSON.parse(snapshot));
    commit();
  });
}

/**
 * The export reminder, and — ahead of it — a store that has stopped accepting
 * writes. Dismissable by action only: exporting clears the reminder, nothing
 * else does, because the thing it is warning about is real until the export
 * happens.
 *
 * A failed write outranks an overdue one. Both say "export now", but one is a
 * habit worth keeping and the other is this session's work about to be lost.
 */
function renderBanner() {
  const node = document.getElementById('banner');
  if (!node) return;

  const showBanner = (markup) => {
    node.hidden = false;
    fill(node, markup);
  };

  if (!store.isPersisting()) {
    showBanner(html`<div class="banner-bar banner-bar--severe" role="alert">
      <span>${raw(icon('warning', 'icon--lead'))}<strong>Changes are no longer being saved.</strong> This browser's storage is
        full or blocked. Export now — anything edited since this appeared exists only on
        this page, and closing it loses the lot.</span>
      <button type="button" class="btn btn--small" data-act="export">Export now</button>
    </div>`);
    return;
  }

  // Another tab saved a newer version of this dataset. Saving this tab's
  // now-stale copy over it would be exactly the silent last-writer-wins loss
  // this warns about — store.saveNow() already refuses to write once this is
  // true, so a reload (a fresh module, a fresh read) is the only way out
  // (§4.7, D5: no real-time sync between tabs, only a courtesy warning).
  if (store.externalChangePending()) {
    showBanner(html`<div class="banner-bar banner-bar--severe" role="alert">
      <span>${raw(icon('warning', 'icon--lead'))}<strong>This dataset changed in another
          tab.</strong> Further edits here won't be saved — reload to pick up the newer
        version. Anything typed here since the other tab saved will be lost.</span>
      <button type="button" class="btn btn--small" data-act="reload-tab">Reload</button>
    </div>`);
    return;
  }

  // A dataset dropped for a schema or process mismatch, or one that could not
  // even be read, is worse than an empty store: the bytes are still sitting
  // in this browser, unreadable to this build, and the first save from here
  // overwrites them for good. Silently reseeding instead of saying so would
  // be data loss with no warning at all (§2.5) — this is the one load
  // outcome with no fix inside this build, so the only honest action is
  // "stop and go find a build that can still read it," not a retry button.
  if (loadReason !== 'stored' && loadReason !== 'empty' && !loadWarningDismissed) {
    const why = {
      schema: 'was written by a different version of this tool and no longer matches ' +
        "this build's data shape",
      process: 'was written against a different process — its phases and gates would ' +
        'mean something else here',
      unreadable: "could not be read — this browser's storage may be blocked, or what " +
        'was stored is corrupted',
    }[loadReason];
    showBanner(html`<div class="banner-bar banner-bar--severe" role="alert">
      <span>${raw(icon('warning', 'icon--lead'))}<strong>Starting fresh, not from what was
          here.</strong> The data stored in this browser ${why}, so this session began from
        the seed data instead. Nothing has been deleted yet, but saving anything here will
        overwrite it — if you need it back, open it in a build that still recognises it
        before doing anything else in this one.</span>
      <button type="button" class="btn btn--small" data-act="dismiss-load-warning">Dismiss</button>
    </div>`);
    return;
  }

  const threshold = app.GENERAL.exportReminderDays;
  const last = app.GENERAL.lastExportAt ? Date.parse(app.GENERAL.lastExportAt) : null;
  const days = last === null ? null : Math.floor((Date.now() - last) / 86400000);

  if (!threshold || (days !== null && days < threshold)) {
    node.hidden = true;
    fill(node, '');
    return;
  }

  // Escalating rather than shouting from the start: the longer it has been
  // ignored, the more it costs to keep ignoring it.
  const overdue = days === null ? threshold : days;
  const level = overdue >= threshold * 3 ? 'severe' : overdue >= threshold * 2 ? 'strong' : 'mild';
  const said = days === null
    ? 'This data has never been exported.'
    : `It has been ${days} days since the last export.`;

  showBanner(html`<div class="banner-bar banner-bar--${level}">
    <span>${raw(level === 'mild' ? '' : icon('warning', 'icon--lead'))}${said} An export is the
      only backup — everything here lives in this browser alone.</span>
    <button type="button" class="btn btn--small" data-act="export">
      ${raw(icon('export'))}Export now</button>
  </div>`);
}

/**
 * The linked-file status only ever exists inside Settings' Data section
 * (D4) — `fill()` is already a safe no-op when the element isn't on the
 * page, which is every page but that one. Called after link/unlink/
 * reconnect, and once the async handle restore at boot settles.
 */
function refreshFileStatus() {
  fill('file-status', fileStatusMarkup());
}

/* ------------------------------------------------------------------ *
 * Navigation chrome
 * ------------------------------------------------------------------ */

/**
 * Whether the collapsed nav is showing. Below the nav breakpoint the page
 * links live behind a menu button; above it the class does nothing and the
 * strip is always visible, so this is one variable rather than a media query
 * read from script.
 *
 * View state, not a place: it never reaches the hash, the same way a sort
 * order does not.
 */
let navOpen = false;

function renderNavToggle() {
  // Icon-only, so the name lives on the button as both an aria-label and a
  // tooltip. It opens a menu rather than destroying anything, which is the
  // only kind of action allowed to lose its word.
  const label = navOpen ? 'Close the menu' : 'Open the menu';
  fill(
    'nav-toggle',
    html`<button type="button" class="btn btn--ghost btn--icon" data-act="nav-toggle"
      aria-expanded="${navOpen}" aria-controls="nav" aria-label="${label}" title="${label}"
      >${raw(icon(navOpen ? 'remove' : 'menu'))}</button>`,
  );
  document.getElementById('nav')?.classList.toggle('shell-nav--open', navOpen);
}

function setNavOpen(open) {
  if (navOpen === open) return;
  navOpen = open;
  renderNavToggle();
}

/* ------------------------------------------------------------------ *
 * Popovers
 * ------------------------------------------------------------------ */

/** The element a popover was opened from, so it can be repositioned. */
let popoverTrigger = null;

/** The trigger of whichever popover is currently open, or null — for a
 * handler that replaces one popover's content with another anchored the
 * same place (e.g. a status menu's own confirm step). */
export function currentPopoverTrigger() {
  return popoverTrigger;
}

/**
 * Position from the trigger's bounding rectangle rather than relying on CSS
 * anchoring (AGENTS.md), clamped so it cannot open off-screen. Recomputed on
 * scroll and resize, since a fixed element does not follow its trigger.
 */
function positionPopover() {
  const node = document.getElementById('popover');
  if (!node || node.hidden || !popoverTrigger?.isConnected) return;

  const rect = popoverTrigger.getBoundingClientRect();
  const box = node.getBoundingClientRect();
  const margin = 8;
  const { innerWidth: vw, innerHeight: vh } = window;

  // With no measurable viewport — a hidden or not-yet-laid-out pane — clamping
  // would push the popover into a corner for no reason. Sit on the trigger and
  // let the next scroll or resize place it properly.
  if (!vw || !vh) {
    node.style.left = `${rect.left}px`;
    node.style.top = `${rect.bottom + margin}px`;
    return;
  }

  const left = Math.max(margin, Math.min(rect.left, vw - box.width - margin));
  const below = rect.bottom + margin;
  const top = below + box.height > vh ? rect.top - box.height - margin : below;

  node.style.left = `${left}px`;
  node.style.top = `${Math.max(margin, top)}px`;
}

/**
 * Highlight whichever panel is currently at the top of the viewport in a
 * page's rail nav (`render/components.js`'s `railNav`, called with no
 * `activeId`) — Initiative and Team detail have no per-panel route the way
 * Settings does, so their "current" section is read back from scroll
 * position instead of the address bar. A no-op on any page without such a
 * nav, so it is safe to call from one scroll listener installed once
 * (AGENTS.md) rather than wired per page.
 */
export function syncRailNav() {
  const nav = document.querySelector('.rail-nav[data-scrollspy]');
  if (!nav) return;
  const buttons = Array.from(nav.querySelectorAll('button[data-panel]'))
    .filter((el) => el instanceof HTMLElement);
  if (buttons.length === 0) return;

  const threshold = document.querySelector('.shell-header')?.getBoundingClientRect().bottom ?? 0;
  let activeId = buttons[0].dataset.panel;
  for (const button of buttons) {
    const target = document.getElementById(button.dataset.panel);
    if (target && target.getBoundingClientRect().top - threshold <= 1) activeId = button.dataset.panel;
  }
  // The last panel can be shorter than the viewport below it, in which case
  // its top never reaches the threshold above — scrolling to the very
  // bottom of the page is what "on the last panel" means in that case.
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1) {
    activeId = buttons[buttons.length - 1].dataset.panel;
  }
  for (const button of buttons) {
    if (button.dataset.panel === activeId) button.setAttribute('aria-current', 'location');
    else button.removeAttribute('aria-current');
  }
}

const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function openPopover(trigger, markup) {
  const node = document.getElementById('popover');
  if (!node) return;
  popoverTrigger = trigger;
  fill(node, markup);
  node.hidden = false;
  positionPopover();
  // Non-modal (aria-modal="false"): move focus in and trap Tab only when
  // there is something to tab between. With no focusable content, the
  // container itself (tabindex="-1" in index.html) takes focus instead.
  const focusable = node.querySelector(FOCUSABLE);
  if (focusable instanceof HTMLElement) focusable.focus();
  else node.focus();
}

export function closePopover() {
  const node = document.getElementById('popover');
  if (!node || node.hidden) return;
  node.hidden = true;
  fill(node, '');
  const trigger = popoverTrigger;
  popoverTrigger = null;
  // Escape and outside-click both route here; a click on a different
  // trigger is its own openPopover call and moves focus on its own.
  if (trigger?.isConnected) trigger.focus();
}

/** Keep Tab cycling inside an open popover rather than leaking to the page behind it. */
function trapPopoverTab(event) {
  const node = document.getElementById('popover');
  if (!node || node.hidden || !node.contains(document.activeElement)) return;
  const focusables = Array.from(node.querySelectorAll(FOCUSABLE))
    .filter((el) => el instanceof HTMLElement);
  if (focusables.length === 0) return event.preventDefault();
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    if (last instanceof HTMLElement) last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    if (first instanceof HTMLElement) first.focus();
  }
}

/* ------------------------------------------------------------------ *
 * The modal dialog
 * ------------------------------------------------------------------ */

/**
 * The app's one modal, and the only place it is used is a decision that
 * cannot proceed without an answer (skipping a gate needs a reason).
 *
 * A native `<dialog>` rather than the popover above: `showModal()` brings the
 * focus trap, Escape, the inert page behind it and focus restored to whatever
 * opened it, none of which has to be written here. The property that decided
 * it, though, is the one a popover has backwards — a click anywhere else
 * dismisses a popover, which is right for something you are reading and wrong
 * for something you are half-way through typing.
 */
export function openDialog(markup) {
  const node = document.getElementById('dialog');
  if (!(node instanceof HTMLDialogElement)) return;
  fill(node, markup);
  node.showModal();
  const focusable = node.querySelector(FOCUSABLE);
  if (focusable instanceof HTMLElement) focusable.focus();
}

/**
 * Emptied here rather than on the element's own `close` event: Escape closes
 * a native dialog without passing through this function, so the keyboard path
 * calls it too and one place does the clearing either way.
 */
export function closeDialog() {
  const node = document.getElementById('dialog');
  if (!(node instanceof HTMLDialogElement)) return;
  if (node.open) node.close();
  fill(node, '');
}

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

/** The whole dataset, and how it was loaded. */
export let app = null;
let loadReason = 'empty';
/** Whether the load-reason warning below has been acknowledged this session. */
let loadWarningDismissed = false;

/** Current page plus its params (DESIGN §5). */
export let view = { page: 'portfolio', params: {} };

const PAGES = [
  { id: 'portfolio', label: 'Portfolio', kind: 'dashboard' },
  { id: 'initiatives', label: 'Initiatives', kind: 'overview' },
  { id: 'teams', label: 'Teams', kind: 'overview' },
  { id: 'people', label: 'People', kind: 'overview' },
  { id: 'capacity', label: 'Capacity', kind: 'overview' },
  { id: 'settings', label: 'Settings', kind: 'settings' },
];

export const STATUS_LABELS = {
  active: 'Active',
  'on-hold': 'On hold',
  cancelled: 'Cancelled',
  closed: 'Closed',
};

/** Which badge kind each status reads as, so closed (done) and cancelled
 * (abandoned) are visually distinct rather than sharing one "finished" mark. */
export const STATUS_BADGE_KIND = {
  active: 'ok',
  'on-hold': 'warn',
  cancelled: 'danger',
  closed: 'quiet',
};

/** `YYYY-MM` for today, the month picker's default. */
export function currentMonth() {
  return E.monthKey(new Date());
}

export const today = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ *
 * Routing
 * ------------------------------------------------------------------ *
 *
 * Hash-based, not `pushState` — `pushState` does not work when the single
 * file is opened from `file://`, and being openable from disk is the whole
 * point of the artifact.
 *
 * The hash encodes *identity* only — which page, and which record on it —
 * never the transient view state layered on top (a sort order, an open
 * filter, a chart's year). Reload and Back restore the place; they reset
 * how it happens to be filtered, which is what every other page on the web
 * already trains people to expect from an address bar.
 */

/** Pages opened by id — a detail, or the wizard's estimates step. */
const ID_PAGES = new Set(['person', 'team', 'initiative', 'wizard']);
const ALL_PAGE_IDS = new Set([...PAGES.map((p) => p.id), ...ID_PAGES]);

/** Each sortable page's starting column and direction, read by the shared 'sort' action. */
const SORT_DEFAULTS = {
  people: { key: 'name', dir: 'asc' },
  initiatives: { key: 'name', dir: 'asc' },
  portfolio: { key: 'effective', dir: 'desc' },
};

function hashFor({ page, params }) {
  if (page === 'settings') return params.section ? `#/settings/${params.section}` : '#/settings';
  if (ID_PAGES.has(page) && params.id) return `#/${page}/${encodeURIComponent(params.id)}`;
  return `#/${page}`;
}

/** The inverse of `hashFor`. An unrecognised or empty hash lands on Portfolio. */
function parseHash() {
  const [page, sub] = location.hash.replace(/^#\/?/, '').split('/');
  if (!ALL_PAGE_IDS.has(page)) return { page: 'portfolio', params: {} };
  if (page === 'settings') return { page, params: sub ? { section: decodeURIComponent(sub) } : {} };
  if (ID_PAGES.has(page) && sub) return { page, params: { id: decodeURIComponent(sub) } };
  return { page, params: {} };
}

/**
 * Move focus to the page and tell assistive tech what changed. There is no
 * page reload to do this for free the way there is on a normal site (§2.1).
 * The heading is read back from what just rendered rather than looked up
 * separately, so the announcement can never say something the screen
 * doesn't.
 */
function announceNavigation() {
  const root = document.getElementById('root');
  root?.focus();
  const announcer = document.getElementById('route-announcer');
  if (announcer) announcer.textContent = root?.querySelector('h1')?.textContent.trim() ?? '';
  // Settings is one continuous scroll (§4.3); this is what "a section is a
  // place" means for it — only on a real navigation, never on a quiet
  // re-render from editing whatever section is already in view.
  if (view.page === 'settings') scrollToSettingsSection();
  recordRecentlyViewed(view.page, view.params);
}

export function navigate(page, params = {}) {
  view = { page, params };
  // Going somewhere is what the collapsed menu is for, so arriving closes it.
  navOpen = false;
  render();

  // Only a change of *place* touches the address bar or moves focus — a
  // sort, a filter, a month or a chart year keeps the same identity, so the
  // hash comes out unchanged and this is a no-op, exactly as it should be.
  const next = hashFor(view);
  if (location.hash !== next) {
    location.hash = next;
    announceNavigation();
  }
}

/** Persist (debounced) and re-render. */
export function commit() {
  store.save(app);
  render();
}

/** Persist without re-rendering — for edits made under the caret. */
export function commitQuietly() {
  store.save(app);
}

/* ------------------------------------------------------------------ *
 * Action registry
 * ------------------------------------------------------------------ *
 *
 * One global `click`/`change` listener each (AGENTS.md's "installed once"
 * invariant), but the *handlers* they dispatch to are not all written here.
 * Each page module — and each shared render component with its own
 * behaviour, like a sortable table or a year-nav chart — registers its own
 * `{act: handler}` map into these tables at import time (harmless: every
 * module is already imported for `render()` to call, well before `boot()`
 * ever wires up the listeners that would read from these maps). This is
 * what lets a new action's logic live beside the markup that triggers it,
 * instead of every feature editing the same central switch.
 *
 * A handler receives one context object rather than the raw event, so it
 * never has to re-derive `trigger`/`id` the way the old inline cases did.
 */

/** @typedef {{ trigger: HTMLElement, id: string|undefined, event: Event }} ClickContext */
/** @typedef {{ target: HTMLSelectElement|HTMLInputElement, id: string|undefined, event: Event }} ChangeContext */
/** @typedef {{ target: HTMLInputElement, id: string|undefined, field: string|undefined, event: Event }} InputContext */

/** @type {Map<string, (ctx: ClickContext) => unknown>} */
const clickActions = new Map();
/** @type {Map<string, (ctx: ChangeContext) => unknown>} */
const changeActions = new Map();
/** @type {Map<string, (ctx: InputContext) => unknown>} */
const inputActions = new Map();

/** Register one module's click actions. Later registrations win on a collision. */
export function registerClickActions(map) {
  for (const [act, handler] of Object.entries(map)) clickActions.set(act, handler);
}
/** Register one module's change actions (selects, radios, checkboxes). */
export function registerChangeActions(map) {
  for (const [act, handler] of Object.entries(map)) changeActions.set(act, handler);
}
/**
 * Register one module's input actions (typed edits, autosaved under the
 * caret). Unlike click/change handlers, an input handler owns its own
 * commit: call `commitQuietly()` (nothing moved but this field) or
 * `commit()`/`refreshCalcRegions()` (something else on screen depends on
 * the new value) itself, explicitly — there is no implicit fallthrough.
 */
export function registerInputActions(map) {
  for (const [act, handler] of Object.entries(map)) inputActions.set(act, handler);
}

/* ------------------------------------------------------------------ *
 * Dispatch
 * ------------------------------------------------------------------ */

export function render() {
  const current = PAGES.find((page) => page.id === view.page);
  renderShellActions();
  renderBanner();

  fill(
    'nav',
    PAGES.map(
      (page) => html`<button type="button" data-act="page" data-page="${page.id}"
        ${raw(page.id === view.page ? 'aria-current="page"' : '')}>${page.label}</button>`,
    ).join(''),
  );
  // The nav is replaced wholesale above, so the collapsed state has to be
  // written back onto it rather than surviving in the DOM.
  renderNavToggle();

  if (view.page === 'settings') renderSettings();
  else if (view.page === 'people') renderPeople();
  else if (view.page === 'person') renderPerson();
  else if (view.page === 'capacity') renderCapacity();
  else if (view.page === 'teams') renderTeams();
  else if (view.page === 'team') renderTeam();
  else if (view.page === 'initiatives') renderInitiatives();
  else if (view.page === 'wizard') renderWizard();
  else if (view.page === 'initiative') renderInitiative();
  else if (view.page === 'portfolio') renderPortfolio();
  else {
    fill(
      'root',
      html`<h1>${current.label}</h1>
        <p class="muted">Not built yet — this ${current.kind} page arrives in a later phase.</p>`,
    );
  }
  // A no-op on any page without a scroll-driven rail nav (Initiative, Team).
  syncRailNav();
}

/**
 * Recompute every figure on screen, in place.
 *
 * Which regions exist depends on the page — the wizard has a grand-total
 * line, initiative detail has a band panel and a month table — so this asks
 * the DOM rather than taking the caller's word for it. Two hand-maintained
 * lists were what let an allocation edit refresh the phase totals while
 * leaving the approval track above them stale.
 *
 * Structure is never rebuilt, so the caret stays where the user left it.
 */
export function refreshCalcRegions(initiative) {
  for (const [phaseId, phase] of Object.entries(initiative.phases)) {
    const at = E.ratesFor(app, phase);
    // Driven by the rows on screen rather than the allocations in the model:
    // an allocation table lists the whole team roster while it is editable
    // (D2), so a row can exist for someone who has no allocation record — and
    // typing a percentage back down to 0 removes the record while leaving the
    // row. Either way its figures still have to fall to zero.
    const rows = Array.from(document.querySelectorAll(`[data-alloc-phase="${phaseId}"]`));
    const allocationByPerson = new Map(
      phase.allocations.map((allocation) => [allocation.personId, allocation.allocationPct]),
    );
    for (const row of rows) {
      if (!(row instanceof HTMLElement)) continue;
      const personId = row.dataset.allocPerson;
      const days = row.querySelector(`[data-calc="days-${phaseId}-${personId}"]`);
      const cost = row.querySelector(`[data-calc="cost-${phaseId}-${personId}"]`);
      if (!days && !cost) continue;

      const allocationPct = allocationByPerson.get(personId) ?? 0;
      const figures = E.allocationFigures(phase, personId, allocationPct, at);
      if (days) days.textContent = figures.personDays.toFixed(1);
      if (cost) cost.textContent = F.money(figures.cost);
    }

    const total = document.querySelector(`[data-calc="total-${phaseId}"]`);
    if (total) fill(total, phaseTotalsMarkup(initiative, phaseId));
  }

  // Blended monthly figures share a table with the actual inputs, so they are
  // written cell by cell rather than rebuilt.
  const costByMonth = E.initiativeCostByMonth(initiative, app);
  for (const month of E.initiativeMonths(initiative)) {
    const cell = document.querySelector(`[data-calc="blended-${F.month(month)}"]`);
    if (cell) fill(cell, html`<strong>${F.money(costByMonth[month] ?? 0)}</strong>`);
  }

  const monthFoot = document.querySelector('[data-calc="month-totals"]');
  if (monthFoot) fill(monthFoot, monthTotalsRowMarkup(initiative));

  // These hold no inputs, so they are safe to rebuild whole — and have to be:
  // the total, its track, the marker and the variance all move together.
  const panel = document.querySelector('[data-calc="band-panel"]');
  if (panel) fill(panel, bandPanelMarkup(initiative));
  const grand = document.querySelector('[data-calc="grand"]');
  if (grand) fill(grand, grandMarkup(initiative));
  const summary = document.querySelector('[data-calc="summary"]');
  if (summary) fill(summary, summaryBarMarkup(initiative));
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

/** A validated import awaiting a Replace/Merge choice. Never auto-applied. */
export let pendingImport = null;

export function findInitiative(id) {
  const initiative = app.INITIATIVES.find((i) => i.id === id);
  if (!initiative) throw new Error(`unknown initiative: ${id}`);
  return initiative;
}

/** Typing: update the model in place, never the structure. */
/**
 * Focus and restore the caret on a freshly rendered replacement for `target`,
 * after an action (usually `commit()`) that rebuilds it under a new id — a
 * brand-new role/country/cost row is a fresh DOM node, but the invariant
 * that typing never *loses* the caret still applies to the field the user
 * was in the middle of typing into.
 */
export function restoreCaretAfter(target, selector, action) {
  // `selectionStart` reads as null on an input type that doesn't support
  // selection (e.g. the cost row's `type="month"` field) — a signal to skip
  // `setSelectionRange` below, which throws outright on those same types.
  const caret = target.selectionStart;
  action();
  const restored = document.querySelector(selector);
  if (restored instanceof HTMLInputElement) {
    restored.focus();
    if (caret !== null) restored.setSelectionRange(caret, caret);
  }
}

registerInputActions({
  'filter': ({ target }) => {
    // Search is the one filter that must react per keystroke, and filtering
    // rebuilds the table the box sits above. restoreCaretAfter re-renders,
    // then puts the caret back exactly where it was — the invariant is that
    // typing never *loses* the caret, not that nothing may re-render. A
    // checkbox (e.g. "Show inactive"/"Show closed & cancelled") also fires
    // this event; its `selectionStart` reads null, which is restoreCaretAfter's
    // own signal to skip the caret restore and just refocus it.
    const checkbox = target.type === 'checkbox';
    const value = checkbox ? target.checked : target.value;
    const filters = { ...(view.params.filters ?? {}), [target.dataset.filter]: value };
    restoreCaretAfter(
      target,
      `[data-act="filter"][data-filter="${target.dataset.filter}"]`,
      () => navigate(view.page, { ...view.params, filters }),
    );
  },
  'search-query': ({ target }) => {
    // Only the results list rebuilds — the input itself is never touched, so
    // there is no caret to lose in the first place.
    fill(document.querySelector('[data-search-results]'), searchResultsMarkup(target.value));
  },
});

function onInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const act = target.dataset.act;
  if (!act) return;
  const handler = inputActions.get(act);
  if (!handler) return;
  handler({ target, id: target.dataset.id, field: target.dataset.field, event });
}

registerClickActions({
  'page': ({ trigger }) => navigate(trigger.dataset.page),
  'section': ({ trigger }) => navigate('settings', { section: trigger.dataset.section }),
  // Jumping to a panel on the page you are already on is a scroll, not a
  // navigation: nothing about the view changed, so nothing re-renders and
  // nothing touches the address bar or the caret.
  'panel': ({ trigger }) => {
    // Reachable from inside the jump menu, which a click on its own items
    // does not dismiss.
    closePopover();
    document.getElementById(trigger.dataset.panel)?.scrollIntoView({ block: 'start' });
  },
  'undo': () => {
    if (pendingUndo) {
      pendingUndo();
      pendingUndo = null;
      fill('toast', '');
    }
  },
  'nav-toggle': () => setNavOpen(!navOpen),
  'search-open': ({ trigger }) => openPopover(trigger, searchMarkup()),
  // A real `href` does the navigating; this only has to dismiss a popover a
  // click on its own contents does not (§4.5).
  'search-select': () => closePopover(),
  'theme': () => cycleTheme(),
  'export': () => {
    if (!store.downloadExport(app)) return;
    app.GENERAL.lastExportAt = new Date().toISOString();
    commit();
  },
  'dismiss-load-warning': () => {
    loadWarningDismissed = true;
    renderBanner();
  },
  'reload-tab': () => location.reload(),
  'import-cancel': () => {
    pendingImport = null;
    fill('import-preview', importPreviewMarkup());
  },
  'import-apply': () => {
    app = T.applyImport(app, pendingImport.data, pendingImport.mode);
    pendingImport = null;
    store.saveNow(app);
    navigate('settings', { section: 'data' });
  },
  'month-today': () => navigate(view.page, { ...view.params, month: currentMonth() }),
  'copy-table': ({ trigger }) => {
    const table = TABLES[trigger.dataset.table];
    // The confirmation moved from a note beside the button to a toast: the
    // button sits under tables that scroll inside their own box, so the
    // note could land off-screen from the thing that produced it.
    store.copyTable(table.headers, table.rows).then((result) => {
      if (result === 'failed') showToast('Copy failed', 'toast--warn');
      else showToast('Copied');
    });
  },
  // One case for every sortable table, keyed off the page it's on — rather
  // than a separate case per page repeating the same toggle logic.
  'sort': ({ trigger }) => {
    const fallback = SORT_DEFAULTS[view.page];
    const current = view.params.sort ?? fallback;
    const key = trigger.dataset.key;
    const dir = current.key === key ? (current.dir === 'asc' ? 'desc' : 'asc') : fallback.dir;
    return navigate(view.page, { ...view.params, sort: { key, dir } });
  },
  'reset-confirm': () => {
    store.reset();
    const fresh = store.load();
    app = fresh.app;
    navigate('settings', { section: 'roles' });
  },
});

/** Clicks: structural changes, which do re-render. */
function onClick(event) {
  if (!(event.target instanceof Element)) return;

  const trigger = event.target.closest('[data-act]');
  const insidePopover = event.target.closest('#popover');
  if (!insidePopover && trigger?.dataset.act !== 'capacity-cell') closePopover();
  // The collapsed menu closes the same way a popover does: anything outside
  // it, that is not the button that opened it, dismisses it.
  if (!event.target.closest('.shell-header')) setNavOpen(false);

  if (!(trigger instanceof HTMLElement)) return;

  const handler = clickActions.get(trigger.dataset.act);
  if (!handler) return;
  return handler({ trigger, id: trigger.dataset.id, event });
}

registerChangeActions({
  'month-picker': ({ target }) => navigate(view.page, { ...view.params, month: target.value }),
  'filter': ({ target }) => {
    const filters = { ...(view.params.filters ?? {}) };
    const key = target.dataset.filter;
    filters[key] = target.type === 'checkbox' ? target.checked : target.value;
    return navigate(view.page, { ...view.params, filters });
  },
});

/** Selects, radios and checkboxes — structural, so these do re-render. */
function onChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement) && !(target instanceof HTMLInputElement)) return;
  const handler = changeActions.get(target.dataset.act);
  if (!handler) return;
  return handler({ target, id: target.dataset.id, event });
}

const ARROWS = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/**
 * Arrow-key movement between a table's controls. A capacity grid or a month
 * table is a grid of inputs, and reaching the far side of one by Tab alone is
 * punishing.
 *
 * Left and right only move when the caret is already at the end of a text
 * field, so arrowing within a value still works.
 */
function onTableKeydown(event) {
  const step = ARROWS[event.key];
  if (!step || event.metaKey || event.ctrlKey || event.altKey) return;

  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const cell = target.closest('td, th');
  const table = target.closest('table.grid');
  if (!(cell instanceof HTMLTableCellElement) || !(table instanceof HTMLTableElement)) return;

  if (target instanceof HTMLInputElement && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    const atStart = target.selectionStart === 0 && target.selectionEnd === 0;
    const atEnd = target.selectionStart === target.value.length
      && target.selectionEnd === target.value.length;
    if (event.key === 'ArrowLeft' ? !atStart : !atEnd) return;
  }

  const row = cell.parentElement;
  if (!(row instanceof HTMLTableRowElement)) return;
  const rows = Array.from(table.rows);
  const rowIndex = rows.indexOf(row);
  const cellIndex = Array.from(row.cells).indexOf(cell);
  if (rowIndex === -1 || cellIndex === -1) return;

  const [dr, dc] = step;
  const nextRow = rows[rowIndex + dr];
  if (!nextRow) return;
  const nextCell = nextRow.cells[cellIndex + dc];
  if (!nextCell) return;

  const focusable = nextCell.querySelector('input, select, button, textarea, [tabindex]');
  if (!(focusable instanceof HTMLElement)) return;

  event.preventDefault();
  focusable.focus();
  if (focusable instanceof HTMLInputElement && focusable.type === 'text') focusable.select();
}

/** Picking a file validates it before any choice is offered. */
async function onFileChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.dataset.act !== 'import-file') return;
  const file = target.files?.[0];
  if (!file) return;

  const parsed = await store.readImportFile(file);
  // Replace is the comprehensible mode — everything here is discarded and
  // replaced by the file. Merge overlays quietly and is the harder of the
  // two to reason about, so it is an opt-in, not the default (§4.3).
  pendingImport = parsed.ok ? { data: parsed.data, mode: 'replace', error: null } : { error: parsed.error };
  target.value = '';

  // The preview and its Replace/Merge choice live in Settings. Importing from
  // the shell has to go there, or the file would be read and then vanish.
  if (!document.querySelector('#import-preview')) {
    return navigate('settings', { section: 'data' });
  }
  fill('import-preview', importPreviewMarkup());
}

/**
 * Global listeners, installed exactly once on `document` and resolving their
 * target at event time, so a replaced region never needs re-binding.
 */
export function boot() {
  // Every page module (and shared render component) exports its own action
  // map rather than calling registerClickActions/etc. at its own top level.
  // Registering them has to happen here, inside boot() — never at any
  // module's own top level — because a page module can itself become the
  // *entry point* of the module graph (a test importing render/charts.js
  // directly, say), in which case app.js would be the one evaluating mid-
  // cycle, with the calling module's own exports not yet initialized. boot()
  // only ever runs once, explicitly, long after the whole graph has settled,
  // so every one of these bindings is guaranteed to be real by the time it
  // runs — regardless of which module happened to import which module first.
  registerClickActions(portfolioClickActions);
  registerClickActions(initiativesClickActions);
  registerClickActions(initiativeClickActions);
  registerChangeActions(initiativeChangeActions);
  registerInputActions(initiativeInputActions);
  registerClickActions(wizardClickActions);
  registerChangeActions(wizardChangeActions);
  registerInputActions(wizardInputActions);
  registerClickActions(teamsClickActions);
  registerInputActions(teamsInputActions);
  registerClickActions(teamClickActions);
  registerChangeActions(teamChangeActions);
  registerInputActions(teamInputActions);
  registerClickActions(peopleClickActions);
  registerClickActions(personClickActions);
  registerChangeActions(personChangeActions);
  registerInputActions(personInputActions);
  registerClickActions(settingsClickActions);
  registerInputActions(settingsInputActions);
  registerClickActions(phasePanelClickActions);
  registerInputActions(phasePanelInputActions);
  registerClickActions(chartsClickActions);

  const loaded = store.load();
  app = loaded.app;
  loadReason = loaded.reason;
  view = parseHash();

  document.getElementById('wordmark').textContent = PROCESS.wordmark;
  // index.html's static <title> is a sensible no-script fallback, the same
  // way the CSS brand tokens have one — this is what turns it into the
  // brand's own name once the process loads.
  document.title = PROCESS.wordmark;
  // One sprite for the whole app, injected before the first render so no
  // <use> ever points at a symbol that is not there yet.
  fill('sprite', SPRITE);

  // The skip link is the first thing in the tab order and the only way past
  // the header without a mouse. It is a button, not an anchor, because the
  // address fragment belongs to the router (see index.html).
  const skip = document.getElementById('skip-link');
  if (skip) {
    skip.textContent = 'Skip to content';
    skip.addEventListener('click', () => document.getElementById('root')?.focus());
  }

  applyTheme(currentTheme());
  // Writes are debounced, so a failure surfaces long after the edit that
  // caused it. The banner is the only always-visible channel there is.
  store.watchPersistence(() => renderBanner());
  // A courtesy warning, not a lock (D5) — another tab having saved more
  // recently than this one's in-memory copy is the one thing worth
  // interrupting whatever page is open for.
  store.watchExternalChange(() => renderBanner());
  // The linked-file status only has anywhere to render once Settings' Data
  // section exists, so this is a safe no-op everywhere else — refreshFileStatus
  // fills an element by id and does nothing when it isn't on the page.
  store.watchFileBinding(() => refreshFileStatus());
  // Resolves after the first render, since IndexedDB is async — the file
  // status starts as "not linked" and updates itself once this settles.
  store.restoreFileHandle();
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setNavOpen(false);
      closeDialog();
      return closePopover();
    }
    if (event.key === 'Tab') trapPopoverTab(event);
    return onTableKeydown(event);
  });
  // Fixed positioning does not track the trigger, so follow it explicitly.
  window.addEventListener('scroll', positionPopover, { passive: true, capture: true });
  window.addEventListener('resize', positionPopover);
  // rAF-throttled: a raw scroll listener fires far more often than the rail
  // nav's highlight needs to update.
  let railNavRaf = null;
  const scheduleSyncRailNav = () => {
    if (railNavRaf) return;
    railNavRaf = requestAnimationFrame(() => {
      railNavRaf = null;
      syncRailNav();
    });
  };
  window.addEventListener('scroll', scheduleSyncRailNav, { passive: true });
  window.addEventListener('resize', scheduleSyncRailNav);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('change', onFileChange);
  // Back/Forward and a manually edited hash both land here; an in-app
  // navigate() also reaches it, asynchronously, once it writes the hash
  // itself — re-deriving the same view from the same string, so that leg is
  // a harmless repeat of a render that already happened.
  window.addEventListener('hashchange', () => {
    view = parseHash();
    render();
    announceNavigation();
  });
  window.addEventListener('beforeunload', () => store.flush(app));

  render();
  // Canonicalise a missing or unrecognised hash so the address bar reflects
  // reality from the first paint, not only after the first navigation.
  const canonical = hashFor(view);
  if (location.hash !== canonical) location.hash = canonical;
  // A deep link straight into a settings section (e.g. #/settings/danger)
  // has to land there on the very first paint too, not only after a
  // subsequent navigate() — boot() never goes through announceNavigation().
  if (view.page === 'settings') scrollToSettingsSection();
  recordRecentlyViewed(view.page, view.params);
  return loadReason;
}
