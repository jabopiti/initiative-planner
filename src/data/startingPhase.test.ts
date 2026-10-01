import { describe, expect, it } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { buildDefaultPlan } from './defaultPlan';
import { frozenPaths } from './frozen';
import { currentPhaseId, reopenGate } from './gate';
import { canChooseStartingPhase, gatesBehindLabel, hasStartingPhase, isUntouched, startAtPhase, startingPhaseChoices } from './startingPhase';
import type { Initiative } from './types';

// Discovery (G1, skippable) → Validation (costed, 3 mo, G2 skippable) → Development (costed, 6 mo, G3 not skippable) → Rollout (G4, final).
const process = defaultBrandPack.process;
const created = '2026-03-02';
const today = '2026-10-01';
const fresh = (): Initiative => ({ id: 'i1', name: 'Checkout Redesign', teamId: 'platform', status: 'Active', phases: buildDefaultPlan(process, created), defaultPlan: true });
const REASON = 'In development since May, before the tool.';
// Development's default six months, chained from today.
const DEVELOPMENT_FROM_TODAY = { development: { startDate: today, endDate: '2027-03-31', allocations: [] } };

function start(initiative: Initiative, phaseId: string, reason = REASON): Initiative {
  const result = startAtPhase(process, initiative, phaseId, reason, today);
  if (!result.ok) throw new Error(result.reason);
  return result.initiative;
}

describe('isUntouched (§8.2)', () => {
  it('is untouched with the default plan only, and the action is offered', () => {
    expect(isUntouched(fresh())).toBe(true);
    expect(canChooseStartingPhase(fresh())).toBe(true);
  });

  it('stays untouched after a description, owner or team change', () => {
    expect(isUntouched({ ...fresh(), description: 'New checkout', ownerId: 'mara', teamId: 'growth', name: 'Checkout v2' })).toBe(true);
  });

  it('is untouched with no plan at all (a process without default durations)', () => {
    expect(isUntouched({ id: 'i1', name: 'X', teamId: 't', status: 'Active' })).toBe(true);
  });

  it.each<[string, (i: Initiative) => Initiative]>([
    ['an edited period', (i) => ({ ...i, defaultPlan: undefined })],
    ['an allocation', (i) => ({ ...i, defaultPlan: undefined, phases: { validation: { allocations: [{ id: 'a', personId: 'p', allocationPct: 50 }] } } })],
    ['a cost item', (i) => ({ ...i, defaultPlan: undefined, phases: { validation: { allocations: [], costItems: [{ id: 'c', label: 'Licence', amount: 100, timing: 'spread' }] } } })],
    ['an actual', (i) => ({ ...i, defaultPlan: undefined, phases: { validation: { allocations: [], actualMonths: { '2026-09': 1000 } } } })],
    ['a checklist status', (i) => ({ ...i, checklist: { discovery: { 'g1-problem-statement': { status: 'complete', note: '' } } } })],
    ['a passed gate', (i) => ({ ...i, gates: { discovery: { outcome: 'passed', passedOn: today, checklist: [] } } })],
    ['a skipped gate', (i) => ({ ...i, gates: { discovery: { outcome: 'skipped', skipReason: 'n/a', checklist: [] } } })],
  ])('is touched by %s, and the action is absent', (_, touch) => {
    const touched = touch(fresh());
    expect(isUntouched(touched)).toBe(false);
    expect(canChooseStartingPhase(touched)).toBe(false);
  });

  it('is not offered on an On Hold initiative', () => {
    expect(canChooseStartingPhase({ ...fresh(), status: 'On Hold' })).toBe(false);
  });
});

