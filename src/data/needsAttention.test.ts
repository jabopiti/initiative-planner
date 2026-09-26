import { describe, expect, it } from 'vitest';
import type { ApprovalTrackDef, PhaseDef } from '../brand/types';
import { needsAttentionItems } from './needsAttention';
import type { Country, Initiative, Person, Role } from './types';

const roles: Role[] = [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 1, active: true }];
const twenty = Array(12).fill(20);
const countries: Country[] = [{ id: 'de', name: 'Germany', active: true, ratesByYear: [{ year: 2026, dayRate: 1000, workingDaysByMonth: twenty }] }];
const data = { roles, countries };
const ana: Person = { id: 'ana', name: 'Ana Ruiz', countryId: 'de', roleId: 'dev', capacityPct: 100, active: true };
const people = [ana];

const process: PhaseDef[] = [
  { id: 'discovery', label: 'Discovery', description: '', costed: false, exitGate: { id: 'g0', label: 'G0', description: '', requiresEstimates: false, skippable: true, checklistItems: [] } },
  {
    id: 'alpha',
    label: 'Alpha',
    description: '',
    costed: true,
    exitGate: { id: 'g1', label: 'G1', description: '', requiresEstimates: true, skippable: true, checklistItems: [{ id: 'a1', name: 'Business case approved', description: '' }] },
  },
  { id: 'beta', label: 'Beta', description: '', costed: true, exitGate: { id: 'g2', label: 'G2', description: '', requiresEstimates: true, skippable: false, checklistItems: [] } },
  { id: 'gamma', label: 'Gamma', description: '', costed: false, exitGate: { id: 'g3', label: 'G3', description: '', requiresEstimates: false, skippable: false, checklistItems: [] } },
];

const tracks: ApprovalTrackDef[] = [
  { id: 'light', name: 'Light', abbreviation: 'L', lowerBound: 0, upperBound: 20_000, severity: 1, requirementText: '' },
  { id: 'standard', name: 'Standard', abbreviation: 'S', lowerBound: 20_000, upperBound: 40_000, severity: 2, requirementText: '' },
  { id: 'elevated', name: 'Elevated', abbreviation: 'E', lowerBound: 40_000, severity: 3, requirementText: '' },
];

const today = '2026-03-15';

