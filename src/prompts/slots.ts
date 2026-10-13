import type { ApprovalTrackDef, PhaseDef } from '../brand/types';
import { grandDeviation, grandEstimate, hasValidPeriod, resolveApprovalTrack, type RateData } from '../data/cost';
import { formatDate, formatMonth, formatPeriod, monthOf } from '../data/dates';
import { isInitiativeFrozen, isStartingPhaseSkip } from '../data/frozen';
import { allocationsWithCost, currentPhaseId, gateProgress, gateProgressText, gateRequirements, lastCostedPassedGate, type GateRequirement } from '../data/gate';
import { escalation, recordedActuals } from '../data/keyFigures';
import { dueReason, needsAttentionItems, overrunReason, readyReason } from '../data/needsAttention';
import { phaseSummary } from '../data/phaseSummary';
import { plural } from '../data/plural';
import { roleLabel } from '../data/roleLabel';
import type { ChecklistStatus, Initiative, Person, Team } from '../data/types';
import { formatAmount, formatSignedAmount } from '../ui/formatAmount';
import type { SlotName } from './template';

/** What a prompt is built from (§9.12): the initiative and the data the page shows it with. */
export interface PromptData {
  initiative: Initiative;
  productName: string;
  process: PhaseDef[];
  approvalTracks: ApprovalTrackDef[];
  currencySymbol: string;
  people: Person[];
  teams: Team[];
  data: RateData;
  /** Local ISO date (§7.1). */
  today: string;
  /** Include names (§9.12): off, everyone appears by role. */
  includeNames: boolean;
}

const UNKNOWN_PERSON = 'Unknown person';
const STATUS: Record<ChecklistStatus, string> = { incomplete: 'Incomplete', tentative: 'Tentative', complete: 'Complete' };

/** A table cell: a pipe would end the cell, a line break the row; a backslash is escaped first, so one typed before a pipe can't undo its escape. */
const cell = (text: string) => text.replace(/[\\|]/g, '\\$&').replace(/\r?\n/g, ' ');

/** Typed text under a list item, line for line, indented so a line break stays inside the item. */
const indented = (text: string) => text.replace(/\r?\n/g, '\n  ');

