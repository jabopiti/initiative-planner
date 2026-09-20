/**
 * The creation wizard: two steps, resumable.
 */
import * as E from '../engine.js';
import * as L from '../lifecycle.js';
import * as store from '../store.js';
import { PROCESS } from '../process.js';
import { app, view, navigate, today } from '../app.js';
import { html, raw, fill } from '../render/dom.js';
import { icon } from '../render/icons.js';
import { pageHead, empty, panel } from '../render/components.js';
import { costedPhasePanels, grandMarkup } from '../render/phase-panel.js';

/**
 * F1's front door: "existing" whenever there is anything to copy from and
 * the draft hasn't said otherwise, since it is the default-focused option;
 * "scratch" is the only choice with nothing yet to start from. Shared by the
 * render and by draft-create so the two can never resolve a bare (mode-less)
 * draft — the state a fresh wizard starts in — two different ways.
 */
function resolveDraftMode(draft) {
  return app.INITIATIVES.length === 0 ? 'scratch' : (draft.mode ?? 'existing');
}

/**
 * Two steps, resumable. Step 1 creates the initiative immediately, so step 2
 * is editing a real record rather than holding a draft in memory — which is
 * what makes leaving and returning lossless.
 */
export function renderWizard() {
  const initiative = view.params.id ? app.INITIATIVES.find((i) => i.id === view.params.id) : null;
  return initiative ? renderWizardEstimates(initiative) : renderWizardGeneral();
}

function renderWizardGeneral() {
  const draft = view.params.draft ?? store.loadDraft();
  const teams = Object.values(app.TEAMS).filter((team) => team.active);
  const order = E.phaseOrder(PROCESS);
  const startPhaseId = draft.startPhaseId ?? order[0];
  const skipped = order.slice(0, order.indexOf(startPhaseId));

  if (teams.length === 0) {
    return fill(
      'root',
      html`${raw(pageHead({ title: 'New initiative' }))}
        ${raw(empty('An initiative belongs to a team, and there are no active teams yet.', {
          icon: 'add',
          action: html`<button type="button" class="btn btn--primary" data-act="page"
            data-page="teams">${raw(icon('add'))}Create a team first</button>`,
        }))}`,
    );
  }

  // F1: starting from an existing initiative — search, pick, adjust what's
  // different — is the default-focused front door; there is nothing to
  // start from until at least one initiative exists, in which case scratch
  // is the only option and the chooser itself would be a dead end.
  const candidates = app.INITIATIVES.slice().sort((a, b) => a.name.localeCompare(b.name));
  const mode = resolveDraftMode(draft);
  const source = mode === 'existing' && draft.sourceId
    ? candidates.find((i) => i.id === draft.sourceId)
    : null;
  const canCreate = mode === 'existing'
    ? Boolean(source) && (draft.name ?? '').trim()
    : Boolean((draft.name ?? '').trim());

  fill(
    'root',
    html`${raw(pageHead({ title: 'New initiative' }))}
      <ol class="steps"><li aria-current="step">General</li><li>Estimates</li></ol>

      <div class="panel">
        ${raw(candidates.length
          ? html`<div class="tabs" role="tablist">
              <button type="button" role="tab" data-act="draft-mode" data-mode="existing"
                aria-selected="${mode === 'existing'}">Start from an existing initiative</button>
              <button type="button" role="tab" data-act="draft-mode" data-mode="scratch"
                aria-selected="${mode === 'scratch'}">Start from scratch</button>
            </div>`
          : '')}

        ${raw(mode === 'existing'
          ? html`<div class="fields">
              <label class="field-row"><span>Copy from</span>
                <select class="field field--select" data-act="draft-source">
                  <option value="">Choose an initiative…</option>
                  ${raw(candidates.map((i) => html`<option value="${i.id}"
                    ${raw(draft.sourceId === i.id ? 'selected' : '')}
                    >${i.name} — ${app.TEAMS[i.teamId]?.name ?? ''}</option>`).join(''))}
                </select></label>
            </div>
            ${raw(source
              ? html`<p class="micro">Copies every phase's period, allocations and other costs
                  from “${source.name}.” Its gates, checklist history and actuals do not come
                  along — the copy starts fresh at the first phase.</p>
                  <div class="fields">
                    <label class="field-row"><span>Name</span>
                      <input class="field" data-act="draft-field" data-field="name"
                        value="${draft.name ?? ''}" placeholder="What is it called?" /></label>
                    <label class="field-row"><span>Description</span>
                      <input class="field" data-act="draft-field" data-field="description"
                        value="${draft.description ?? ''}" /></label>
                    <label class="field-row"><span>Team</span>
                      <select class="field field--select" data-act="draft-select" data-field="teamId">
                        ${raw(teams.map((team) => html`<option value="${team.id}"
                          ${raw(draft.teamId === team.id ? 'selected' : '')}
                          >${team.name}</option>`).join(''))}
                      </select></label>
                  </div>`
              : '')}`
          : html`<div class="fields">
              <label class="field-row"><span>Name</span>
                <input class="field" data-act="draft-field" data-field="name"
                  value="${draft.name ?? ''}" placeholder="What is it called?" /></label>
              <label class="field-row"><span>Description</span>
                <input class="field" data-act="draft-field" data-field="description"
                  value="${draft.description ?? ''}" /></label>
              <label class="field-row"><span>Team</span>
                <select class="field field--select" data-act="draft-select" data-field="teamId">
                  ${raw(teams.map((team) => html`<option value="${team.id}"
                    ${raw(draft.teamId === team.id ? 'selected' : '')}>${team.name}</option>`).join(''))}
                </select></label>
              <label class="field-row"><span>Starting phase</span>
                <select class="field field--select" data-act="draft-select" data-field="startPhaseId">
                  ${raw(PROCESS.phases.map((phase) => html`<option value="${phase.id}"
                    ${raw(startPhaseId === phase.id ? 'selected' : '')}>${phase.label}</option>`).join(''))}
                </select></label>
            </div>

            ${raw(skipped.length
              ? html`<div class="issues">
                  <p class="warn">${raw(icon('skip', 'icon--lead'))}Starting at
                    ${E.phaseLabel(PROCESS, startPhaseId)} records
                    ${skipped.length} earlier gate${skipped.length === 1 ? '' : 's'} as skipped:
                    ${skipped.map((id) => E.gateForPhase(PROCESS, id).label).join(', ')}. They
                    approve nothing and freeze nothing.</p>
                  <label class="field-row"><span>Reason</span>
                    <input class="field" data-act="draft-field" data-field="skipReason"
                      value="${draft.skipReason ?? 'Already in progress when entered into the tool'}" /></label>
                </div>`
              : '')}`)}

        <div class="actions">
          <button type="button" class="btn btn--primary" data-act="draft-create"
            ${raw(canCreate ? '' : 'disabled')}
            >${raw(icon('add'))}Create and continue</button>
          <button type="button" class="btn" data-act="draft-discard">Cancel</button>
        </div>
        ${raw(canCreate
          ? ''
          : html`<p class="muted">${mode === 'existing'
              ? 'Pick an initiative to copy from, and give the copy a name.'
              : 'A name is needed first.'}</p>`)}
      </div>`,
  );
}