const base = (overrides: Partial<Initiative> = {}): Initiative => ({
  id: 'i1',
  name: 'Checkout Redesign',
  teamId: 't1',
  status: 'Active',
  gates: { discovery: { outcome: 'passed', passedOn: '2025-12-01', checklist: [] } },
  phases: { alpha: { startDate: '2026-01-01', endDate: '2026-01-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 100 }] } },
  ...overrides,
});

const items = (initiatives: Initiative[]) => needsAttentionItems(initiatives, process, people, data, tracks, today);

describe('needsAttentionItems (§8.5)', () => {
  it('excludes On Hold, Closed and Cancelled initiatives even when they would otherwise qualify', () => {
    // Alpha's end date has passed today (2026-03-15) with an unresolved checklist item: would be Overrun.
    for (const status of ['On Hold', 'Closed', 'Cancelled'] as const) {
      expect(items([base({ status })])).toEqual([]);
    }
  });

  it('shows nothing for a phase mid-life with open requirements but its end date not yet reached', () => {
    const initiative = base({ phases: { alpha: { startDate: '2026-03-01', endDate: '2026-03-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 100 }] } } });
    expect(items([initiative])).toEqual([]);
  });

  it('reports Overrun once the current phase is past its own end date, regardless of its checklist', () => {
    const [item] = items([base()]); // alpha ended 2026-01-31, today is 2026-03-15
    expect(item).toMatchObject({ kind: 'overrun', phaseId: 'alpha' });
    expect(item.reason).toBe('Alpha is 43 days overrun');
  });

  it('reports Due once the end date is reached and a checklist item still blocks, reading "X of Y complete" (the still-unplanned Beta ahead is a second open requirement)', () => {
    const initiative = base({ phases: { alpha: { startDate: '2026-03-01', endDate: '2026-03-15', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 100 }] } } });
    const [item] = items([initiative]);
    expect(item).toMatchObject({ kind: 'due', phaseId: 'alpha', reason: '0 of 2 complete' });
  });

  it('reports Ready once nothing blocks the current gate, even before its end date — a Tentative-only item still reads as Ready', () => {
    const initiative = base({
      phases: {
        alpha: { startDate: '2026-03-01', endDate: '2026-06-30', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 100 }] },
        beta: { startDate: '2026-07-01', endDate: '2026-07-31', allocations: [{ id: 'b1', personId: 'ana', allocationPct: 50 }] },
      },
      checklist: { alpha: { a1: { status: 'tentative', note: 'Follow up later' } } },
    });
    const [item] = items([initiative]);
    expect(item).toEqual({ kind: 'ready', initiativeId: 'i1', initiativeName: 'Checkout Redesign', reason: 'All requirements met' });
  });

  it('reports Escalated when the live approval track is stricter than the one recorded at the last costed passed gate', () => {
    const initiative = base({
      gates: {
        discovery: { outcome: 'passed', passedOn: '2025-12-01', checklist: [] },
        alpha: { outcome: 'passed', passedOn: '2026-02-01', checklist: [], recordedGrandEstimate: 25_000, recordedApprovalTrack: { id: 'standard', name: 'Standard', severity: 2 } },
      },
      // Beta (current phase, live) alone costs 50 days x 100% x 1000 = 50,000 -> Elevated, stricter than the recorded Standard.
      phases: { beta: { startDate: '2026-03-01', endDate: '2026-05-19', allocations: [{ id: 'b1', personId: 'ana', allocationPct: 100 }] } },
    });
    const [item] = items([initiative]);
    expect(item).toMatchObject({ kind: 'escalated', reason: 'Needs Elevated approval (was Standard)' });
  });

  it('is not Escalated when the live track is the same severity or lighter, or there is no baseline yet', () => {
    const lighter = base({
      gates: {
        discovery: { outcome: 'passed', passedOn: '2025-12-01', checklist: [] },
        alpha: { outcome: 'passed', passedOn: '2026-02-01', checklist: [], recordedGrandEstimate: 25_000, recordedApprovalTrack: { id: 'standard', name: 'Standard', severity: 2 } },
      },
      phases: {},
    });
    expect(items([lighter]).some((i) => i.kind === 'escalated')).toBe(false);

    const noBaseline = base({ phases: { alpha: { startDate: '2026-03-01', endDate: '2026-06-30', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 100 }] } } });
    expect(items([noBaseline]).some((i) => i.kind === 'escalated')).toBe(false);
  });

  it('reports Overdue for a closed, unrecorded actual once a further calendar month has passed, scanning every costed phase', () => {
    const initiative = base({
      // Alpha's own gate already passed; its January actual was never recorded. Beta (current) is untouched, so Ready on its own.
      gates: {
        discovery: { outcome: 'passed', passedOn: '2025-12-01', checklist: [] },
        alpha: { outcome: 'passed', passedOn: '2026-02-01', checklist: [], recordedGrandEstimate: 20_000, recordedApprovalTrack: { id: 'standard', name: 'Standard', severity: 2 } },
      },
      phases: { alpha: { startDate: '2026-01-01', endDate: '2026-01-31', allocations: [] } },
    });
    const [item] = items([initiative]);
    expect(item).toMatchObject({ kind: 'overdue', phaseId: 'alpha', month: '2026-01', reason: 'Alpha: no actual recorded for Jan 2026' });
  });

  it('is not yet Overdue the very month after the phase closed — only once a further calendar month has passed', () => {
    const initiative = base({
      gates: {
        discovery: { outcome: 'passed', passedOn: '2025-12-01', checklist: [] },
        alpha: { outcome: 'passed', passedOn: '2026-02-01', checklist: [], recordedGrandEstimate: 20_000, recordedApprovalTrack: { id: 'standard', name: 'Standard', severity: 2 } },
      },
      phases: { alpha: { startDate: '2026-01-01', endDate: '2026-01-31', allocations: [] } },
    });
    expect(needsAttentionItems([initiative], process, people, data, tracks, '2026-02-15').some((i) => i.kind === 'overdue')).toBe(false);
  });

  it('ranks items by kind priority — Escalated, Overrun, Overdue, Due, Ready — one item per initiative', () => {
    const escalated = base({
      id: 'esc',
      gates: {
        discovery: { outcome: 'passed', passedOn: '2025-12-01', checklist: [] },
        alpha: { outcome: 'passed', passedOn: '2026-02-01', checklist: [], recordedGrandEstimate: 25_000, recordedApprovalTrack: { id: 'standard', name: 'Standard', severity: 2 } },
      },
      phases: { beta: { startDate: '2026-03-01', endDate: '2026-05-19', allocations: [{ id: 'b1', personId: 'ana', allocationPct: 100 }] } },
    });
    const overrun = base({ id: 'over' });
    const ready = base({
      id: 'rdy',
      phases: {
        alpha: { startDate: '2026-03-01', endDate: '2026-06-30', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 100 }] },
        beta: { startDate: '2026-07-01', endDate: '2026-07-31', allocations: [{ id: 'b1', personId: 'ana', allocationPct: 50 }] },
      },
      checklist: { alpha: { a1: { status: 'complete', note: '' } } },
    });
    const due = base({
      id: 'due',
      phases: { alpha: { startDate: '2026-03-01', endDate: '2026-03-15', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 100 }] } },
    });

    const result = items([ready, due, overrun, escalated]);
    expect(result.map((i) => i.kind)).toEqual(['escalated', 'overrun', 'due', 'ready']);
    expect(result).toHaveLength(4); // one item per initiative — the nav count is simply this length
  });
});
