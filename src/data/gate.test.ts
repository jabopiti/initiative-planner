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
  onHoldMessage,
  overrunMessage,
  passGate,
  reopenGate,
  skipGate,
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
  { id: 'discovery', icon: 'search', label: 'Discovery', description: '', costed: false, exitGate: { id: 'g0', label: 'G0', description: '', requiresEstimates: false, skippable: true, checklistItems: [{ id: 'd1', name: 'Problem validated', description: '' }] } },
  {
    id: 'alpha',
    icon: 'search',
    label: 'Alpha',
    description: '',
    costed: true,
    exitGate: { id: 'g1', label: 'G1', description: '', requiresEstimates: true, skippable: true, checklistItems: [{ id: 'a1', name: 'Business case approved', description: '' }] },
  },
  { id: 'beta', icon: 'search', label: 'Beta', description: '', costed: true, exitGate: { id: 'g2', label: 'G2', description: '', requiresEstimates: true, skippable: false, checklistItems: [] } },
  { id: 'gamma', icon: 'search', label: 'Gamma', description: '', costed: false, exitGate: { id: 'g3', label: 'G3', description: '', requiresEstimates: false, skippable: false, checklistItems: [] } },
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

describe('the estimates requirement as the gate panel states it (§5.4, §8.1)', () => {
  it('names every costed phase it checks, the same open or met', () => {
    const open = gateRequirements(process, planned(), 'alpha')[0];
    expect(open).toMatchObject({ kind: 'estimates', state: 'blocker', label: 'Alpha and Beta have a period and at least one allocation or cost item' });
    const beta = { startDate: '2026-02-01', endDate: '2026-02-28', allocations: [{ id: 'b1', personId: 'ana', allocationPct: 10 }] };
    const met = gateRequirements(process, planned({ phases: { ...planned().phases, beta } }), 'alpha')[0];
    expect(met).toMatchObject({ state: 'met', label: open.kind === 'estimates' ? open.label : '' });
  });

  it('reads "has" for one phase, and "need" when two are missing', () => {
    const atBeta = planned({ gates: { discovery: { outcome: 'passed', passedOn: '2025-12-31', checklist: [] }, alpha: { outcome: 'skipped', passedOn: '2026-01-01', checklist: [], skipReason: 'x' } } });
    expect(gateRequirements(process, atBeta, 'beta')[0]).toMatchObject({ label: 'Beta has a period and at least one allocation or cost item' });
    expect(gateBlockers(gateRequirements(process, planned({ phases: undefined }), 'alpha'))[0]).toBe('Alpha and Beta need a complete period and at least one allocation or cost item');
  });

  it('counts blockers only as open, never a Tentative item (§5.4 "Pass gate · 3 open")', () => {
    expect(gateBlockers(gateRequirements(process, planned(), 'alpha'))).toHaveLength(2);
    expect(gateBlockers(gateRequirements(process, withChecklistItem(planned(), 'alpha', 'a1', 'tentative', 'why'), 'alpha'))).toHaveLength(1);
  });
});

