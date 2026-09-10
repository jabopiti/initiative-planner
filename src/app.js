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
import * as L from './lifecycle.js';
import * as T from './transfer.js';
import * as P from './people.js';
import * as store from './store.js';
import { PROCESS } from './process.js';

import { html, raw, fill } from './render/dom.js';
import { SPRITE, icon } from './render/icons.js';
import { TABLES } from './render/tables.js';
import { chartYear } from './render/charts.js';
import { phaseTotalsMarkup, grandMarkup } from './render/phase-panel.js';

import { renderPortfolio } from './pages/portfolio.js';
import { renderInitiatives } from './pages/initiatives.js';
import { renderInitiative, bandPanelMarkup } from './pages/initiative.js';
import { renderWizard } from './pages/wizard.js';
import { renderTeams } from './pages/teams.js';
import { renderTeam, capacityCellMarkup } from './pages/team.js';
import { renderPeople } from './pages/people.js';
import { renderPerson } from './pages/person.js';
import { renderSettings, importPreviewMarkup, scrollToSettingsSection } from './pages/settings.js';

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
    html`<button type="button" class="btn btn--small" data-act="export">
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
 * Transient messages
 * ------------------------------------------------------------------ */

/** The timer clearing the current toast, so a second one replaces the first. */
let toastTimer = null;
let pendingUndo = null;

function showToast(text, kind = '', undoCb = null) {
  const node = document.getElementById('toast');
  if (!node) return;
  pendingUndo = undoCb;
  node.innerHTML = html`<div class="toast ${kind}">
    ${raw(icon(kind ? 'warning' : 'check'))}<span>${text}</span>
    ${raw(undoCb ? html`<button type="button" class="btn--small" data-act="undo">Undo</button>` : '')}
  </div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.innerHTML = '';
    pendingUndo = null;
  }, 4000);
}

