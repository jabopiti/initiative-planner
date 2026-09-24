import type { Allocation, Initiative, PhasePlan } from '../data/types';
import { mergeListField, mergeRecordFields } from './merge';

/** A same-field conflict inside an initiative file; `apply` writes the chosen side into a merged document. */
export interface InitiativeConflict {
  itemId: string;
  base: unknown;
  mine: unknown;
  theirs: unknown;
  apply: (doc: Initiative, chosen: unknown) => Initiative;
}

export interface InitiativeMergeOutcome {
  merged: Initiative;
  conflicts: InitiativeConflict[];
}

const emptyPlan: PhasePlan = { allocations: [] };

function withPhase(doc: Initiative, phaseId: string, change: (plan: PhasePlan) => PhasePlan): Initiative {
  const plan = doc.phases?.[phaseId] ?? emptyPlan;
  return { ...doc, phases: { ...doc.phases, [phaseId]: change(plan) } };
}

/**
 * Field-level three-way merge of one initiative file (§10.5): the initiative's own fields, each
 * phase's two dates, and each phase's allocations (a list merged by id). A same-field conflict is
 * never auto-resolved; the merged document holds the repository's value until the user chooses.
 */
export function mergeInitiative(base: Initiative, mine: Initiative, theirs: Initiative): InitiativeMergeOutcome {
  const conflicts: InitiativeConflict[] = [];

  // mergeRecordFields walks the keys of `mine`, so give all three sides the same keys: a field only
  // the repository's version has (an owner set elsewhere) must not be dropped.
  const fields = new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)]);
  fields.delete('phases');
  const flat = (doc: Initiative) => Object.fromEntries([...fields].map((f) => [f, (doc as unknown as Record<string, unknown>)[f]]));

  const top = mergeRecordFields(flat(base), flat(mine), flat(theirs));
  for (const c of top.conflicts) {
    conflicts.push({
      itemId: String(c.field),
      base: c.base,
      mine: c.mine,
      theirs: c.theirs,
      apply: (doc, chosen) => ({ ...doc, [c.field]: chosen }),
    });
  }
  let merged = { ...top.merged } as unknown as Initiative;

  const phaseIds = new Set([...Object.keys(base.phases ?? {}), ...Object.keys(mine.phases ?? {}), ...Object.keys(theirs.phases ?? {})]);
  for (const phaseId of phaseIds) {
    const b = base.phases?.[phaseId] ?? emptyPlan;
    const m = mine.phases?.[phaseId] ?? emptyPlan;
    const t = theirs.phases?.[phaseId] ?? emptyPlan;

    const dates = (p: PhasePlan) => ({ startDate: p.startDate, endDate: p.endDate });
    const mergedDates = mergeRecordFields(dates(b), dates(m), dates(t));
    for (const c of mergedDates.conflicts) {
      conflicts.push({
        itemId: `${phaseId}:${c.field}`,
        base: c.base,
        mine: c.mine,
        theirs: c.theirs,
        apply: (doc, chosen) => withPhase(doc, phaseId, (plan) => ({ ...plan, [c.field]: chosen })),
      });
    }

    const allocations = mergeListField<Allocation>(b.allocations, m.allocations, t.allocations);
    for (const c of allocations.conflicts) {
      conflicts.push({
        itemId: `${phaseId}:${c.itemId}`,
        base: c.base,
        mine: c.mine,
        theirs: c.theirs,
        apply: (doc, chosen) =>
          withPhase(doc, phaseId, (plan) => ({
            ...plan,
            allocations: plan.allocations.map((a) => (a.id === c.itemId ? (chosen as Allocation) : a)),
          })),
      });
    }

    merged = withPhase(merged, phaseId, () => {
      const plan: PhasePlan = { allocations: allocations.merged };
      if (mergedDates.merged.startDate !== undefined) plan.startDate = mergedDates.merged.startDate;
      if (mergedDates.merged.endDate !== undefined) plan.endDate = mergedDates.merged.endDate;
      return plan;
    });
  }

  return { merged, conflicts };
}
