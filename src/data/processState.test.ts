import { describe, expect, it } from 'vitest';
import type { PhaseDef } from '../brand/types';
import { currentPhaseId, isPhaseConfirmed } from './processState';
import type { Initiative } from './types';

const TODAY = '2026-09-24';

const process: PhaseDef[] = [
  { id: 'discovery', label: 'Discovery', description: '', costed: false, exitGate: { id: 'g1', label: 'G1', description: '', requiresEstimates: false, skippable: true, checklistItems: [] } },
  { id: 'validation', label: 'Validation', description: '', costed: true, exitGate: { id: 'g2', label: 'G2', description: '', requiresEstimates: true, skippable: true, checklistItems: [] } },
];
const initiative = (gates?: Initiative['gates']): Initiative => ({ id: 'i1', name: 'Checkout', teamId: 't1', status: 'Active', gates });

describe('currentPhaseId (§4, §6)', () => {
  it('is the first phase when nothing has a gate record', () => {
    expect(currentPhaseId(initiative(), process)).toBe('discovery');
  });

  it('moves on once a phase’s exit gate is recorded, passed or skipped', () => {
    expect(currentPhaseId(initiative({ discovery: { outcome: 'passed', passedOn: TODAY, checklist: [] } }), process)).toBe('validation');
    expect(currentPhaseId(initiative({ discovery: { outcome: 'skipped', skipReason: 'n/a', checklist: [] } }), process)).toBe('validation');
  });

  it('stays at the last phase once every gate is recorded', () => {
    const gates = { discovery: { outcome: 'passed' as const, passedOn: TODAY, checklist: [] }, validation: { outcome: 'passed' as const, passedOn: TODAY, checklist: [] } };
    expect(currentPhaseId(initiative(gates), process)).toBe('validation');
  });
});

describe('isPhaseConfirmed (§4)', () => {
  it('is true for the current phase whatever its dates', () => {
    expect(isPhaseConfirmed('2027-08-01', true, TODAY)).toBe(true);
    expect(isPhaseConfirmed(undefined, true, TODAY)).toBe(true);
  });

  it('is true when the start falls in the current or the next calendar month, or earlier', () => {
    expect(isPhaseConfirmed('2026-09-01', false, TODAY)).toBe(true);
    expect(isPhaseConfirmed('2026-10-31', false, TODAY)).toBe(true);
    expect(isPhaseConfirmed('2026-06-15', false, TODAY)).toBe(true);
    expect(isPhaseConfirmed('2026-11-01', false, TODAY)).toBe(false);
  });

  it('compares months, so the 31st of a short next month cannot overflow', () => {
    expect(isPhaseConfirmed('2026-02-28', false, '2026-01-31')).toBe(true);
    expect(isPhaseConfirmed('2026-03-01', false, '2026-01-31')).toBe(false);
  });

  it('rolls the next month over the year end', () => {
    expect(isPhaseConfirmed('2027-01-31', false, '2026-12-15')).toBe(true);
    expect(isPhaseConfirmed('2027-02-01', false, '2026-12-15')).toBe(false);
  });

  it('is false for a phase with no start date that is not the current one', () => {
    expect(isPhaseConfirmed(undefined, false, TODAY)).toBe(false);
  });
});
