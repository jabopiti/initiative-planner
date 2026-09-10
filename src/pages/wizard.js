/**
 * The creation wizard: two steps, resumable.
 */
import * as E from '../engine.js';
import * as store from '../store.js';
import { PROCESS } from '../process.js';
import { app, view } from '../app.js';
import { html, raw, fill } from '../render/dom.js';
import { icon } from '../render/icons.js';
import { pageHead, empty } from '../render/components.js';
import { costedPhasePanels, grandMarkup } from '../render/phase-panel.js';

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

  fill(
    'root',
    html`${raw(pageHead({ title: 'New initiative' }))}
      <ol class="steps"><li aria-current="step">General</li><li>Estimates</li></ol>

      <div class="panel">
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
          : '')}

        <div class="actions">
          <button type="button" class="btn btn--primary" data-act="draft-create"
            ${raw((draft.name ?? '').trim() ? '' : 'disabled')}
            >${raw(icon('add'))}Create and continue</button>
          <button type="button" class="btn" data-act="draft-discard">Cancel</button>
        </div>
        ${raw((draft.name ?? '').trim() ? '' : html`<p class="muted">A name is needed first.</p>`)}
      </div>`,
  );
}

function renderWizardEstimates(initiative) {
  const panels = costedPhasePanels(initiative);

  fill(
    'root',
    html`${raw(pageHead({
      title: initiative.name,
      lede: 'Fill in as much as you know. Finishing with an incomplete estimate is fine — the '
        + 'gate is what blocks progress later, not this step.',
    }))}
      <ol class="steps"><li>General</li><li aria-current="step">Estimates</li></ol>

      <div class="panel panel--inset">
        <h2>Grand total</h2>
        <p data-calc="grand">${raw(grandMarkup(initiative))}</p>
      </div>

      ${raw(panels)}

      <div class="actions">
        <button type="button" class="btn btn--primary" data-act="open-initiative"
          data-id="${initiative.id}">${raw(icon('check'))}Done</button>
        <button type="button" class="btn" data-act="page" data-page="initiatives">
          Back to initiatives</button>
      </div>`,
  );
}