describe('startAtPhase (§8.2)', () => {
  it('records G1 and G2 skipped with the reason and the marker; Development starts today, Validation has no period', () => {
    const next = start(fresh(), 'development');
    expect(next.gates?.discovery).toMatchObject({ outcome: 'skipped', skipReason: REASON, startingPhase: true });
    expect(next.gates?.validation).toMatchObject({ outcome: 'skipped', skipReason: REASON, startingPhase: true });
    expect(next.gates?.development).toBeUndefined();
    expect(next.gates?.discovery.passedOn).toBeUndefined();
    expect(currentPhaseId(next, process)).toBe('development');
    expect(next.phases).toEqual(DEVELOPMENT_FROM_TODAY);
    expect(next.defaultPlan).toBe(true);
    expect(isUntouched(next)).toBe(true);
    expect(hasStartingPhase(next)).toBe(true);
  });

  it('skips G3 too when Rollout is chosen, although it is not skippable, and keeps the final gate open', () => {
    const next = start(fresh(), 'rollout');
    expect(Object.keys(next.gates ?? {})).toEqual(['discovery', 'validation', 'development']);
    expect(next.gates?.development).toMatchObject({ outcome: 'skipped', startingPhase: true });
    expect(next.status).toBe('Active');
    expect(currentPhaseId(next, process)).toBe('rollout');
    // No costed phase from Rollout on: no periods, so no "Suggested dates" note either.
    expect(next.phases).toBeUndefined();
    expect(next.defaultPlan).toBeUndefined();
    expect(isUntouched(next)).toBe(true);
  });

  it('re-chains from the next costed phase when the starting phase changes: changing to Validation leaves only G1', () => {
    const atDevelopment = start(fresh(), 'development');
    const atValidation = start(atDevelopment, 'validation', 'Validated in spring');
    expect(Object.keys(atValidation.gates ?? {})).toEqual(['discovery']);
    expect(atValidation.gates?.discovery.skipReason).toBe('Validated in spring');
    expect(atValidation.phases).toEqual(buildDefaultPlan(process, today));
  });

  it('changing back to Discovery removes every starting-phase skip, needs no reason and re-chains from today', () => {
    const back = start(start(fresh(), 'development'), 'discovery', '');
    expect(back.gates).toBeUndefined();
    expect(back.phases).toEqual(buildDefaultPlan(process, today));
    expect(back.defaultPlan).toBe(true);
    expect(hasStartingPhase(back)).toBe(false);
  });

  it('can be changed again from Rollout, after its periods were removed', () => {
    const back = start(start(fresh(), 'rollout'), 'development');
    expect(back.phases).toEqual(DEVELOPMENT_FROM_TODAY);
    expect(Object.keys(back.gates ?? {})).toEqual(['discovery', 'validation']);
  });

  it('refuses a later phase without a reason, a touched initiative and a non-Active one', () => {
    expect(startAtPhase(process, fresh(), 'development', '  ', today)).toEqual({ ok: false, reason: 'Starting at Development needs a reason.' });
    expect(startAtPhase(process, { ...fresh(), defaultPlan: undefined }, 'development', REASON, today).ok).toBe(false);
    expect(startAtPhase(process, { ...fresh(), status: 'On Hold' }, 'development', REASON, today).ok).toBe(false);
  });

  it('is touched once an allocation is added; Reopen G2 then moves it back one gate', () => {
    const started = start(fresh(), 'development');
    const allocated: Initiative = { ...started, defaultPlan: undefined, phases: { development: { ...started.phases!.development, allocations: [{ id: 'a', personId: 'p', allocationPct: 50 }] } } };
    expect(canChooseStartingPhase(allocated)).toBe(false);
    const reopened = reopenGate(process, allocated)!;
    expect(reopened.phase.id).toBe('validation');
    expect(currentPhaseId(reopened.initiative, process)).toBe('validation');
  });
});

describe('startingPhaseChoices and gatesBehindLabel (§5.4)', () => {
  it('offers every phase but the current one, in process order', () => {
    expect(startingPhaseChoices(process, currentPhaseId(fresh(), process)).map((p) => p.id)).toEqual(['validation', 'development', 'rollout']);
    expect(startingPhaseChoices(process, currentPhaseId(start(fresh(), 'development'), process)).map((p) => p.id)).toEqual(['discovery', 'validation', 'rollout']);
  });

  it('names the gates a start records as skipped', () => {
    expect(gatesBehindLabel(process, 'discovery')).toBe('');
    expect(gatesBehindLabel(process, 'validation')).toBe('G1');
    expect(gatesBehindLabel(process, 'development')).toBe('G1 and G2');
    expect(gatesBehindLabel(process, 'rollout')).toBe('G1, G2 and G3');
  });
});

describe('frozenPaths and starting-phase skips (§10.5)', () => {
  it('does not pin a starting-phase skip, so changing it again merges', () => {
    const next = start(fresh(), 'development');
    expect(frozenPaths(next)).toEqual([]);
  });
});