/**
 * Step 2, and how it ends.
 *
 * The initiative is real from step 1 — that is what makes the flow
 * resumable — so leaving here is not "cancelling a form", it is deciding what
 * to do with a record that already exists. The old single "Done" button said
 * none of that: it navigated, and walking away instead left a half-formed
 * initiative in the registry with nothing marking it (§2.6).
 *
 * Three named exits, and the step says first whether the estimate is
 * complete, so whichever one is taken is taken knowingly. An incomplete
 * estimate is still fine to leave — the gate is what blocks progress, not
 * this step — but it is now something you are told rather than something you
 * find out later at a gate.
 */
function renderWizardEstimates(initiative) {
  const panels = costedPhasePanels(initiative);
  const missing = L.unestimatedPhases(PROCESS, initiative, today());
  const discarding = view.params.confirmDiscard === true;

  fill(
    'root',
    html`${raw(pageHead({
      title: initiative.name,
      lede: 'Fill in as much as you know. An incomplete estimate is fine to leave — the gate '
        + 'is what blocks progress later, not this step.',
    }))}
      <ol class="steps"><li>General</li><li aria-current="step">Estimates</li></ol>

      ${raw(panel({
        id: 'wizard-total',
        title: 'Grand total',
        extraClass: 'panel--inset',
        body: html`<p data-calc="grand" aria-live="polite" aria-atomic="true">
            ${raw(grandMarkup(initiative))}</p>
          <p class="${missing.length ? 'warn' : 'muted'}">${raw(missing.length
            ? html`${raw(icon('warning', 'icon--lead'))}${missing
                .map((phaseId) => E.phaseLabel(PROCESS, phaseId)).join(' and ')}
              still ${missing.length === 1 ? 'needs' : 'need'} a period and at least one person
              allocated.`
            : html`${raw(icon('check', 'icon--lead'))}Every costed phase has a period and
              someone allocated.`)}</p>`,
      }))}

      ${raw(panels)}

      ${raw(discarding
        ? html`<div class="panel banner banner--alert">
            <p class="warn">${raw(icon('warning', 'icon--lead'))}Discard “${initiative.name}”?
              It was created when you finished the first step, so this deletes it — the
              periods, allocations and costs below go with it. There is no undo.</p>
            <div class="actions">
              <button type="button" class="btn btn--danger" data-act="wizard-discard-confirm"
                data-id="${initiative.id}">${raw(icon('remove'))}Yes, discard it</button>
              <button type="button" class="btn" data-act="wizard-discard-cancel"
                data-id="${initiative.id}">Cancel</button>
            </div>
          </div>`
        : '')}

      <div class="actions">
        <button type="button" class="btn btn--primary" data-act="open-initiative"
          data-id="${initiative.id}">${raw(icon('check'))}Finish</button>
        <button type="button" class="btn" data-act="page" data-page="initiatives">
          Come back to it later</button>
        <button type="button" class="btn btn--danger" data-act="wizard-discard-arm"
          data-id="${initiative.id}">${raw(icon('remove'))}Discard this initiative</button>
      </div>
      <p class="micro">Finishing opens it in full. Coming back to it later leaves it in the
        registry, marked as still needing an estimate.</p>`,
  );
}