describe('overrunMessage (§8.1)', () => {
  it('reads "1 day" for one day and "days" otherwise', () => {
    expect(overrunMessage(process[1], '2026-01-31', '2026-02-01')).toBe('Alpha is 1 day overrun');
    expect(overrunMessage(process[1], '2026-01-31', '2026-02-03')).toBe('Alpha is 3 days overrun');
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

  it('refuses while the initiative is On Hold, naming the initiative and the gate, even when nothing blocks', () => {
    const initiative = planned({ status: 'On Hold' });
    const result = passGate(process, initiative, people, data, tracks, takenAt);
    expect(result).toEqual({ ok: false, blockers: ['Checkout Redesign is on hold. Resume it to pass G1.'] });
    expect(onHoldMessage(initiative, process)).toBe('Checkout Redesign is on hold. Resume it to pass G1.');
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
      allocations: [
        {
          id: 'a1',
          personId: 'ana',
          allocationPct: 100,
          cost: 20_000,
          personName: 'Ana Ruiz',
          roleName: 'Developer',
          countryName: 'Germany',
          costFactor: 1,
          months: { '2026-01': { workingDays: 20, dayRate: 1000 } },
        },
      ],
      costItems: [],
      estimateByMonth: { '2026-01': 20_000 },
    });
    expect(currentPhaseId(result.initiative, process)).toBe('beta');
  });

  describe('the snapshot keeps what its figures came from (§6, §8.1)', () => {
    const cai: Person = {
      id: 'cai',
      name: 'Cai Wu',
      countryId: 'de',
      roleId: 'dev',
      capacityPct: 100,
      active: true,
      customRole: { active: true, label: 'Fractional CTO', costFactor: 1.5, dayRatesByYear: [{ year: 2026, dayRate: 1200 }] },
    };
    // Mid-month to mid-month, so the first and last months are prorated; a cost item adds to the estimate too.
    const alpha = {
      startDate: '2026-01-15',
      endDate: '2026-03-13',
      allocations: [
        { id: 'a1', personId: 'ana', allocationPct: 60 },
        { id: 'a2', personId: 'cai', allocationPct: 25 },
        { id: 'a3', personId: 'gone', allocationPct: 10 },
      ],
      costItems: [{ id: 'c1', label: 'Licences', amount: 900, timing: 'spread' as const }],
    };
    const pass = () => {
      const beta = { startDate: '2026-04-01', endDate: '2026-04-30', allocations: [{ id: 'b1', personId: 'ana', allocationPct: 50 }] };
      const initiative = withChecklistItem(planned({ phases: { alpha, beta } }), 'alpha', 'a1', 'complete', '');
      const result = passGate(process, initiative, [ana, cai], data, tracks, takenAt);
      if (!result.ok) throw new Error('expected the gate to pass');
      return result.initiative.gates!.alpha.frozenSnapshot!;
    };

    it('holds the person, role, country, cost factor, and each month’s days counted and day rate', () => {
      const [anaFrozen, caiFrozen, gone] = pass().allocations;
      expect(anaFrozen).toMatchObject({ personName: 'Ana Ruiz', roleName: 'Developer', countryName: 'Germany', costFactor: 1 });
      expect(Object.keys(anaFrozen.months!)).toEqual(['2026-01', '2026-02', '2026-03']);
      expect(anaFrozen.months!['2026-02']).toEqual({ workingDays: 20, dayRate: 1000 });
      expect(anaFrozen.months!['2026-01'].workingDays).toBeLessThan(20); // prorated
      expect(caiFrozen).toMatchObject({ personName: 'Cai Wu', roleName: 'Fractional CTO', countryName: 'Germany', costFactor: 1.5 });
      expect(caiFrozen.months!['2026-02']).toEqual({ workingDays: 20, dayRate: 1200 });
      expect(gone).toEqual({ id: 'a3', personId: 'gone', allocationPct: 10, cost: 0 });
    });

    it('recomputes to the stored estimate from the snapshot alone', () => {
      const snapshot = pass();
      const recomputed: Record<string, number> = {};
      for (const a of snapshot.allocations) {
        for (const [month, { workingDays, dayRate }] of Object.entries(a.months ?? {})) {
          recomputed[month] = (recomputed[month] ?? 0) + workingDays * (a.allocationPct / 100) * dayRate * a.costFactor!;
        }
        const cost = Object.values(a.months ?? {}).reduce((sum, m) => sum + m.workingDays * (a.allocationPct / 100) * m.dayRate * (a.costFactor ?? 0), 0);
        expect(cost).toBeCloseTo(a.cost, 6);
      }
      for (const month of Object.keys(recomputed)) recomputed[month] += 300; // the cost item, spread over three months
      expect(Object.keys(recomputed)).toEqual(Object.keys(snapshot.estimateByMonth));
      for (const [month, amount] of Object.entries(snapshot.estimateByMonth)) expect(recomputed[month]).toBeCloseTo(amount, 6);
    });

    it('is a value of its own: a later rate or person change leaves it as it was', () => {
      const snapshot = pass();
      const before = structuredClone(snapshot);
      countries[0].ratesByYear[0].dayRate = 2000;
      ana.name = 'Ana Ruiz-Ortega';
      try {
        expect(snapshot).toEqual(before);
      } finally {
        countries[0].ratesByYear[0].dayRate = 1000;
        ana.name = 'Ana Ruiz';
      }
    });
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

describe('skipGate (§8.2)', () => {
  it('records the trimmed reason and the checklist, bypassing both checks, with no date, figure, track or snapshot', () => {
    // Alpha's checklist item is Incomplete and Beta has no estimate: both would block a pass.
    const result = skipGate(process, planned(), '  Problem validated in the Q2 pilot.  ');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.initiative.gates!.alpha).toEqual({
      outcome: 'skipped',
      skipReason: 'Problem validated in the Q2 pilot.',
      checklist: [{ id: 'a1', name: 'Business case approved', description: '', status: 'incomplete', note: '' }],
    });
    expect(currentPhaseId(result.initiative, process)).toBe('beta');
    expect(lastCostedPassedGate(process, result.initiative)).toBeNull();
    expect(result.initiative.phases).toEqual(planned().phases);
  });

  it('does not carry a skipped gate\'s Tentative items forward', () => {
    const result = skipGate(process, withChecklistItem(planned(), 'alpha', 'a1', 'tentative', 'Draft only'), 'Not applicable');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(carriedForwardItems(process, result.initiative, 'beta')).toEqual([]);
  });

  it('refuses a blank reason, a non-skippable gate and an On Hold initiative', () => {
    expect(skipGate(process, planned(), '   ')).toEqual({ ok: false, reason: 'Skipping G1 needs a reason.' });
    const atBeta = planned({ gates: { ...planned().gates, alpha: { outcome: 'passed', passedOn: '2026-01-31', checklist: [] } } });
    expect(skipGate(process, atBeta, 'Because')).toEqual({ ok: false, reason: 'G2 cannot be skipped.' });
    expect(skipGate(process, planned({ status: 'On Hold' }), 'Because')).toEqual({ ok: false, reason: 'Checkout Redesign is on hold. Resume it to skip G1.' });
  });

  it('closes the initiative when the final gate is skippable and skipped', () => {
    const skippableFinal = process.map((p) => (p.id === 'gamma' ? { ...p, exitGate: { ...p.exitGate, skippable: true } } : p));
    const passed = { outcome: 'passed' as const, passedOn: '2026-01-01', checklist: [] };
    const result = skipGate(skippableFinal, planned({ gates: { discovery: passed, alpha: passed, beta: passed } }), 'Rolled out by the vendor');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.initiative.status).toBe('Closed');
  });

  it('is reversed by reopenGate, which removes the record', () => {
    const result = skipGate(process, planned(), 'Not applicable');
    if (!result.ok) throw new Error('expected a skip');
    const reopened = reopenGate(process, result.initiative);
    expect(reopened?.phase.id).toBe('alpha');
    expect(reopened?.initiative.gates?.alpha).toBeUndefined();
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
    const found = lastCostedPassedGate(process, planned({ gates }));
    expect(found?.phase.id).toBe('alpha');
    expect(found?.record.recordedGrandEstimate).toBe(20_000);
  });
});