function table(headers: string[], rows: string[][]): string {
  return [`| ${headers.join(' | ')} |`, `|${headers.map(() => ' --- |').join('')}`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
}

/**
 * Each person's label in the prompt (§9.12): their role (a custom role by its label, a frozen phase by the role its
 * snapshot recorded), numbered where a role repeats, or their name with the role when names are included. One label
 * per person throughout: the owner first, then people in the order their phases list them.
 */
function personLabels({ initiative, process, people, data, includeNames }: PromptData): (personId: string) => string {
  const seen = new Map<string, { name: string; role: string }>();
  const meet = (personId: string, recorded?: { personName?: string; roleName?: string }) => {
    if (seen.has(personId)) return;
    const person = people.find((p) => p.id === personId);
    seen.set(personId, {
      name: recorded?.personName ?? person?.name ?? UNKNOWN_PERSON,
      role: recorded?.roleName ?? (person ? roleLabel(person, data.roles) : UNKNOWN_PERSON),
    });
  };
  if (initiative.ownerId) meet(initiative.ownerId);
  for (const phase of process) {
    const snapshot = initiative.gates?.[phase.id]?.outcome === 'passed' ? initiative.gates[phase.id].frozenSnapshot : undefined;
    if (snapshot) for (const a of snapshot.allocations) meet(a.personId, a);
    else for (const a of initiative.phases?.[phase.id]?.allocations ?? []) meet(a.personId);
  }

  const labels = new Map<string, string>();
  const roleCount = new Map<string, number>();
  for (const { role } of seen.values()) roleCount.set(role, (roleCount.get(role) ?? 0) + 1);
  const numbered = new Map<string, number>();
  for (const [personId, { name, role }] of seen) {
    if (includeNames) {
      labels.set(personId, name === role ? name : `${name} (${role})`);
      continue;
    }
    const n = (numbered.get(role) ?? 0) + 1;
    numbered.set(role, n);
    labels.set(personId, roleCount.get(role)! > 1 ? `${role} ${n}` : role);
  }
  return (personId) => labels.get(personId) ?? UNKNOWN_PERSON;
}

const costedPhases = (process: PhaseDef[]) => process.filter((p) => p.costed);

function phasePeriod(p: PromptData, phase: PhaseDef): string | null {
  const plan = p.initiative.phases?.[phase.id] ?? { allocations: [] };
  const summary = phaseSummary(p.initiative, phase.id, plan, p.people, p.data);
  const period = summary.frozen && summary.snapshot ? summary.snapshot : plan;
  return hasValidPeriod(period) ? formatPeriod(period.startDate!, period.endDate!) : null;
}

function initiativeBlock(p: PromptData, label: (id: string) => string): string {
  const { initiative, process } = p;
  const phase = process.find((ph) => ph.id === currentPhaseId(initiative, process))!;
  const lines = [
    `## Initiative: ${initiative.name}`,
    '',
    `- Team: ${p.teams.find((t) => t.id === initiative.teamId)?.name ?? 'Unknown team'}`,
    `- Owner: ${initiative.ownerId ? label(initiative.ownerId) : 'No owner'}`,
    `- Status: ${initiative.status}`,
  ];
  if (initiative.status === 'Closed') lines.push(`- Current phase: none, closed after ${process[process.length - 1].exitGate.label}`);
  else {
    const period = phase.costed ? phasePeriod(p, phase) : null;
    lines.push(`- Current phase: ${phase.label}${phase.costed ? ` (${period ?? 'no period yet'})` : ' (not costed)'}`);
  }
  if (costedPhases(process).length > 0) {
    const estimate = grandEstimate(initiative, process, p.people, p.data);
    const track = resolveApprovalTrack(p.approvalTracks, estimate);
    const escalated = escalation(initiative, process, track);
    lines.push(`- Approval track: ${track ? track.name : 'No approval track'}${escalated ? ` (escalated: needs ${escalated.live.name} approval, was ${escalated.baseline.name})` : ''}`);
  }
  lines.push('', '### Description', '', initiative.description?.trim() ? initiative.description : 'No description.');
  return lines.join('\n');
}

function timelineBlock(p: PromptData): string {
  const { initiative, process } = p;
  const currentIndex = process.findIndex((ph) => ph.id === currentPhaseId(initiative, process));
  const closed = initiative.status === 'Closed';
  const skips: string[] = [];
  const rows = process.map((phase, index) => {
    const record = initiative.gates?.[phase.id];
    let state = closed || index < currentIndex ? 'Done' : index === currentIndex ? 'Current' : 'Ahead';
    if (record?.outcome === 'skipped') {
      state = `Done, ${phase.exitGate.label} skipped`;
      skips.push(isStartingPhaseSkip(record) ? `- ${phase.exitGate.label}: skipped, the initiative started at a later phase` : `- ${phase.exitGate.label}: ${indented(record.skipReason?.trim() ? record.skipReason : 'no reason given')}`);
    } else if (record?.outcome === 'passed') state = `Done, ${phase.exitGate.label} passed${record.passedOn ? ` ${formatDate(record.passedOn)}` : ''}`;
    if (!phase.costed) return [phase.label, state, '—', 'Not costed'];
    const plan = initiative.phases?.[phase.id] ?? { allocations: [] };
    const summary = phaseSummary(initiative, phase.id, plan, p.people, p.data);
    return [phase.label, state, phasePeriod(p, phase) ?? 'No period yet', formatAmount(summary.total, p.currencySymbol)];
  });
  const out = ['## Timeline', '', 'Phases in process order.', '', table(['Phase', 'State', 'Period', 'Cost'], rows)];
  if (skips.length) out.push('', 'Why gates were skipped:', '', ...skips);
  return out.join('\n');
}

function costsBlock(p: PromptData): string {
  const { initiative, process, currencySymbol: c } = p;
  if (costedPhases(process).length === 0) return '## Costs\n\nThe process costs no phase, so this initiative has no costs.';
  const estimate = grandEstimate(initiative, process, p.people, p.data);
  const approved = lastCostedPassedGate(process, initiative);
  const approvedFigure = approved?.record.recordedGrandEstimate;
  const deviation = grandDeviation(initiative, process, p.people, p.data);
  const actuals = recordedActuals(initiative, process);
  const track = resolveApprovalTrack(p.approvalTracks, estimate);
  const lines = ['## Costs', '', `- Grand estimate: ${formatAmount(estimate, c)}`];
  if (approved && approvedFigure !== undefined) {
    const gate = approved.phase.exitGate.label;
    lines.push(`- Approved at ${gate}: ${formatAmount(approvedFigure, c)}`);
    lines.push(`- Difference since ${gate}: ${estimate === approvedFigure ? 'unchanged' : formatSignedAmount(estimate - approvedFigure, c)}`);
  } else lines.push('- Approved at: not yet, no costed gate has passed');
  lines.push(`- Deviation: ${formatSignedAmount(deviation, c)}${actuals.months === 0 ? ' (no actuals recorded yet)' : ''}`);
  lines.push(`- Recorded actuals to date: ${formatAmount(actuals.total, c)} over ${plural(actuals.months, 'month', 'months')}`);
  lines.push(`- Approval track now: ${track ? track.name : 'No approval track (no band covers the grand estimate)'}`);
  lines.push('', 'Approval tracks, by grand estimate:', '');
  lines.push(
    table(
      ['Track', 'From', 'Up to (not including)', 'Requirement'],
      p.approvalTracks.map((t) => [t.name, formatAmount(t.lowerBound, c), t.upperBound === undefined ? 'No upper bound' : formatAmount(t.upperBound, c), t.requirementText]),
    ),
  );
  return lines.join('\n');
}

function planBlock(p: PromptData, label: (id: string) => string): string {
  const { initiative, process, currencySymbol: c } = p;
  const phases = costedPhases(process);
  if (phases.length === 0) return '## Plan\n\nThe process costs no phase, so there is no plan to cost.';
  const out = ['## Plan'];
  for (const phase of phases) {
    const plan = initiative.phases?.[phase.id] ?? { allocations: [] };
    const summary = phaseSummary(initiative, phase.id, plan, p.people, p.data);
    const frozen = summary.frozen && summary.snapshot;
    out.push('', `### ${phase.label}${frozen ? ` (frozen when ${phase.exitGate.label} passed: people, rates and estimate as approved)` : ''}`, '');
    const period = phasePeriod(p, phase);
    out.push(`- Period: ${period ?? 'no period yet'}`, `- Cost: ${formatAmount(summary.total, c)}`, '');

    const allocations = frozen ? summary.snapshot!.allocations : allocationsWithCost(plan, p.people, p.data);
    out.push(
      allocations.length === 0
        ? 'Allocations: none.'
        : `Allocations:\n\n${table(['Person', 'Allocation %', 'Cost'], allocations.map((a) => [label(a.personId), `${a.allocationPct}%`, a.cost === undefined ? 'Not costed' : formatAmount(a.cost, c)]))}`,
    );
    const items = frozen ? summary.snapshot!.costItems : (plan.costItems ?? []);
    out.push(
      '',
      items.length === 0
        ? 'Cost items: none.'
        : `Cost items:\n\n${table(['Item', 'Amount', 'Timing'], items.map((i) => [i.label, formatAmount(i.amount, c), i.timing === 'spread' ? 'Spread over the phase' : i.month ? formatMonth(i.month) : 'One month']))}`,
    );
    if (summary.months.length > 0 || (frozen && Object.keys(summary.estimateByMonth).length > 0)) {
      const months = summary.months.length > 0 ? summary.months : Object.keys(summary.estimateByMonth).sort();
      const rows = months.map((month) => {
        const estimate = summary.estimateByMonth[month] ?? 0;
        const recorded = plan.actualMonths?.[month];
        const actual = recorded !== undefined ? formatAmount(recorded, c) : month < monthOf(p.today) ? `${formatAmount(estimate, c)}, using the estimate (no actual recorded)` : '—';
        return [formatMonth(month), formatAmount(estimate, c), actual];
      });
      out.push('', `Months:\n\n${table(['Month', 'Estimate', 'Actual'], rows)}`);
    }
  }
  return out.join('\n');
}

function gateState(p: PromptData, phaseId: string, requirements: GateRequirement[]): string {
  const { initiative, process, today } = p;
  if (initiative.status === 'On Hold') return 'On hold';
  const overrun = overrunReason(initiative, process, phaseId, today);
  if (overrun) return `Overrun: ${overrun}`;
  if (dueReason(initiative, process, phaseId, today, requirements)) return 'Due: the phase has reached its end date with requirements still open';
  if (readyReason(requirements)) return 'Ready: nothing left blocking the gate';
  return 'Open: requirements still block the gate';
}

function gateBlock(p: PromptData): string {
  const { initiative, process } = p;
  if (isInitiativeFrozen(initiative)) return `## Current gate\n\nThere is no current gate: the initiative is ${initiative.status}.`;
  const phase = process.find((ph) => ph.id === currentPhaseId(initiative, process))!;
  const gate = phase.exitGate;
  const requirements = gateRequirements(process, initiative, phase.id);
  const lines = [`## Current gate: ${gate.label}`, '', `${gate.description}`, ''];
  if (requirements.length === 0) {
    lines.push('Nothing to check.');
    return lines.join('\n');
  }
  lines.push(`- Progress: ${gateProgressText(gateProgress(requirements))}`, `- State: ${gateState(p, phase.id, requirements)}`);
  const estimates = requirements.find((r) => r.kind === 'estimates');
  if (estimates) lines.push(`- Estimates: ${estimates.state === 'met' ? estimates.label : estimates.text}`);
  const item = (r: Extract<GateRequirement, { kind: 'checklist' }>) => {
    const from = r.carried ? `, carried forward from ${r.carried.originGateLabel}` : '';
    const note = r.note.trim() ? `\n  Note: ${indented(r.note)}` : '';
    return `- ${r.name}: ${STATUS[r.status]}${from}${note}`;
  };
  const own = requirements.filter((r) => r.kind === 'checklist' && !r.carried) as Extract<GateRequirement, { kind: 'checklist' }>[];
  const carried = requirements.filter((r) => r.kind === 'checklist' && r.carried) as Extract<GateRequirement, { kind: 'checklist' }>[];
  if (own.length) lines.push('', 'Checklist:', '', ...own.map(item));
  if (carried.length) lines.push('', 'Carried forward (still Tentative at an earlier gate):', '', ...carried.map(item));
  return lines.join('\n');
}

const KIND_LABEL = { escalated: 'Escalated', overrun: 'Overrun', overdue: 'Overdue', due: 'Due', ready: 'Ready' } as const;

function attentionBlock(p: PromptData): string {
  const items = needsAttentionItems([p.initiative], p.process, p.people, p.data, p.approvalTracks, p.today);
  if (items.length === 0) return '## Needs attention\n\nNothing needs attention.';
  return ['## Needs attention', '', ...items.map((i) => `- ${KIND_LABEL[i.kind]}: ${i.reason}`)].join('\n');
}

function termsBlock(p: PromptData): string {
  const lines = [
    '## Terms',
    '',
    '- Phase: a step of the process. A costed phase is planned with people and cost items; a phase that is not costed has no figures.',
    '- Gate: the step out of a phase. It is passed when its requirements are met, or skipped with a reason where the process allows. The last gate closes the initiative.',
    '- Checklist item: a condition on a gate. Incomplete blocks the gate; Tentative lets it pass with a warning and carries forward to the next gate until marked Complete; Complete is done.',
    '- Grand estimate: the initiative\'s total cost across all costed phases: recorded actuals where they exist, estimates elsewhere.',
    '- Approved at: the grand estimate recorded when the last costed gate passed. A passed phase is frozen: its people, rates and estimate stay as they were when approved.',
    '- Deviation: recorded actuals minus their estimates. Positive is overspend, negative is underspend.',
    '- Actual: the cost recorded for a month once it has closed. A closed month without one counts at its estimate.',
    '- Approval track: the budget band the grand estimate falls in, which sets who must approve it.',
    '- Escalated: the grand estimate now needs a stricter approval track than the one recorded at the last passed gate.',
    '- Allocation %: the share of a person\'s full-time capacity committed to one phase.',
    '- Cost item: a priced cost that is not people time, in one month of the phase or spread over it.',
    '- Overrun: the current phase is past its end date and its gate has not been passed.',
    '- Overdue: a closed month without a recorded actual, a further month after it ended.',
    '- Due: the current phase has reached its end date and its gate still has open requirements.',
    '- Ready: nothing is left blocking the current gate.',
    '',
    'The process:',
    '',
  ];
  for (const phase of p.process) {
    lines.push(`- ${phase.label}${phase.costed ? '' : ' (not costed)'}: ${phase.description} Its gate, ${phase.exitGate.label}: ${phase.exitGate.description}`);
  }
  return lines.join('\n');
}

/** Every slot's Markdown block for one initiative (§9.12), with the values and formats the page shows (§9.7, full amounts). */
export function slotBlocks(p: PromptData): Record<SlotName, string> {
  const label = personLabels(p);
  return {
    initiative: initiativeBlock(p, label),
    timeline: timelineBlock(p),
    costs: costsBlock(p),
    plan: planBlock(p, label),
    gate: gateBlock(p),
    attention: attentionBlock(p),
    terms: termsBlock(p),
    today: formatDate(p.today),
    product: p.productName,
  };
}