export const wizardClickActions = {
  'wizard-start': () => navigate('wizard', {}),
  'draft-discard': () => {
    store.clearDraft();
    return navigate('initiatives', {});
  },
  'draft-create': () => {
    const draft = view.params.draft ?? store.loadDraft();
    if (!(draft.name ?? '').trim()) return undefined;

    let initiative;
    if (resolveDraftMode(draft) === 'existing') {
      // F1: built entirely on the existing duplicate() logic — the copy
      // starts out exactly as a manual Duplicate would, then the draft's own
      // General-step edits (whatever the person changed from the source's
      // defaults) are applied on top of it.
      const source = app.INITIATIVES.find((i) => i.id === draft.sourceId);
      if (!source) return undefined;
      initiative = L.duplicate(app, PROCESS, source);
      L.renameInitiative(initiative, draft.name.trim());
      L.setDescription(initiative, draft.description ?? '');
      L.setTeam(app, initiative, draft.teamId ?? source.teamId);
    } else {
      initiative = L.createInitiative(app, PROCESS, {
        name: draft.name.trim(),
        description: draft.description ?? '',
        teamId: draft.teamId ?? Object.keys(app.TEAMS)[0],
        startPhaseId: draft.startPhaseId,
        skipReason: draft.skipReason,
      });
    }
    store.clearDraft();
    store.save(app);
    return navigate('wizard', { id: initiative.id });
  },
  'draft-mode': ({ trigger }) => {
    const draft = { ...(view.params.draft ?? store.loadDraft()), mode: trigger.dataset.mode };
    store.saveDraft(draft);
    return navigate('wizard', { ...view.params, draft });
  },
  'wizard-discard-arm': () => navigate('wizard', { ...view.params, confirmDiscard: true }),
  'wizard-discard-cancel': () => navigate('wizard', { ...view.params, confirmDiscard: false }),
  'wizard-discard-confirm': ({ id }) => {
    // The initiative is real from step 1, so abandoning the flow has to be
    // able to remove it — otherwise walking away leaves a half-formed
    // record in the registry, which is the finding this answers (§2.6).
    L.deleteInitiative(app, id);
    store.save(app);
    return navigate('initiatives', {});
  },
};

export const wizardChangeActions = {
  'draft-select': ({ target }) => {
    const draft = {
      ...(view.params.draft ?? store.loadDraft()),
      [target.dataset.field]: target.value,
    };
    store.saveDraft(draft);
    return navigate('wizard', { ...view.params, draft });
  },
  // F1: picking the source initiative pre-fills Name/Description/Team from
  // it, the same defaults duplicate() itself would give the copy — still
  // freely editable afterward, since picking is "start here," not "commit
  // to this exactly."
  'draft-source': ({ target }) => {
    const sourceId = target.value;
    const source = app.INITIATIVES.find((i) => i.id === sourceId);
    const draft = {
      ...(view.params.draft ?? store.loadDraft()),
      sourceId,
      ...(source
        ? { name: `${source.name} (copy)`, description: source.description, teamId: source.teamId }
        : {}),
    };
    store.saveDraft(draft);
    return navigate('wizard', { ...view.params, draft });
  },
};

export const wizardInputActions = {
  'draft-field': ({ target, field }) => {
    // The draft lives in view params until step 1 is saved, so it survives
    // re-renders without an initiative existing yet.
    const draft = { ...(view.params.draft ?? store.loadDraft()), [field]: target.value };
    view.params = { ...view.params, draft };
    store.saveDraft(draft);
    // Only the create button's enabled state depends on this, so refresh
    // nothing else and leave the caret alone.
    const create = document.querySelector('[data-act="draft-create"]');
    if (create instanceof HTMLButtonElement) create.disabled = !(draft.name ?? '').trim();
  },
};