function withUndo(text, action) {
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

  if (!store.isPersisting()) {
    node.hidden = false;
    node.innerHTML = html`<div class="banner-bar banner-bar--severe" role="alert">
      <span>${raw(icon('warning', 'icon--lead'))}<strong>Changes are no longer being saved.</strong> This browser's storage is
        full or blocked. Export now — anything edited since this appeared exists only on
        this page, and closing it loses the lot.</span>
      <button type="button" class="btn btn--small" data-act="export">Export now</button>
    </div>`;
    return;
  }

  const threshold = app.GENERAL.exportReminderDays;
  const last = app.GENERAL.lastExportAt ? Date.parse(app.GENERAL.lastExportAt) : null;
  const days = last === null ? null : Math.floor((Date.now() - last) / 86400000);

  if (!threshold || (days !== null && days < threshold)) {
    node.hidden = true;
    node.innerHTML = '';
    return;
  }

  // Escalating rather than shouting from the start: the longer it has been
  // ignored, the more it costs to keep ignoring it.
  const overdue = days === null ? threshold : days;
  const level = overdue >= threshold * 3 ? 'severe' : overdue >= threshold * 2 ? 'strong' : 'mild';
  const said = days === null
    ? 'This data has never been exported.'
    : `It has been ${days} days since the last export.`;

  node.hidden = false;
  node.innerHTML = html`<div class="banner-bar banner-bar--${level}">
    <span>${raw(level === 'mild' ? '' : icon('warning', 'icon--lead'))}${said} An export is the
      only backup — everything here lives in this browser alone.</span>
    <button type="button" class="btn btn--small" data-act="export">
      ${raw(icon('export'))}Export now</button>
  </div>`;
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

const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function openPopover(trigger, markup) {
  const node = document.getElementById('popover');
  if (!node) return;
  popoverTrigger = trigger;
  node.innerHTML = markup;
  node.hidden = false;
  positionPopover();
  // Non-modal (aria-modal="false"): move focus in and trap Tab only when
  // there is something to tab between. With no focusable content, the
  // container itself (tabindex="-1" in index.html) takes focus instead.
  const focusable = node.querySelector(FOCUSABLE);
  if (focusable instanceof HTMLElement) focusable.focus();
  else node.focus();
}

function closePopover() {
  const node = document.getElementById('popover');
  if (!node || node.hidden) return;
  node.hidden = true;
  node.innerHTML = '';
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
 * State
 * ------------------------------------------------------------------ */

/** The whole dataset, and how it was loaded. */
export let app = null;
let loadReason = 'empty';

/** Current page plus its params (DESIGN §5). */
export let view = { page: 'portfolio', params: {} };

export const PAGES = [
  { id: 'portfolio', label: 'Portfolio', kind: 'dashboard' },
  { id: 'initiatives', label: 'Initiatives', kind: 'overview' },
  { id: 'teams', label: 'Teams', kind: 'overview' },
  { id: 'people', label: 'People', kind: 'overview' },
  { id: 'settings', label: 'Settings', kind: 'settings' },
];

export const STATUS_LABELS = {
  active: 'Active',
  'on-hold': 'On hold',
  cancelled: 'Cancelled',
  closed: 'Closed',
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
 * point of the artifact (REVAMP.md §2.1).
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

  if (view.page === 'settings') return renderSettings();
  if (view.page === 'people') return renderPeople();
  if (view.page === 'person') return renderPerson();
  if (view.page === 'teams') return renderTeams();
  if (view.page === 'team') return renderTeam();
  if (view.page === 'initiatives') return renderInitiatives();
  if (view.page === 'wizard') return renderWizard();
  if (view.page === 'initiative') return renderInitiative();
  if (view.page === 'portfolio') return renderPortfolio();

  fill(
    'root',
    html`<h1>${current.label}</h1>
      <p class="muted">Not built yet — this ${current.kind} page arrives in a later phase.</p>`,
  );
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
function refreshCalcRegions(initiative) {
  for (const [phaseId, phase] of Object.entries(initiative.phases)) {
    const at = E.ratesFor(app, phase);
    for (const allocation of phase.allocations) {
      const days = document.querySelector(`[data-calc="days-${phaseId}-${allocation.personId}"]`);
      const cost = document.querySelector(`[data-calc="cost-${phaseId}-${allocation.personId}"]`);
      if (!days && !cost) continue;

      const figures = E.allocationFigures(phase, allocation.personId, allocation.allocationPct, at);
      if (days) days.textContent = figures.personDays.toFixed(1);
      if (cost) cost.textContent = F.money(figures.cost);
    }

    const total = document.querySelector(`[data-calc="total-${phaseId}"]`);
    if (total) fill(total, phaseTotalsMarkup(initiative, phaseId));
  }

  // Blended monthly figures share a table with the actual inputs, so they are
  // written cell by cell rather than rebuilt.
  for (const month of E.initiativeMonths(initiative)) {
    const cell = document.querySelector(`[data-calc="blended-${F.month(month)}"]`);
    if (cell) fill(cell, html`<strong>${F.money(E.initiativeCostInMonth(initiative, app, month))}</strong>`);
  }

  // These hold no inputs, so they are safe to rebuild whole — and have to be:
  // the total, its track, the marker and the variance all move together.
  const panel = document.querySelector('[data-calc="band-panel"]');
  if (panel) fill(panel, bandPanelMarkup(initiative));
  const grand = document.querySelector('[data-calc="grand"]');
  if (grand) fill(grand, grandMarkup(initiative));
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

/** A validated import awaiting a Replace/Merge choice. Never auto-applied. */
export let pendingImport = null;

function findInitiative(id) {
  const initiative = app.INITIATIVES.find((i) => i.id === id);
  if (!initiative) throw new Error(`unknown initiative: ${id}`);
  return initiative;
}

/** Typing: update the model in place, never the structure. */
function onInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const act = target.dataset.act;
  if (!act) return;

  const id = target.dataset.id;
  const field = target.dataset.field;

  if (act === 'role-field') {
    if (id === 'new') {
      const newId = L.newId('role');
      app.ROLES[newId] = { id: newId, name: '', abbr: '', factor: 1, active: true };
      app.ROLES[newId][field] = field === 'factor' ? F.readNumber(target.value, 1) : target.value;
      const caret = target.selectionStart;
      commit();
      const restored = document.querySelector(`[data-act="role-field"][data-field="${field}"][data-id="${newId}"]`);
      if (restored instanceof HTMLInputElement) {
        restored.focus();
        restored.setSelectionRange(caret, caret);
      }
      return;
    }
    const role = app.ROLES[id];
    role[field] = field === 'factor' ? F.readNumber(target.value, role.factor) : target.value;
  } else if (act === 'country-field') {
    if (id === 'new') {
      const newId = L.newId('country');
      const years = Object.keys(Object.values(app.COUNTRIES)[0]?.byYear ?? {});
      app.COUNTRIES[newId] = {
        id: newId,
        name: target.value,
        active: true,
        // Prefilled with the calendar's own weekday count for that year, so
        // the field shows what a holiday-free month looks like rather than
        // an unexplained zero (§4.3).
        byYear: Object.fromEntries(
          years.map((year) => [year, {
            rate: 0,
            workingDays: Array.from({ length: 12 }, (_, month) => E.weekdaysInMonth(Number(year), month)),
          }]),
        ),
      };
      const caret = target.selectionStart;
      commit();
      const restored = document.querySelector(`[data-act="country-field"][data-field="${field}"][data-id="${newId}"]`);
      if (restored instanceof HTMLInputElement) {
        restored.focus();
        restored.setSelectionRange(caret, caret);
      }
      return;
    }
    app.COUNTRIES[id][field] = target.value;
  } else if (act === 'country-rate') {
    const record = app.COUNTRIES[id].byYear[target.dataset.year];
    record.rate = F.readNumber(target.value, record.rate);
  } else if (act === 'country-workday') {
    const record = app.COUNTRIES[id].byYear[target.dataset.year];
    const month = Number(target.dataset.month);
    record.workingDays[month] = Math.max(0, F.readNumber(target.value, record.workingDays[month]));
  } else if (act === 'person-field') {
    const person = app.PEOPLE[id];
    person[field] = field === 'capacityPct' ? F.readNumber(target.value, person.capacityPct) : target.value;
  } else if (act === 'person-custom-label') {
    app.PEOPLE[id].customRole.label = target.value;
  } else if (act === 'person-rate') {
    P.setCustomRate(app.PEOPLE[id], target.dataset.year, F.readNumber(target.value, 0));
  } else if (act === 'membership-share') {
    const person = app.PEOPLE[id];
    const team = target.dataset.team;
    const current = person.memberships.find((m) => m.teamId === team);
    P.setMembershipShare(person, team, F.readNumber(target.value, current.sharePct));
  } else if (act === 'people-filter' || act === 'initiatives-filter') {
    // Search is the one filter that must react per keystroke, and filtering
    // rebuilds the table the box sits above. Re-render, then put the caret
    // back exactly where it was — the invariant is that typing never *loses*
    // the caret, not that nothing may re-render.
    const page = act === 'people-filter' ? 'people' : 'initiatives';
    const filters = { ...(view.params.filters ?? {}), [target.dataset.filter]: target.value };
    const caret = target.selectionStart;
    navigate(page, { ...view.params, filters });
    const restored = document.querySelector(`[data-act="${act}"][data-filter="${target.dataset.filter}"]`);
    if (restored instanceof HTMLInputElement) {
      restored.focus();
      restored.setSelectionRange(caret, caret);
    }
    return;
  } else if (act === 'draft-field') {
    // The draft lives in view params until step 1 is saved, so it survives
    // re-renders without an initiative existing yet.
    const draft = { ...(view.params.draft ?? store.loadDraft()), [field]: target.value };
    view.params = { ...view.params, draft };
    store.saveDraft(draft);
    // Only the create button's enabled state depends on this, so refresh
    // nothing else and leave the caret alone.
    const create = document.querySelector('[data-act="draft-create"]');
    if (create instanceof HTMLButtonElement) create.disabled = !(draft.name ?? '').trim();
    return;
  } else if (act === 'team-draft-field' || act === 'person-draft-field') {
    // Neither team nor person exists yet, so — unlike every other draft — an
    // in-memory params object is enough; there is nothing worth surviving a
    // reload before a name has even been typed (D1).
    const createAct = act === 'team-draft-field' ? 'team-draft-create' : 'person-draft-create';
    const draft = { ...view.params.draft, [field]: target.value };
    view.params = { ...view.params, draft };
    const create = document.querySelector(`[data-act="${createAct}"]`);
    if (create instanceof HTMLButtonElement) create.disabled = !(draft.name ?? '').trim();
    return;
  } else if (act === 'allocation-pct') {
    const initiative = findInitiative(target.dataset.id);
    const phaseId = target.dataset.phase;
    const current = initiative.phases[phaseId].allocations
      .find((a) => a.personId === target.dataset.person);
    L.setAllocation(app, initiative, phaseId, target.dataset.person,
      F.readNumber(target.value, current.allocationPct));
    commitQuietly();
    return refreshCalcRegions(initiative);
  } else if (act === 'actual-month') {
    const initiative = findInitiative(target.dataset.id);
    const phaseId = target.dataset.phase;
    const raw = target.value.trim();
    L.recordActual(initiative, phaseId, target.dataset.month,
      raw === '' ? null : F.readNumber(raw, 0));
    commitQuietly();
    // Recording an actual moves the blended figures, not the structure.
    return refreshCalcRegions(initiative);
  } else if (act === 'checklist-note') {
    L.setChecklistNote(findInitiative(target.dataset.id), target.dataset.gate,
      target.dataset.item, target.value);
  } else if (act === 'cost-field') {
    const initiative = findInitiative(target.dataset.id);
    const phaseId = target.dataset.phase;
    const costId = target.dataset.cost;
    const field = target.dataset.field;

    if (costId === 'new') {
      const newCost = {
        id: L.newId('cost'),
        name: field === 'name' ? target.value : 'New cost',
        month: field === 'month' ? target.value : '',
        amount: field === 'amount' ? F.readNumber(target.value, 0) : 0,
      };
      initiative.phases[phaseId].otherCosts.push(newCost);
      const caret = target.selectionStart;
      commit();
      const restored = document.querySelector(`[data-act="cost-field"][data-field="${field}"][data-phase="${phaseId}"][data-cost="${newCost.id}"]`);
      if (restored instanceof HTMLInputElement) {
        restored.focus();
        restored.setSelectionRange(caret, caret);
      }
      return;
    }

    const item = initiative.phases[phaseId].otherCosts.find((c) => c.id === costId);
    if (field === 'amount') item.amount = F.readNumber(target.value, item.amount);
    else item[field] = target.value;
    // Changing an amount moves phase totals. Re-render the affected totals.
    if (field === 'amount') {
      commitQuietly();
      return refreshCalcRegions(initiative);
    }
  } else if (act === 'team-name') {
    P.renameTeam(app.TEAMS[id], target.value);
  } else if (act === 'initiative-description') {
    L.setDescription(findInitiative(id), target.value);
  } else if (act === 'initiative-notes') {
    L.setNotes(findInitiative(id), target.value);
  } else if (act === 'general-field') {
    // 0 is a real, meaningful value here — it turns the reminder off — so
    // the bound is only against nonsense, not against the low end.
    const read = F.readNumber(target.value, app.GENERAL.exportReminderDays);
    app.GENERAL[field] = Math.min(365, Math.max(0, read));
  } else {
    return;
  }

  commitQuietly();
}

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

  const { act, id } = trigger.dataset;
  const section = view.params.section ?? 'roles';

  switch (act) {
    case 'page':
      return navigate(trigger.dataset.page);
    case 'section':
      return navigate('settings', { section: trigger.dataset.section });
    case 'undo':
      if (pendingUndo) {
        pendingUndo();
        pendingUndo = null;
        const node = document.getElementById('toast');
        if (node) node.innerHTML = '';
      }
      return undefined;

    case 'nav-toggle':
      return setNavOpen(!navOpen);


    case 'role-active':
      app.ROLES[id].active = !app.ROLES[id].active;
      return commit();
    case 'role-deactivate-arm':
      return navigate('settings', { ...view.params, confirmDeactivate: id });

    case 'country-active':
      app.COUNTRIES[id].active = !app.COUNTRIES[id].active;
      return commit();
    case 'country-deactivate-arm':
      return navigate('settings', { ...view.params, confirmDeactivate: id });
    case 'deactivate-cancel':
      return navigate('settings', { ...view.params, confirmDeactivate: null });
    case 'country-expand':
      return navigate('settings', {
        section,
        expanded: view.params.expanded === id ? null : id,
      });
    case 'country-apply-all': {
      // 48 cells per country typed one at a time is the real pain (§4.3) —
      // this is a scratch value, not itself a data field, so it carries no
      // data-act of its own and is read here rather than committed on input.
      const year = trigger.dataset.year;
      const input = document.querySelector(
        `[data-field="bulk-workdays"][data-id="${id}"][data-year="${year}"]`,
      );
      if (!(input instanceof HTMLInputElement)) return undefined;
      const value = Math.max(0, F.readNumber(input.value, 0));
      app.COUNTRIES[id].byYear[year].workingDays = Array(12).fill(value);
      return commit();
    }
    case 'country-copy-year': {
      const year = trigger.dataset.year;
      const country = app.COUNTRIES[id];
      const source = country.byYear[year];
      for (const otherYear of Object.keys(country.byYear)) {
        if (otherYear === year) continue;
        country.byYear[otherYear] = { rate: source.rate, workingDays: [...source.workingDays] };
      }
      return commit();
    }

    case 'theme':
      return cycleTheme();
    case 'export':
      if (!store.downloadExport(app)) return undefined;
      app.GENERAL.lastExportAt = new Date().toISOString();
      return commit();
    case 'import-mode':
      pendingImport.mode = trigger.dataset.mode;
      return fill('import-preview', importPreviewMarkup());
    case 'import-cancel':
      pendingImport = null;
      return fill('import-preview', importPreviewMarkup());
    case 'import-apply': {
      app = T.applyImport(app, pendingImport.data, pendingImport.mode);
      pendingImport = null;
      store.saveNow(app);
      return navigate('settings', { section: 'data' });
    }


    case 'capacity-cell':
      return openPopover(
        trigger,
        capacityCellMarkup(trigger.dataset.person, trigger.dataset.team, trigger.dataset.month),
      );
    case 'year-step':
      return navigate(view.page, {
        ...view.params,
        year: chartYear() + Number(trigger.dataset.step),
      });
    case 'year-today':
      return navigate(view.page, { ...view.params, year: new Date().getFullYear() });

    case 'wizard-start':
      return navigate('wizard', {});
    case 'draft-discard':
      store.clearDraft();
      return navigate('initiatives', {});
    case 'draft-create': {
      const draft = view.params.draft ?? store.loadDraft();
      if (!(draft.name ?? '').trim()) return undefined;
      const initiative = L.createInitiative(app, PROCESS, {
        name: draft.name.trim(),
        description: draft.description ?? '',
        teamId: draft.teamId ?? Object.keys(app.TEAMS)[0],
        startPhaseId: draft.startPhaseId,
        skipReason: draft.skipReason,
      });
      store.clearDraft();
      store.save(app);
      return navigate('wizard', { id: initiative.id });
    }
    case 'pass-gate': {
      const initiative = findInitiative(id);
      const date = document.querySelector('[data-field="gate-date"]');
      L.passGate(app, PROCESS, initiative, trigger.dataset.gate,
        date instanceof HTMLInputElement && date.value ? date.value : today());
      return commit();
    }
    case 'skip-gate': {
      const initiative = findInitiative(id);
      const field = document.querySelector('[data-field="skip-reason"]');
      const reason = field instanceof HTMLInputElement ? field.value.trim() : '';
      if (!reason) {
        // Refusing silently would look broken; say what is missing.
        if (field instanceof HTMLInputElement) {
          field.placeholder = 'A reason is required before a gate can be skipped';
          field.focus();
        }
        return undefined;
      }
      const date = document.querySelector('[data-field="gate-date"]');
      L.skipGate(app, PROCESS, initiative, trigger.dataset.gate, reason,
        date instanceof HTMLInputElement && date.value ? date.value : today());
      return commit();
    }
    case 'reopen':
      L.reopen(PROCESS, findInitiative(id));
      return commit();

    case 'open-initiative':
      return navigate('initiative', { id });
    case 'duplicate-initiative': {
      const copy = L.duplicate(app, PROCESS, findInitiative(id));
      store.save(app);
      return navigate('initiative', { id: copy.id });
    }
    case 'initiative-delete-arm':
      return navigate('initiative', { ...view.params, confirmDelete: true });
    case 'initiative-delete-cancel':
      return navigate('initiative', { ...view.params, confirmDelete: false });
    case 'initiative-delete-confirm':
      L.deleteInitiative(app, id);
      store.save(app);
      return navigate('initiatives', {});
    case 'portfolio-tile': {
      // Clicking the selected tile again clears the filter.
      const band = trigger.dataset.band;
      const next = view.params.bandId === band ? null : band;
      return navigate('portfolio', { ...view.params, bandId: next });
    }
    case 'sort-people': {
      const current = view.params.sort ?? { key: 'name', dir: 'asc' };
      const key = trigger.dataset.key;
      const dir = current.key === key && current.dir === 'asc' ? 'desc' : 'asc';
      return navigate('people', { ...view.params, sort: { key, dir } });
    }
    case 'sort-portfolio': {
      const current = view.params.sort ?? { key: 'effective', dir: 'desc' };
      const key = trigger.dataset.key;
      const dir = current.key === key && current.dir === 'desc' ? 'asc' : 'desc';
      return navigate('portfolio', { ...view.params, sort: { key, dir } });
    }
    case 'sort-initiatives': {
      const current = view.params.sort ?? { key: 'name', dir: 'asc' };
      const key = trigger.dataset.key;
      const dir = current.key === key && current.dir === 'asc' ? 'desc' : 'asc';
      return navigate('initiatives', { ...view.params, sort: { key, dir } });
    }


    case 'allocation-remove': {
      const initiative = findInitiative(id);
      withUndo('Removed allocation', () => {
        L.setAllocation(app, initiative, trigger.dataset.phase, trigger.dataset.person, 0);
      });
      return commit();
    }
    case 'cost-remove': {
      const initiative = findInitiative(id);
      const phase = initiative.phases[trigger.dataset.phase];
      const cost = phase.otherCosts.find((c) => c.id === trigger.dataset.cost);
      withUndo(`Removed ${cost.name}`, () => {
        phase.otherCosts = phase.otherCosts.filter((c) => c.id !== trigger.dataset.cost);
      });
      return commit();
    }
    case 'team-add':
      // Nothing is created yet — Cancel on the draft below leaves no record
      // behind (D1, and the review's "a team is just created with no chance
      // to cancel").
      return navigate('team', { id: 'new' });
    case 'team-draft-discard':
      return navigate('teams', {});
    case 'team-draft-create': {
      const name = (view.params.draft?.name ?? '').trim();
      if (!name) return undefined;
      const team = P.createTeam(app, name);
      store.save(app);
      return navigate('team', { id: team.id });
    }
    case 'team-active':
      P.setTeamActive(app.TEAMS[id], !app.TEAMS[id].active);
      return commit();
    case 'team-delete': {
      // Guarded in the UI too, but never trust the disabled attribute alone.
      if (!P.canDeleteTeam(app, id).ok) return undefined;
      withUndo(`Deleted team ${app.TEAMS[id].name}`, () => {
        P.deleteTeam(app, id);
      });
      return commit();
    }


    case 'person-add':
      // Nothing is created yet — Cancel on the draft below leaves no record
      // behind (D1, and the review's "a person is just created with no
      // chance to cancel").
      return navigate('person', { id: 'new' });
    case 'person-draft-discard':
      return navigate('people', {});
    case 'person-draft-create': {
      const draft = view.params.draft ?? {};
      const name = (draft.name ?? '').trim();
      if (!name) return undefined;
      const person = P.createPerson(app, {
        name,
        countryId: draft.countryId,
        roleId: draft.roleId,
      });
      store.save(app);
      return navigate('person', { id: person.id });
    }
    case 'person-active':
      P.setPersonActive(app.PEOPLE[id], !app.PEOPLE[id].active);
      return commit();
    case 'join-team': {
      const select = document.querySelector(`[data-act="join-team-pick"][data-id="${id}"]`);
      if (select instanceof HTMLSelectElement) P.addMembership(app.PEOPLE[id], select.value, 0);
      return commit();
    }
    case 'membership-active': {
      const person = app.PEOPLE[id];
      const team = trigger.dataset.team;
      const current = person.memberships.find((m) => m.teamId === team);
      P.setMembershipActive(app, person, team, !current.active);
      return commit();
    }
    case 'month-today':
      return navigate(view.page, { ...view.params, month: currentMonth() });

    case 'copy-table': {
      const table = TABLES[trigger.dataset.table];
      // The confirmation moved from a note beside the button to a toast: the
      // button sits under tables that scroll inside their own box, so the
      // note could land off-screen from the thing that produced it.
      store.copyTable(table.headers, table.rows).then((result) => {
        if (result === 'failed') showToast('Copy failed', 'toast--warn');
        else showToast('Copied');
      });
      return undefined;
    }
    case 'csv-table': {
      const table = TABLES[trigger.dataset.table];
      store.downloadCsv(`${table.name}.csv`, table.headers, table.rows);
      return undefined;
    }

    case 'reset-arm':
      return navigate('settings', { section, armed: true });
    case 'reset-cancel':
      return navigate('settings', { section, armed: false });
    case 'reset-confirm': {
      store.reset();
      const fresh = store.load();
      app = fresh.app;
      return navigate('settings', { section: 'roles' });
    }
    default:
      return undefined;
  }
}

/** Selects, radios and checkboxes — structural, so these do re-render. */
function onChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement) && !(target instanceof HTMLInputElement)) return;
  const { act, id } = target.dataset;

  switch (act) {
    case 'month-picker':
      return navigate(view.page, { ...view.params, month: target.value });
    case 'people-filter': {
      const filters = { ...(view.params.filters ?? {}) };
      const key = target.dataset.filter;
      filters[key] = target.type === 'checkbox' ? target.checked : target.value;
      return navigate('people', { ...view.params, filters });
    }
    case 'draft-select': {
      const draft = {
        ...(view.params.draft ?? store.loadDraft()),
        [target.dataset.field]: target.value,
      };
      store.saveDraft(draft);
      return navigate('wizard', { ...view.params, draft });
    }
    case 'person-draft-select': {
      const draft = { ...view.params.draft, [target.dataset.field]: target.value };
      return navigate('person', { ...view.params, draft });
    }
    case 'initiatives-filter': {
      const filters = { ...(view.params.filters ?? {}) };
      filters[target.dataset.filter] = target.value;
      return navigate('initiatives', { ...view.params, filters });
    }
    case 'initiative-status':
      L.setStatus(findInitiative(id), target.value);
      return commit();
    case 'phase-start':
    case 'phase-end': {
      const initiative = findInitiative(id);
      const phase = initiative.phases[target.dataset.phase];
      const start = act === 'phase-start' ? target.value : phase.estStartDate;
      const end = act === 'phase-end' ? target.value : phase.estEndDate;
      L.setPhasePeriod(initiative, target.dataset.phase, start || null, end || null);
      return commit();
    }
    case 'checklist-status':
      L.setChecklistStatus(findInitiative(id), target.dataset.gate, target.dataset.item,
        target.value);
      return commit();
    case 'person-country':
      app.PEOPLE[id].countryId = target.value;
      return commit();
    case 'person-role':
      P.useStandardRole(app.PEOPLE[id], target.value);
      return commit();
    case 'rate-kind': {
      const person = app.PEOPLE[id];
      if (target.dataset.kind === 'custom') P.useCustomRole(app, person);
      else P.useStandardRole(person);
      return commit();
    }
    case 'add-member':
      P.addMembership(app.PEOPLE[target.value], id, 0);
      return commit();
    case 'allocation-add': {
      const initiative = findInitiative(id);
      L.setAllocation(app, initiative, target.dataset.phase, target.value, 50);
      return commit();
    }
    default:
      return undefined;
  }
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
  const loaded = store.load();
  app = loaded.app;
  loadReason = loaded.reason;
  view = parseHash();

  document.getElementById('wordmark').textContent = 'Initiative Planner';
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
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setNavOpen(false);
      return closePopover();
    }
    if (event.key === 'Tab') trapPopoverTab(event);
    return onTableKeydown(event);
  });
  // Fixed positioning does not track the trigger, so follow it explicitly.
  window.addEventListener('scroll', positionPopover, { passive: true, capture: true });
  window.addEventListener('resize', positionPopover);
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
  return loadReason;
}
