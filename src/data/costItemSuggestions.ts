import type { CostItem, Initiative } from './types';

/** One earlier cost item label, with the amount and timing of its most recent use (§5.11). */
export interface CostItemSuggestion {
  /** The most recent spelling, trimmed. */
  label: string;
  /** How many cost items, across all initiatives, carry this label. */
  uses: number;
  amount: number;
  timing: CostItem['timing'];
}

export const MAX_SUGGESTIONS = 5;

interface Group extends CostItemSuggestion {
  /** The latest phase start date among the uses; '' while no phase of a use has one. */
  startDate: string;
}

/**
 * Earlier cost item labels containing `typed` (§5.11): up to {@link MAX_SUGGESTIONS}, most used first, then
 * alphabetical. Labels group by trimmed, case-insensitive text. A group's amount and timing come from its most
 * recent use: the item in the phase with the latest start date, ties going to the later initiative in the list
 * and then to the later item. Cost items carry no creation date, so nothing newer can be known.
 */
export function suggestCostItems(initiatives: Initiative[], typed: string): CostItemSuggestion[] {
  const needle = typed.trim().toLowerCase();
  if (needle === '') return [];
  const groups = new Map<string, Group>();
  for (const initiative of initiatives) {
    for (const plan of Object.values(initiative.phases ?? {})) {
      for (const item of plan.costItems ?? []) {
        const label = item.label.trim();
        const key = label.toLowerCase();
        if (!key.includes(needle)) continue;
        const startDate = plan.startDate ?? '';
        const group = groups.get(key);
        // `>=`: an equal start date is a tie, and a later use wins it.
        if (!group || startDate >= group.startDate) {
          groups.set(key, { label, uses: (group?.uses ?? 0) + 1, amount: item.amount, timing: item.timing, startDate });
        } else {
          group.uses += 1;
        }
      }
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.uses - a.uses || a.label.localeCompare(b.label))
    .slice(0, MAX_SUGGESTIONS)
    .map(({ label, uses, amount, timing }) => ({ label, uses, amount, timing }));
}
