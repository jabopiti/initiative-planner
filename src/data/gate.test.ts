import { describe, expect, it } from 'vitest';
import type { ApprovalTrackDef, PhaseDef } from '../brand/types';
import {
  carriedForwardItems,
  currentPhaseId,
  gateBlockers,
  gateOverdue,
  gateProgress,
  gateRequirements,
  lastCostedPassedGate,
  passGate,
  reopenGate,
  withChecklistItem,
} from './gate';
import type { Country, Initiative, Person, Role } from './types';

const roles: Role[] = [{ id: 'dev', name: 'Developer', abbreviation: 'Dev', costFactor: 1, active: true }];
const twenty = Array(12).fill(20);
const countries: Country[] = [{ id: 'de', name: 'Germany', active: true, ratesByYear: [{ year: 2026, dayRate: 1000, workingDaysByMonth: twenty }] }];
const data = { roles, countries };
const ana: Person = { id: 'ana', name: 'Ana Ruiz', countryId: 'de', roleId: 'dev', capacityPct: 100, active: true };
const people = [ana];

const process: PhaseDef[] = [
  { id: 'discovery', label: 'Discovery', description: '', costed: false, exitGate: { id: 'g0', label: 'G0', description: '', requiresEstimates: false, skippable: true, checklistItems: [{ id: 'd1', name: 'Problem validated', description: '' }] } },
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
  { id: 'standard', name: 'Standard', abbreviation: 'S', lowerBound: 20_000, severity: 2, requirementText: '' },
];

