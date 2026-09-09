/**
 * Process: the read-only reference for phases, gates and approval tracks.
 */
import * as E from '../engine.js';
import { PROCESS } from '../process.js';
import { html, raw, money, fill } from '../render/dom.js';

/**
 * The process is fixed by the build (SPEC §2). This page is where someone
 * sees the rules they are working within — and where a wrong build becomes
 * obvious. It offers no control that suggests anything is editable.
 */
export function renderProcessPage() {
  const rows = PROCESS.phases
    .map((phase) => {
      const gate = phase.gate;
      const checklist = (gate.checklist ?? []).length
        ? html`<ul class="checklist-defs">${raw(
            gate.checklist
              .map((item) => html`<li><strong>${item.name}</strong> — ${item.description}</li>`)
              .join(''),
          )}</ul>`
        : html`<span class="muted">No checklist</span>`;

      return html`<tr>
        <td><strong>${phase.label}</strong><br />
          <span class="tag">${phase.costed ? 'costed' : 'no cost or capacity'}</span></td>
        <td>${gate.label}<br />
          <span class="micro">${gate.requiresEstimates
            ? 'Requires a complete estimate for every costed phase'
            : 'No cost requirement'}</span>
          <span class="micro">${gate.skippable
            ? 'May be skipped, with a reason'
            : 'Cannot be skipped'}</span></td>
        <td>${raw(checklist)}</td>
      </tr>`;
    })
    .join('');

  const bandRows = PROCESS.bands
    .map(
      (band) => html`<tr>
        <td>${band.name} <span class="tag">${band.abbr}</span></td>
        <td class="num">${money(band.lower)}</td>
        <td class="num">${band.upper === null
          ? 'no limit'
          : money(band.upper)}</td>
        <td class="num">${band.severity}</td>
        <td>${band.req}</td>
      </tr>`,
    )
    .join('');

  const issues = E.bandCoverageIssues(PROCESS.bands);
  const issueMarkup = issues.length
    ? html`<div class="issues">${raw(
        issues
          .map((issue) =>
            issue.type === 'gap'
              ? html`<p class="warn">Gap: nothing covers
                  ${money(issue.from)} to
                  ${money(issue.to)}. A total landing there
                  resolves to “Not yet known”.</p>`
              : html`<p class="warn">Overlap: ${issue.message ?? 'two tracks cover the same amounts'}.</p>`,
          )
          .join(''),
      )}</div>`
    : '';

  fill(
    'root',
    html`<h1>Process</h1>
      <p class="muted">This is fixed by the build and cannot be changed here. Every initiative
        runs it. The last phase's gate is what closes an initiative — finishing is a governed
        act, not a status change.</p>

      <div class="panel">
        <h2>Phases and gates</h2>
        <div class="scroller"><table class="grid">
          <thead><tr><th>Phase</th><th>Its gate</th><th>Checklist</th></tr></thead>
          <tbody>${raw(rows)}</tbody>
        </table></div>
      </div>

      <div class="panel">
        <h2>Approval tracks</h2>
        <div class="scroller"><table class="grid">
          <thead><tr><th>Track</th><th>From</th><th>To</th><th>Severity</th>
            <th>Requirement</th></tr></thead>
          <tbody>${raw(bandRows)}</tbody>
        </table></div>
        ${raw(issueMarkup)}
      </div>

      <div class="panel">
        <h2>This build</h2>
        <div class="fields">
          <div class="field-row"><span>Process</span><span>${PROCESS.id}</span></div>
          <div class="field-row"><span>Version</span><span>${PROCESS.version}</span></div>
          <div class="field-row"><span>Currency</span><span>${PROCESS.currency}</span></div>
        </div>
        <p class="muted">A dataset exported here records this process. Importing it into a
          build running a different process is refused, because its phases and gates would
          not mean the same thing.</p>
      </div>`,
  );
}