const planned = (overrides: Partial<Initiative> = {}): Initiative => ({
  id: 'i1',
  name: 'Checkout Redesign',
  teamId: 't1',
  status: 'Active',
  // Discovery already passed, so Alpha is current — matches every test below, which works at Alpha's gate.
  gates: { discovery: { outcome: 'passed', passedOn: '2025-12-31', checklist: [] } },
  phases: { alpha: { startDate: '2026-01-01', endDate: '2026-01-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 100 }] } },
  ...overrides,
});

describe('currentPhaseId (§4, §6)', () => {
  it('is the first phase for an untouched initiative', () => {
    expect(currentPhaseId(planned({ phases: undefined, gates: undefined }), process)).toBe('discovery');
  });

  it('is the first phase whose exit gate has no record', () => {
    const initiative = planned({ gates: { discovery: { outcome: 'passed', passedOn: '2026-01-01', checklist: [] } } });
    expect(currentPhaseId(initiative, process)).toBe('alpha');
  });

  it('is the last phase once every gate is recorded', () => {
    const gates = Object.fromEntries(process.map((p) => [p.id, { outcome: 'passed' as const, passedOn: '2026-01-01', checklist: [] }]));
    expect(currentPhaseId(planned({ gates }), process)).toBe('gamma');
  });
});

describe('gateRequirements and gateBlockers (§8.1)', () => {
  it('blocks on an Incomplete checklist item, naming it', () => {
    const requirements = gateRequirements(process, planned(), 'alpha');
    expect(gateBlockers(requirements)).toEqual(['Beta needs a complete period and at least one allocation or cost item', '"Business case approved" is not resolved']);
  });

  it('blocks when a costed phase still ahead has no period or allocation/cost item', () => {
    const initiative = withChecklistItem(planned(), 'alpha', 'a1', 'complete', '');
    expect(gateBlockers(gateRequirements(process, initiative, 'alpha'))).toEqual(['Beta needs a complete period and at least one allocation or cost item']);
  });

  it('is unblocked once its own checklist and every costed phase ahead are estimated', () => {
    const initiative = withChecklistItem(
      { ...planned(), phases: { ...planned().phases, beta: { startDate: '2026-02-01', endDate: '2026-02-28', allocations: [{ id: 'b1', personId: 'ana', allocationPct: 10 }] } } },
      'alpha',
      'a1',
      'complete',
      '',
    );
    expect(gateBlockers(gateRequirements(process, initiative, 'alpha'))).toEqual([]);
  });

  it('accepts a cost item alone as enough to count a phase estimated', () => {
    const initiative = withChecklistItem(
      {
        ...planned(),
        phases: { ...planned().phases, beta: { startDate: '2026-02-01', endDate: '2026-02-28', allocations: [], costItems: [{ id: 'c1', label: 'Licence', amount: 500, timing: 'spread' }] } },
      },
      'alpha',
      'a1',
      'complete',
      '',
    );
    expect(gateBlockers(gateRequirements(process, initiative, 'alpha'))).toEqual([]);
  });

  it('never blocks on a Tentative item, only warns', () => {
    const initiative = withChecklistItem(
      { ...planned(), phases: { ...planned().phases, beta: { startDate: '2026-02-01', endDate: '2026-02-28', allocations: [{ id: 'b', personId: 'ana', allocationPct: 10 }] } } },
      'alpha',
      'a1',
      'tentative',
      'Needs sign-off',
    );
    const requirements = gateRequirements(process, initiative, 'alpha');
    expect(gateBlockers(requirements)).toEqual([]);
    expect(requirements.find((r) => r.kind === 'checklist' && r.itemId === 'a1')?.state).toBe('warning');
  });

  it('never checks estimates on a gate that does not require them', () => {
    expect(gateBlockers(gateRequirements(process, planned({ phases: undefined }), 'discovery'))).toEqual(['"Problem validated" is not resolved']);
  });

  it('counts complete and carried items toward "X of Y" (§8.1)', () => {
    const initiative = withChecklistItem(
      { ...planned(), gates: { discovery: { outcome: 'passed', passedOn: '2026-01-01', checklist: [{ id: 'd1', name: 'Problem validated', description: '', status: 'tentative', note: 'later' }] } } },
      'discovery',
      'd1',
      'tentative',
      'later',
    );
    const requirements = gateRequirements(process, initiative, 'alpha');
    // a1 (incomplete), estimates (blocker, beta unplanned), carried d1 (tentative, warning, never a blocker here)
    expect(gateProgress(requirements)).toEqual({ complete: 0, total: 3 });
    expect(requirements.some((r) => r.kind === 'checklist' && r.itemId === 'd1' && r.carried?.originGateLabel === 'G0')).toBe(true);
  });
});

describe('carriedForwardItems (§8.1)', () => {
  it('carries a Tentative item from an earlier passed gate, tagged with its origin', () => {
    const initiative = withChecklistItem({ ...planned(), gates: { discovery: { outcome: 'passed', passedOn: '2026-01-01', checklist: [] } } }, 'discovery', 'd1', 'tentative', 'Check later');
    const carried = carriedForwardItems(process, initiative, 'alpha');
    expect(carried).toEqual([{ id: 'd1', name: 'Problem validated', description: '', status: 'tentative', note: 'Check later', originPhaseId: 'discovery', originGateId: 'g0', originGateLabel: 'G0' }]);
  });

  it('stops carrying once the item is marked Complete at its origin gate', () => {
    let initiative = withChecklistItem({ ...planned(), gates: { discovery: { outcome: 'passed', passedOn: '2026-01-01', checklist: [] } } }, 'discovery', 'd1', 'tentative', 'x');
    initiative = withChecklistItem(initiative, 'discovery', 'd1', 'complete', 'x');
    expect(carriedForwardItems(process, initiative, 'alpha')).toEqual([]);
  });
});

describe('gateOverdue (§8.1)', () => {
  it('is true once a costed current phase has run past its own end date', () => {
    expect(gateOverdue(planned(), process[1], '2026-02-01')).toBe(true);
    expect(gateOverdue(planned(), process[1], '2026-01-15')).toBe(false);
  });

  it('is never true for a non-costed phase', () => {
    expect(gateOverdue(planned({ phases: undefined }), process[0], '2099-01-01')).toBe(false);
  });
});

describe('passGate (§8.1)', () => {
  const takenAt = '2026-01-31';

  it('refuses with the blockers when the gate is not ready', () => {
    const result = passGate(process, planned(), people, data, tracks, takenAt);
    expect(result).toEqual({ ok: false, blockers: expect.arrayContaining(['"Business case approved" is not resolved']) });
  });

  it('freezes the exited costed phase, records the grand estimate and approval track, and advances', () => {
    const initiative = withChecklistItem(
      { ...planned(), phases: { ...planned().phases, beta: { startDate: '2026-02-01', endDate: '2026-02-28', allocations: [{ id: 'b1', personId: 'ana', allocationPct: 50 }] } } },
      'alpha',
      'a1',
      'complete',
      '',
    );
    const result = passGate(process, initiative, people, data, tracks, takenAt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const record = result.initiative.gates!.alpha;
    expect(record.outcome).toBe('passed');
    expect(record.passedOn).toBe(takenAt);
    // Alpha: 20 days × 100% × 1000 = 20,000. Beta (still live): 20 days × 50% × 1000 = 10,000. Grand estimate 30,000 -> Standard.
    expect(record.recordedGrandEstimate).toBe(30_000);
    expect(record.recordedApprovalTrack).toEqual({ id: 'standard', name: 'Standard', severity: 2 });
    expect(record.frozenSnapshot).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      allocations: [{ id: 'a1', personId: 'ana', allocationPct: 100, cost: 20_000 }],
      costItems: [],
      estimateByMonth: { '2026-01': 20_000 },
    });
    expect(currentPhaseId(result.initiative, process)).toBe('beta');
  });

  it('records no grand estimate or approval track when the exited phase is not costed', () => {
    const initiative = withChecklistItem(planned({ phases: undefined, gates: undefined }), 'discovery', 'd1', 'complete', '');
    const result = passGate(process, initiative, people, data, tracks, takenAt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const record = result.initiative.gates!.discovery;
    expect(record).toEqual({ outcome: 'passed', passedOn: takenAt, checklist: [{ id: 'd1', name: 'Problem validated', description: '', status: 'complete', note: '' }] });
  });

  it('closes the initiative on the final gate', () => {
    const gates = { discovery: { outcome: 'passed' as const, passedOn: '2026-01-01', checklist: [] }, alpha: { outcome: 'passed' as const, passedOn: '2026-01-01', checklist: [] }, beta: { outcome: 'passed' as const, passedOn: '2026-01-01', checklist: [] } };
    const result = passGate(process, planned({ gates, phases: undefined }), people, data, tracks, takenAt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.initiative.status).toBe('Closed');
  });
});

describe('reopenGate (§8.3)', () => {
  it('reverses only the most recent gate, keeping checklist state and discarding the frozen snapshot', () => {
    let initiative = withChecklistItem(planned(), 'alpha', 'a1', 'complete', 'Signed off');
    const passed = passGate(
      process,
      { ...initiative, phases: { ...initiative.phases, beta: { startDate: '2026-02-01', endDate: '2026-02-28', allocations: [{ id: 'b1', personId: 'ana', allocationPct: 10 }] } } },
      people,
      data,
      tracks,
      '2026-01-31',
    );
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    initiative = passed.initiative;

    const reopened = reopenGate(process, initiative);
    expect(reopened?.phase.id).toBe('alpha');
    expect(reopened?.initiative.gates?.alpha).toBeUndefined();
    expect(reopened?.initiative.checklist?.alpha?.a1).toEqual({ status: 'complete', note: 'Signed off' });
    expect(reopened?.initiative.phases?.beta?.actualMonths).toBeUndefined(); // nothing about actuals touched
  });

  it('reopens the final gate of a Closed initiative back to Active', () => {
    const initiative: Initiative = { ...planned(), status: 'Closed', gates: { discovery: { outcome: 'passed', passedOn: '2026-01-01', checklist: [] }, alpha: { outcome: 'passed', passedOn: '2026-01-01', checklist: [] }, beta: { outcome: 'passed', passedOn: '2026-01-01', checklist: [] }, gamma: { outcome: 'passed', passedOn: '2026-01-01', checklist: [] } } };
    const reopened = reopenGate(process, initiative);
    expect(reopened?.phase.id).toBe('gamma');
    expect(reopened?.initiative.status).toBe('Active');
  });

  it('is null when there is no gate to reverse', () => {
    expect(reopenGate(process, planned({ phases: undefined, gates: undefined }))).toBeNull();
  });
});

describe('lastCostedPassedGate (§7.4)', () => {
  it('skips a passed gate whose exited phase was not costed', () => {
    const gates = { discovery: { outcome: 'passed' as const, passedOn: '2026-01-01', checklist: [], recordedGrandEstimate: 999 } };
    expect(lastCostedPassedGate(process, planned({ gates }))).toBeNull();
  });

  it('finds the last passed gate whose exited phase was costed, skipping a non-costed one after it', () => {
    const gates = {
      alpha: { outcome: 'passed' as const, passedOn: '2026-01-01', checklist: [], recordedGrandEstimate: 20_000 },
      beta: { outcome: 'skipped' as const, skipReason: 'later', checklist: [] },
    };
    expect(lastCostedPassedGate(process, planned({ gates }))?.recordedGrandEstimate).toBe(20_000);
  });
});
